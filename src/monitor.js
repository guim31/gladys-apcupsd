// -----------------------------------------------------------------------------
// The monitor: reads every configured apcupsd server on its own timer,
// publishes the devices and their states, fires the scene triggers and keeps
// the connection status of the Configuration screen.
//
// Why a timer of its own: the core cannot be trusted to poll external devices
// (GladysAssistant/Gladys#3198, not fixed in 5.2.1: a device keeps the
// polling fields it was created with). The devices still carry
// `should_poll: true` and a valid `poll_frequency`, so the core's onPoll is a
// fallback; it skips a server read less than 90 % of a period ago, and the
// timer skips one read less than half a period ago (by the core).
//
// Every configured server is read, whether its device was added to Gladys or
// not: the scene triggers fire for any UPS. States are only published for
// the devices the user added (the core drops the others).
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { requestStatus as nisRequestStatus } from './nis.js';
import { readUps } from './ups.js';
import { buildDevice, deviceIds, deviceStates, platformId } from './devices.js';
import { createEnergyMeter } from './energy.js';
import { detectTransitions, eventData, TRIGGER } from './triggers.js';
import { createIssueLog } from './issues.js';
import { MESSAGES, REPORT_TEXT, STATUS_LABELS } from './i18n.js';
import { LANGUAGES } from './config.js';

const logger = createLogger({ name: 'apcupsd' });

// A stable value is sent again this often, so Gladys never shows "no recent
// value" (it does past 48 h).
export const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// The energy index is written to /data at most this often (SD cards).
export const ENERGY_SAVE_MS = 10 * 60 * 1000;
export const WIDGET_KEY = 'ups';

const EVENT_LOG = {
  [TRIGGER.POWER_OUTAGE]: 'power outage, running on battery',
  [TRIGGER.POWER_RESTORED]: 'mains power restored',
  [TRIGGER.BATTERY_LOW]: 'battery low',
  [TRIGGER.REPLACE_BATTERY]: 'battery needs replacing',
};

