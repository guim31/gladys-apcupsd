#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of a real apcupsd server, with the integration's own code:
//
//   node scripts/probe.mjs <host> [port]
//
// Sends the `status` command only (the NIS has no write command), then shows
// what the integration would make of the answer: the reading, the features of
// the Gladys device and their states. Nothing sensitive is printed: the
// serial number is masked, the host name and the raw status are not shown
// (only the field names apcupsd sent).
// -----------------------------------------------------------------------------

import { requestStatus } from '../src/nis.js';
import { readUps } from '../src/ups.js';
import { buildDevice, deviceStates, platformId } from '../src/devices.js';
import { DEFAULT_PORT } from '../src/config.js';
import { statusText } from '../src/i18n.js';

const [host, portText] = process.argv.slice(2);
if (!host) {
  console.error('Usage: node scripts/probe.mjs <host> [port]');
  process.exit(2);
}
const server = { host, port: portText ? Number(portText) : DEFAULT_PORT };

const mask = (value) =>
  value ? `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : value;
// The ids only matter for their shape here.
const gladys = {
  externalIds: (type, id) => ({
    device: `ext:probe:${type}:${mask(id)}`,
    feature: (key) => `ext:probe:${type}:${mask(id)}:${key}`,
  }),
};

const started = Date.now();
try {
  const status = await requestStatus(server, { timeoutMs: 5000 });
  const ups = readUps(status);
  console.log(
    `apcupsd answered in ${Date.now() - started} ms, ${Object.keys(status).length} fields:`,
  );
  console.log(`  ${Object.keys(status).join(' ')}`);
  console.log(`apcupsd version: ${status.VERSION ?? status.RELEASE ?? 'unknown'}`);
  console.log(`Model: ${ups.model ?? '(none)'}, serial: ${mask(ups.serial) ?? '(none)'}`);
  console.log(
    `STATUS words: ${[...ups.words].join(' ') || '(none)'} -> "${statusText(ups.words, 'en')}"`,
  );
  console.log(
    `Mains: ${ups.mains}, low battery: ${ups.lowBattery}, replace battery: ${ups.replaceBattery}`,
  );
  console.log(
    `Battery ${ups.batteryCharge} %, runtime ${ups.timeLeft} min, load ${ups.loadPct} %, ` +
      `nominal power ${ups.nominalPower ?? '(none)'} W, estimated power ${ups.power ?? '(none)'} W`,
  );
  const entry = { id: platformId(ups, server), ups };
  const device = buildDevice(gladys, entry, 'en');
  console.log(`\nGladys device "${device.name}" with ${device.features.length} features:`);
  const states = new Map(
    deviceStates(gladys, entry, { language: 'en', energyKwh: 0 }).map((s) => [
      s.device_feature_external_id,
      s.text ?? s.state,
    ]),
  );
  for (const feature of device.features) {
    const key = feature.external_id.split(':').pop();
    const value =
      key === 'serial' ? mask(states.get(feature.external_id)) : states.get(feature.external_id);
    console.log(
      `  ${key.padEnd(22)} ${`${feature.category}/${feature.type}`.padEnd(28)} ${feature.unit ?? ''}`.padEnd(
        62,
      ) + ` = ${value ?? '(no value)'}`,
    );
  }
} catch (err) {
  console.error(`apcupsd did not answer (${err.code ?? 'ERROR'}): ${err.message}`);
  if (err.code === 'REFUSED') {
    console.error('Is the network server on and listening on the network (NISIP 0.0.0.0)?');
  }
  process.exit(1);
}
