// -----------------------------------------------------------------------------
// One Gladys device per UPS (one apcupsd server monitors one UPS), and the
// states of its features.
//
// The feature keys below end up in the external ids: they never change. A
// feature is only published when the UPS reports its field (a Back-UPS has no
// internal temperature, an old Smart-UPS no nominal power). Every feature is
// read-only: apcupsd's network server cannot send commands, and switching a
// UPS off from a dashboard would be a dangerous button anyway.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { DEFAULT_DEVICE_NAME, NAMES, pick, statusText, transferReasonText } from './i18n.js';

export const DEVICE_TYPE = 'ups';

// Fallback poll of the core (see src/monitor.js): the container polls by
// itself, at the configured pace.
export const CORE_POLL_FREQUENCY = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES;

const roundUp = (value, step) => Math.ceil(value / step) * step;

/** Upper display bound of a voltage, from the nominal value or the reading. */
function voltageMax(nominal, reading, fallback) {
  const base = nominal ?? reading;
  return base > 0 ? roundUp(base * 1.5, 10) : fallback;
}

const text = (value) => (typeof value === 'string' && value.trim() ? { text: value } : undefined);
const round = (value, digits) => (value === undefined ? undefined : Number(value.toFixed(digits)));

// Feature catalog. `present` tells, from a reading, whether the UPS reports
// the field; `state` gives the value to publish (undefined: nothing to say).
export const FEATURES = [
  {
    name: 'status',
    key: 'status',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    present: () => true,
    state: (ups, { language }) => (ups.known ? text(statusText(ups.words, language)) : undefined),
  },
  {
    // 1 = on mains, 0 = on battery (power outage). Gladys shows "On"/"Off".
    name: 'mains',
    key: 'mains',
    category: C.INPUT,
    type: T.INPUT.BINARY,
    min: 0,
    max: 1,
    keepHistory: true,
    present: () => true,
    state: (ups) => ups.mains,
  },
  {
    name: 'lowBattery',
    key: 'low-battery',
    category: C.BATTERY_LOW,
    type: T.BATTERY_LOW.BINARY,
    min: 0,
    max: 1,
    keepHistory: true,
    present: () => true,
    state: (ups) => (ups.lowBattery === undefined ? undefined : Number(ups.lowBattery)),
  },
  {
    name: 'battery',
    key: 'battery',
    category: C.BATTERY,
    type: T.BATTERY.INTEGER,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    keepHistory: true,
    present: (ups) => ups.batteryCharge !== undefined,
    state: (ups) => round(ups.batteryCharge, 0),
  },
  {
    name: 'runtime',
    key: 'runtime',
    category: C.DURATION,
    type: T.DURATION.DECIMAL,
    unit: U.MINUTES,
    min: 0,
    max: 10000,
    keepHistory: true,
    present: (ups) => ups.timeLeft !== undefined,
    state: (ups) => round(ups.timeLeft, 1),
  },
  {
    // Gladys has no "load" category: the generic one, in percent.
    name: 'load',
    key: 'load',
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    keepHistory: true,
    present: (ups) => ups.loadPct !== undefined,
    state: (ups) => round(ups.loadPct, 1),
  },
  {
    // Estimated: load × nominal power. Not a measurement.
    name: 'power',
    key: 'power',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: (ups) => ups.nominalPower,
    keepHistory: true,
    present: (ups) => ups.power !== undefined,
    state: (ups) => ups.power,
  },
  {
    // Cumulative index integrated from the power by the container (see
    // src/energy.js): Gladys derives the consumption and its cost from it.
    name: 'energy',
    key: 'energy',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.ENERGY,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 1000000,
    keepHistory: true,
    present: (ups) => ups.power !== undefined,
    state: (_ups, { energyKwh }) => round(energyKwh, 3),
  },
  {
    name: 'inputVoltage',
    key: 'input-voltage',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.VOLTAGE,
    unit: U.VOLT,
    min: 0,
    max: (ups) => voltageMax(ups.nominalInputVoltage, ups.inputVoltage, 300),
    keepHistory: true,
    present: (ups) => ups.inputVoltage !== undefined,
    state: (ups) => round(ups.inputVoltage, 1),
  },
  {
    name: 'outputVoltage',
    key: 'output-voltage',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.VOLTAGE,
    unit: U.VOLT,
    min: 0,
    max: (ups) => voltageMax(ups.nominalOutputVoltage, ups.outputVoltage, 300),
    keepHistory: true,
    present: (ups) => ups.outputVoltage !== undefined,
    state: (ups) => round(ups.outputVoltage, 1),
  },
  {
    name: 'batteryVoltage',
    key: 'battery-voltage',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.VOLTAGE,
    unit: U.VOLT,
    min: 0,
    max: (ups) => voltageMax(ups.nominalBatteryVoltage, ups.batteryVoltage, 100),
    keepHistory: true,
    present: (ups) => ups.batteryVoltage !== undefined,
    state: (ups) => round(ups.batteryVoltage, 1),
  },
  {
    name: 'temperature',
    key: 'temperature',
    category: C.DEVICE_TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -20,
    max: 80,
    keepHistory: true,
    present: (ups) => ups.temperature !== undefined,
    state: (ups) => round(ups.temperature, 1),
  },
  {
    name: 'timeOnBattery',
    key: 'time-on-battery',
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.SECONDS,
    min: 0,
    max: 1000000,
    keepHistory: true,
    present: (ups) => ups.timeOnBattery !== undefined,
    state: (ups) => round(ups.timeOnBattery, 0),
  },
  {
    name: 'totalTimeOnBattery',
    key: 'total-time-on-battery',
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.SECONDS,
    min: 0,
    max: 1000000000,
    keepHistory: true,
    present: (ups) => ups.totalTimeOnBattery !== undefined,
    state: (ups) => round(ups.totalTimeOnBattery, 0),
  },
  {
    // Resets when apcupsd restarts.
    name: 'transfers',
    key: 'transfers',
    category: C.COUNTER_SENSOR,
    type: T.SENSOR.INTEGER,
    min: 0,
    max: 1000000,
    keepHistory: true,
    present: (ups) => ups.transfers !== undefined,
    state: (ups) => round(ups.transfers, 0),
  },
  {
    name: 'lastTransfer',
    key: 'last-transfer',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    present: (ups) => ups.reportsTransferDate,
    state: (ups) => text(ups.lastTransferAt),
  },
  {
    name: 'lastTransferReason',
    key: 'last-transfer-reason',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    present: (ups) => ups.lastTransferReason !== undefined,
    state: (ups, { language }) => text(transferReasonText(ups.lastTransferReason, language)),
  },
  {
    name: 'batteryDate',
    key: 'battery-date',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    present: (ups) => ups.batteryDate !== undefined,
    state: (ups) => text(ups.batteryDate),
  },
  {
    name: 'model',
    key: 'model',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    present: (ups) => ups.model !== undefined,
    state: (ups) => text(ups.model),
  },
  {
    name: 'serial',
    key: 'serial',
    category: C.TEXT,
    type: T.TEXT.TEXT,
    present: (ups) => ups.serial !== undefined,
    state: (ups) => text(ups.serial),
  },
];

