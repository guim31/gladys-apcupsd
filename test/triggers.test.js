// -----------------------------------------------------------------------------
// Scene triggers: one event per transition, with the declared variables, any
// UPS or one in particular, and nothing on a first read.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectTransitions, MEMORY_MAX_AGE_MS, TRIGGER } from '../src/triggers.js';
import { readUps } from '../src/ups.js';
import { loadFixture } from './helpers/fakeNis.js';
import { createWorld, HOST_A, withStatus } from './helpers/world.js';

const backUps = await loadFixture('back-ups-es-600');
const A = `${HOST_A}:3551`;
const DEVICE = 'ext:test-integration:ups:3B0000X00001';
const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const onMains = backUps;
const onBattery = withStatus(backUps, 'ONBATT', {
  BCHARGE: '96.0 Percent',
  TIMELEFT: '38.5 Minutes',
  TONBATT: '12 Seconds',
});

test('a first read fires nothing, a transition fires once', () => {
  const now = 1_000_000;
  const first = detectTransitions(undefined, readUps(onBattery), now);
  assert.deepEqual(first.events, []);
  assert.equal(first.next.outageSince, now - 12_000, 'apcupsd says since when');

  const outage = detectTransitions({ mains: 1, at: now }, readUps(onBattery), now + 10_000);
  assert.deepEqual(outage.events, [{ key: TRIGGER.POWER_OUTAGE }]);

  const again = detectTransitions(outage.next, readUps(onBattery), now + 20_000);
  assert.deepEqual(again.events, [], 'still on battery: no new event');

  const restored = detectTransitions(again.next, readUps(onMains), now + 70_000);
  assert.deepEqual(restored.events, [{ key: TRIGGER.POWER_RESTORED, outageSeconds: 60 }]);
});

test('a lost UPS keeps the previous power state', () => {
  const now = 1_000_000;
  const lost = detectTransitions(
    { mains: 1, at: now },
    readUps(withStatus(backUps, 'COMMLOST')),
    now + 1,
  );
  assert.deepEqual(lost.events, []);
  assert.equal(lost.next.mains, 1);
  const outage = detectTransitions(lost.next, readUps(onBattery), now + 2);
  assert.deepEqual(outage.events, [{ key: TRIGGER.POWER_OUTAGE }]);
});

test('an old memory is not trusted', () => {
  const stale = detectTransitions({ mains: 1, at: 0 }, readUps(onBattery), MEMORY_MAX_AGE_MS + 1);
  assert.deepEqual(stale.events, []);
});

test('the monitor fires the four triggers with their variables', async () => {
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: onMains } });
  try {
    const { fake } = world.gladys;
    assert.deepEqual(fake.sceneEvents, [], 'the first read fires nothing');

    const step = async (status) => {
      world.statuses[A] = status;
      world.advance(10_000);
      await world.monitor.cycle();
    };
    await step(onBattery);
    await step(onBattery);
    await step(
      withStatus(onBattery, 'ONBATT LOWBATT', { BCHARGE: '9.0 Percent', TIMELEFT: '2.0 Minutes' }),
    );
    await step(withStatus(onMains, 'ONLINE LOWBATT'));
    await step(withStatus(onMains, 'ONLINE REPLACEBATT', { BATTDATE: '2021-06-30' }));

    assert.deepEqual(fake.sceneEvents, [
      {
        key: 'power_outage',
        data: { device: DEVICE, device_name: 'MyUPS', battery_charge: 96, runtime: 38.5 },
      },
      {
        key: 'battery_low',
        data: { device: DEVICE, device_name: 'MyUPS', battery_charge: 9, runtime: 2 },
      },
      {
        key: 'power_restored',
        data: { device: DEVICE, device_name: 'MyUPS', battery_charge: 100, outage_duration: 30 },
      },
      {
        key: 'replace_battery',
        data: { device: DEVICE, device_name: 'MyUPS', battery_date: '2021-06-30' },
      },
    ]);
    assert.equal(fake.lastState(`${DEVICE}:mains`), 1);

    // Every key sent is the device filter or a declared variable.
    for (const { key, data } of fake.sceneEvents) {
      const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
      const allowed = [...trigger.fields.map((f) => f.key), ...trigger.variables.map((v) => v.key)];
      for (const name of Object.keys(data)) {
        assert.ok(allowed.includes(name), `${key}: "${name}" is not declared`);
      }
    }
  } finally {
    await world.close();
  }
});

test('the device name is the one the user gave in Gladys', async () => {
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: onMains } });
  try {
    const device = world.gladys.fake.devices[0];
    await world.gladys.fake.deviceUpdated({ ...device, name: 'Onduleur du bureau' });
    world.statuses[A] = onBattery;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(world.gladys.fake.sceneEvents[0].data.device_name, 'Onduleur du bureau');
  } finally {
    await world.close();
  }
});

test('the triggers also fire for a UPS not added to Gladys', async () => {
  const world = await createWorld({
    config: { servers: HOST_A },
    statuses: { [A]: onMains },
    addDevices: false,
  });
  try {
    world.statuses[A] = onBattery;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.deepEqual(
      world.gladys.fake.sceneEvents.map((e) => e.key),
      ['power_outage'],
    );
    assert.equal(world.gladys.fake.states.length, 0);
  } finally {
    await world.close();
  }
});

test('an outage that starts while the container restarts still fires', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'apcupsd-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await createWorld({
    config: { servers: HOST_A },
    statuses: { [A]: onMains },
    dataDir: directory,
  });
  const { clock } = first;
  await first.close();

  const second = await createWorld({
    config: { servers: HOST_A },
    statuses: { [A]: onBattery },
    dataDir: directory,
    clock: clock + 60_000,
  });
  try {
    assert.deepEqual(
      second.gladys.fake.sceneEvents.map((e) => e.key),
      ['power_outage'],
    );
  } finally {
    await second.close();
  }
});
