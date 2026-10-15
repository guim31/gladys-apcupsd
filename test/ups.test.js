import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventDate, parseNumber, readUps, statusWords } from '../src/ups.js';
import { loadFixture } from './helpers/fakeNis.js';
import { withStatus } from './helpers/world.js';

const backUps = await loadFixture('back-ups-es-600');
const smartUps = await loadFixture('smart-ups-1400');
const minimal = await loadFixture('minimal-3.8.5');

test('a Back-UPS on mains reads as such', () => {
  const ups = readUps(backUps);
  assert.equal(ups.name, 'MyUPS');
  assert.equal(ups.model, 'Back-UPS ES 600');
  assert.equal(ups.serial, '3B0000X00001');
  assert.equal(ups.mains, 1);
  assert.equal(ups.lowBattery, false);
  assert.equal(ups.replaceBattery, false);
  assert.equal(ups.batteryCharge, 100);
  assert.equal(ups.timeLeft, 51);
  assert.equal(ups.loadPct, 14);
  assert.equal(ups.nominalPower, 330);
  assert.equal(ups.power, 46); // 14 % of 330 W
  assert.equal(ups.inputVoltage, 124);
  assert.equal(ups.batteryVoltage, 13.7);
  assert.equal(ups.temperature, 34.6);
  assert.equal(ups.transfers, 1);
  assert.equal(ups.totalTimeOnBattery, 8);
  assert.equal(ups.lastTransferReason, 'Automatic or explicit self test');
  // apcupsd writes the epoch when nothing happened: no date.
  assert.equal(ups.lastTransferAt, undefined);
  assert.equal(ups.batteryDate, undefined);
});

test('a Smart-UPS trimming the voltage reads as on mains, without power', () => {
  const ups = readUps(smartUps);
  assert.deepEqual([...ups.words], ['TRIM', 'ONLINE']);
  assert.equal(ups.mains, 1);
  assert.equal(ups.loadPct, 9.3);
  assert.equal(ups.nominalPower, undefined);
  assert.equal(ups.power, undefined, 'no NOMPOWER: no estimate');
  assert.equal(ups.outputVoltage, 218.4);
  assert.equal(ups.nominalOutputVoltage, 230);
  assert.equal(ups.batteryDate, '13/11/15');
  assert.equal(ups.reportsTransferDate, false);
});

test('the STATUS words drive the power state', () => {
  const onBattery = readUps(withStatus(backUps, 'ONBATT LOWBATT'));
  assert.equal(onBattery.mains, 0);
  assert.equal(onBattery.lowBattery, true);

  const replace = readUps(withStatus(backUps, 'ONLINE REPLACEBATT'));
  assert.equal(replace.mains, 1);
  assert.equal(replace.replaceBattery, true);

  // apcupsd lost the UPS: nothing is known about the power.
  const lost = readUps(withStatus(backUps, 'COMMLOST'));
  assert.equal(lost.commLost, true);
  assert.equal(lost.mains, undefined);
  assert.equal(lost.lowBattery, undefined);

  assert.deepEqual(
    [...statusWords({ STATUS: 'ONBATT SHUTTING DOWN' })],
    ['ONBATT', 'SHUTTINGDOWN'],
  );
});

test('an old apcupsd without STATUS is read from STATFLAG', () => {
  const ups = readUps(minimal);
  assert.equal(ups.model, undefined);
  assert.equal(ups.serial, undefined);
  assert.equal(ups.name, undefined);
  assert.deepEqual([...ups.words], ['ONLINE']);
  assert.equal(ups.mains, 1);
  assert.equal(ups.words.has('NOBATT'), false, 'old versions never set the battery-present bit');

  assert.deepEqual([...statusWords({ STATFLAG: '0x05000050 Status Flag' })], ['ONBATT', 'LOWBATT']);
  assert.deepEqual([...statusWords({})], []);
  assert.equal(readUps({}).known, false);
});

test('a "Blank" serial number is no serial number', () => {
  assert.equal(readUps({ ...backUps, SERIALNO: 'Blank' }).serial, undefined);
});

test('numbers and dates are parsed leniently', () => {
  assert.equal(parseNumber('30.6 C Internal'), 30.6);
  assert.equal(parseNumber('N/A'), undefined);
  assert.equal(parseNumber(undefined), undefined);
  assert.equal(parseEventDate('2026-10-14 03:12:45 +0200'), '2026-10-14 03:12');
  assert.equal(parseEventDate('1970-01-01 00:00:00 +0000'), undefined);
  assert.equal(parseEventDate('N/A'), undefined);
});