export const FEATURE_KEYS = Object.fromEntries(FEATURES.map((f) => [f.name, f.key]));

/**
 * The stable id of a UPS: its serial number; for the rare UPS without one,
 * the server address (the device then follows the address).
 * @param {{ serial?: string }} ups
 * @param {{ host: string, port: number }} server
 */
export function platformId(ups, server) {
  const raw = ups.serial ?? `${server.host}-${server.port}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * @param {object} gladys GladysIntegration
 * @param {string} id platform id
 */
export function deviceIds(gladys, id) {
  return gladys.externalIds(DEVICE_TYPE, id);
}

/**
 * The device Gladys shows in its Discovery tab.
 * @param {object} gladys
 * @param {{ id: string, ups: object }} entry
 * @param {string} language
 */
export function buildDevice(gladys, { id, ups }, language) {
  const ids = deviceIds(gladys, id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: ups.name ?? pick(DEFAULT_DEVICE_NAME, language),
    external_id: ids.device,
    should_poll: true,
    poll_frequency: CORE_POLL_FREQUENCY,
    features: FEATURES.filter((feature) => feature.present(ups)).map((feature) => {
      const isText = feature.category === C.TEXT;
      const max = typeof feature.max === 'function' ? feature.max(ups) : feature.max;
      return {
        name: names[feature.name],
        external_id: ids.feature(feature.key),
        category: feature.category,
        type: feature.type,
        ...(feature.unit ? { unit: feature.unit } : {}),
        // NOT NULL in Gladys, text features included (422 otherwise).
        min: isText ? 0 : feature.min,
        max: isText ? 0 : max,
        read_only: true,
        has_feedback: false,
        keep_history: !isText && feature.keepHistory === true,
      };
    }),
  };
}

/**
 * The states of a UPS device, in the `publishStates` format.
 * @param {object} gladys
 * @param {{ id: string, ups: object }} entry
 * @param {{ language: string, energyKwh?: number }} context
 */
export function deviceStates(gladys, { id, ups }, context) {
  const ids = deviceIds(gladys, id);
  const states = [];
  for (const feature of FEATURES) {
    if (!feature.present(ups)) {
      continue;
    }
    const value = feature.state(ups, context);
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
      continue;
    }
    const externalId = ids.feature(feature.key);
    states.push(
      typeof value === 'object'
        ? { device_feature_external_id: externalId, text: value.text }
        : { device_feature_external_id: externalId, state: value },
    );
  }
  return states;
}