const DEGRADED_MESSAGE = Object.fromEntries(
  LANGUAGES.map((language) => [language, STATUS_LABELS.COMMLOST[language]]),
);

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {import('./store.js').Store} options.store
   * @param {Function} [options.requestStatus] NIS client (tests)
   * @param {boolean} [options.timers] run the periodic timer
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, requestStatus = nisRequestStatus, timers = true, now = Date.now }) {
    this.gladys = gladys;
    this.store = store;
    this.requestStatus = requestStatus;
    this.timers = timers;
    this.now = now;
    this.config = null;
    /** @type {Map<string, object>} by server key */
    this.entries = new Map();
    this.memory = { servers: {}, energy: {}, power: {} };
    this.meters = new Map();
    this.transports = new Map();
    this.lastConnectionStatus = null;
    this.lastEnergySave = 0;
    this.issues = createIssueLog(logger);
    this.timer = null;
    this.stopped = false;
    this.loaded = false;
  }

  // --- Lifecycle ----------------------------------------------------------

  /** First start, or a new configuration. */
  async start(config) {
    if (!this.loaded) {
      const saved = await this.store.load();
      this.memory = {
        servers: saved.servers ?? {},
        energy: saved.energy ?? {},
        power: saved.power ?? {},
      };
      this.loaded = true;
    }
    this.stopped = false;
    this.applyConfig(config);
    await this.cycle({ force: true });
    await this.publishDevices();
    this.schedule();
  }

  /** The configuration changed: other servers, another pace or language. */
  async reconfigure(config) {
    this.lastConnectionStatus = null;
    await this.start(config);
  }

  /** Gladys came back: it may have lost the states, the devices, the status. */
  async resync() {
    this.lastConnectionStatus = null;
    this.transports.clear();
    this.gladys.forgetPublishedStates();
    await this.cycle({ force: true });
    await this.publishDevices();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.saveMemory();
    await this.store.flush();
  }

  applyConfig(config) {
    this.config = config;
    const keys = new Set(config.servers.map((server) => server.key));
    for (const key of this.entries.keys()) {
      if (!keys.has(key)) {
        this.entries.delete(key);
      }
    }
    for (const server of config.servers) {
      if (!this.entries.has(server.key)) {
        const saved = this.memory.servers[server.key];
        const entry = { server, readAt: 0, error: null, inFlight: null, announced: false };
        if (saved?.status) {
          // Known from a previous run: its device stays listed while the
          // server is down.
          entry.ups = readUps(saved.status);
          entry.id = platformId(entry.ups, server);
          entry.stale = true;
        }
        this.entries.set(server.key, entry);
      }
    }
    for (const invalid of config.invalidServers) {
      logger.warn(`Ignored server entry "${invalid}": expected host or host:port`);
    }
    logger.info(
      `Monitoring ${config.servers.length} apcupsd server(s), every ${config.pollIntervalMs / 1000} s`,
    );
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.timers || this.stopped) {
      return;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.cycle();
      } catch (err) {
        logger.error(`Polling cycle failed: ${err.message}`);
      } finally {
        this.schedule();
      }
    }, this.config.pollIntervalMs);
  }

  // --- Reading ------------------------------------------------------------

  /** Read every server (in parallel), then report the connection status. */
  async cycle({ force = false } = {}) {
    if (this.gladys.connected === false) {
      logger.debug('Gladys unreachable: poll skipped');
      return;
    }
    await Promise.all(
      [...this.entries.values()].map((entry) => this.read(entry, { force, minGap: 0.5 })),
    );
    await this.reportConnection();
  }

  /**
   * Read one server, unless it was read less than `minGap` periods ago.
   * Never throws: a failure is remembered on the entry and logged once.
   */
  async read(entry, { force = false, minGap = 0.5 } = {}) {
    if (entry.inFlight) {
      return entry.inFlight;
    }
    const elapsed = this.now() - entry.readAt;
    if (!force && entry.readAt && elapsed < this.config.pollIntervalMs * minGap) {
      logger.debug(`${entry.server.key}: read ${elapsed} ms ago, skipped`);
      return undefined;
    }
    entry.readAt = this.now();
    entry.inFlight = (async () => {
      try {
        const status = await this.requestStatus(entry.server);
        await this.handleStatus(entry, status);
      } catch (err) {
        this.handleFailure(entry, err);
      }
    })();
    try {
      return await entry.inFlight;
    } finally {
      entry.inFlight = null;
    }
  }

  handleFailure(entry, err) {
    entry.error = err;
    this.issues.fail(entry.server.key, `${entry.server.key}: apcupsd unreachable (${err.message})`);
    this.publishTransport(entry, { transport: DEVICE_TRANSPORTS.UNREACHABLE });
  }

  async handleStatus(entry, status) {
    const at = this.now();
    const ups = readUps(status);
    const id = platformId(ups, entry.server);
    const wasFailing = entry.error !== null;
    entry.error = null;
    entry.stale = false;
    entry.ups = ups;
    entry.id = id;
    entry.status = status;
    this.issues.ok(entry.server.key, `${entry.server.key}: apcupsd answers again`);
    if (!entry.announced) {
      entry.announced = true;
      logger.info(
        `${entry.server.key}: ${ups.model ?? 'UPS'}${ups.serial ? ` (serial ${ups.serial})` : ''}`,
      );
    }
    if (ups.commLost) {
      this.issues.fail(`${entry.server.key}:commlost`, `${entry.server.key}: apcupsd lost the UPS`);
    } else {
      this.issues.ok(
        `${entry.server.key}:commlost`,
        `${entry.server.key}: apcupsd sees the UPS again`,
      );
    }
    this.rememberServer(entry);

    // Energy, integrated whether the device is added or not: the index is
    // ready the day it is.
    const meter = this.meter(id);
    if (ups.power !== undefined) {
      meter.add(ups.power, at);
      this.memory.energy[id] = meter.toJSON();
    }

    if (at - this.lastEnergySave >= ENERGY_SAVE_MS) {
      this.saveMemory();
    }

    await this.fireTriggers(entry, at);

    if (!this.createdDevice(id)) {
      return;
    }
    this.publishTransport(
      entry,
      ups.commLost
        ? { transport: DEVICE_TRANSPORTS.LOCAL, degraded: true, message: DEGRADED_MESSAGE }
        : { transport: DEVICE_TRANSPORTS.LOCAL },
      wasFailing,
    );
    await this.publishStates(entry);
  }

  meter(id) {
    let meter = this.meters.get(id);
    if (!meter) {
      meter = createEnergyMeter(this.memory.energy[id]);
      this.meters.set(id, meter);
    }
    return meter;
  }

  /** Keep the last status of the server when what it describes changed. */
  rememberServer(entry) {
    const saved = this.memory.servers[entry.server.key];
    const signature = (status) =>
      JSON.stringify([
        Object.keys(status).sort(),
        status.SERIALNO,
        status.UPSNAME,
        status.MODEL,
        status.APCMODEL,
        status.NOMPOWER,
      ]);
    if (!saved?.status || signature(saved.status) !== signature(entry.status)) {
      this.memory.servers[entry.server.key] = { status: entry.status };
      this.saveMemory();
    }
  }

  saveMemory() {
    this.lastEnergySave = this.now();
    return this.store.save(this.memory);
  }

  async fireTriggers(entry, at) {
    const { events, next } = detectTransitions(this.memory.power[entry.id], entry.ups, at);
    const previous = this.memory.power[entry.id];
    this.memory.power[entry.id] = next;
    const changed =
      !previous ||
      previous.mains !== next.mains ||
      previous.lowBattery !== next.lowBattery ||
      previous.replaceBattery !== next.replaceBattery;
    if (changed) {
      this.saveMemory();
      if (this.createdDevice(entry.id)) {
        // The widget status is not a live tile: ask for a fresh content.
        this.gladys.requestWidgetRefresh(WIDGET_KEY);
      }
    }
    for (const event of events) {
      const name = this.deviceName(entry);
      logger.info(`${name} (${entry.server.key}): ${EVENT_LOG[event.key]}`);
      const data = eventData(event, {
        deviceExternalId: deviceIds(this.gladys, entry.id).device,
        deviceName: name,
        ups: entry.ups,
      });
      try {
        await this.gladys.publishSceneEvent(event.key, data);
        this.issues.ok('scene-event', 'Scene events accepted again');
      } catch (err) {
        this.issues.fail('scene-event', `Scene event ${event.key} refused: ${err.message}`);
      }
    }
  }

  async publishStates(entry) {
    const states = deviceStates(
      this.gladys,
      { id: entry.id, ups: entry.ups },
      { language: this.config.language, energyKwh: this.meter(entry.id).kwh },
    );
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: STATE_HEARTBEAT_MS,
      });
      logger.debug(`${entry.server.key}: ${count} state(s) published`);
      this.issues.ok('states', 'States accepted again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed: ${err.message}`);
    }
  }

  /** Transport badge of an added device, sent when it changes. */
  publishTransport(entry, value, force = false) {
    if (!entry.id || !this.createdDevice(entry.id)) {
      return;
    }
    const externalId = deviceIds(this.gladys, entry.id).device;
    const signature = JSON.stringify(value);
    if (!force && this.transports.get(externalId) === signature) {
      return;
    }
    this.transports.set(externalId, signature);
    this.gladys.publishTransports([{ external_id: externalId, ...value }]).catch((err) => {
      this.transports.delete(externalId);
      logger.debug(`Transport badge refused: ${err.message}`);
    });
  }

  // --- Gladys side --------------------------------------------------------

  createdDevice(id) {
    const externalId = deviceIds(this.gladys, id).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === externalId);
  }

  deviceName(entry) {
    return this.createdDevice(entry.id)?.name ?? entry.ups?.name ?? entry.server.key;
  }

  /** The devices of the Discovery tab: one per UPS, each id once. */
  discoveredDevices() {
    const devices = [];
    const seen = new Map();
    for (const entry of this.entries.values()) {
      if (!entry.ups) {
        continue;
      }
      if (seen.has(entry.id)) {
        // Two servers report the same UPS (an apcupsd network client).
        this.issues.fail(
          `duplicate:${entry.server.key}`,
          `${entry.server.key} reports the same UPS as ${seen.get(entry.id)}: listed once`,
        );
        continue;
      }
      seen.set(entry.id, entry.server.key);
      devices.push(buildDevice(this.gladys, entry, this.config.language));
    }
    return devices;
  }

  async publishDevices() {
    try {
      await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
      this.issues.ok('discovery', 'Devices published again');
    } catch (err) {
      this.issues.fail('discovery', `Publishing the devices failed: ${err.message}`);
    }
  }

  /** The Discovery tab asks for a fresh list: read every server now. */
  async rediscover() {
    await this.cycle({ force: true });
    await this.publishDevices();
  }

  /** The core's onPoll (fallback): reads the server unless the timer just did. */
  async pollFromCore(device) {
    const entry = this.entryByExternalId(device.external_id);
    if (!entry) {
      logger.debug(`onPoll ignored for ${device.external_id}: no configured server`);
      return;
    }
    await this.read(entry, { minGap: 0.9 });
  }

  /**
   * The user added (or updated) a device: the SDK forgot its states, send
   * them all now rather than a period later.
   */
  async onDeviceCreated(device) {
    this.transports.delete(device.external_id);
    const entry = this.entryByExternalId(device.external_id);
    if (entry) {
      await this.read(entry, { force: true });
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  entryByExternalId(externalId) {
    return [...this.entries.values()].find(
      (entry) => entry.id && deviceIds(this.gladys, entry.id).device === externalId,
    );
  }

  // --- Reports ------------------------------------------------------------

  /** The connection status of the Configuration screen, sent on change. */
  async reportConnection() {
    let status;
    if (this.config.servers.length === 0) {
      status = { connected: false, message: MESSAGES.notConfigured };
    } else {
      const failing = [...this.entries.values()].filter((entry) => entry.error);
      status =
        failing.length === 0
          ? { connected: true }
          : { connected: false, message: this.failureMessage(failing) };
    }
    const signature = JSON.stringify(status);
    if (signature === this.lastConnectionStatus) {
      return;
    }
    this.lastConnectionStatus = signature;
    await this.gladys.setConnectionStatus(status.connected, status.message).catch((err) => {
      this.lastConnectionStatus = null;
      logger.debug(`Connection status refused: ${err.message}`);
    });
  }

  failureMessage(failing) {
    return Object.fromEntries(
      LANGUAGES.map((language) => {
        const text = REPORT_TEXT[language];
        const list = failing
          .slice(0, 2)
          .map(
            (entry) => `${entry.server.key} (${text.hint[entry.error.code] ?? text.hint.NETWORK})`,
          )
          .join(', ');
        return [language, `${text.unreachable(failing.length, this.entries.size)} ${list}`];
      }),
    );
  }

  /** What the "Check the servers" button shows, in every language. */
  async checkServers() {
    await this.rediscover();
    return Object.fromEntries(LANGUAGES.map((language) => [language, this.serverReport(language)]));
  }

  serverReport(language) {
    const text = REPORT_TEXT[language];
    const lines = [];
    if (this.entries.size === 0) {
      lines.push(text.none);
    }
    for (const entry of this.entries.values()) {
      if (entry.error) {
        lines.push(`${entry.server.key}: ${text.hint[entry.error.code] ?? text.hint.NETWORK}.`);
      } else if (entry.ups) {
        const label = entry.ups.model ?? entry.ups.name ?? 'UPS';
        lines.push(`${entry.server.key}: ${label}, ${text.ok}.`);
      }
    }
    if (this.config.invalidServers.length > 0) {
      lines.push(text.invalid(this.config.invalidServers.slice(0, 3).join(', ')));
    }
    return lines.join(' ');
  }

  /** The readings of the added devices, for the widget. */
  createdEntries() {
    return [...this.entries.values()].filter((entry) => entry.id && this.createdDevice(entry.id));
  }
}
