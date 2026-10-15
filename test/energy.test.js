// -----------------------------------------------------------------------------
// The energy index: integrated from the estimated power, never across a long
// gap, and never going backwards across a restart (Gladys reads a decrease as
// a counter reset).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEnergyMeter, MAX_GAP_MS } from '../src/energy.js';
import { loadFixture } from './helpers/fakeNis.js';
import { createWorld, HOST_A } from './helpers/world.js';

const backUps = await loadFixture('back-ups-es-600'); // 14 % of 330 W = 46 W
const A = `${HOST_A}:3551`;
const ENERGY = 'ext:test-integration:ups:3B0000X00001:energy';

test('the power is integrated with the trapezoid rule', () => {
  const meter = createEnergyMeter();
  meter.add(100, 0);
  meter.add(300, 180_000); // three minutes from 100 W to 300 W: 10 Wh
  assert.ok(Math.abs(meter.kwh - 0.01) < 1e-12);
  meter.add(300, 240_000); // one minute at 300 W: 5 Wh
  assert.ok(Math.abs(meter.kwh - 0.015) < 1e-12);
});

test('a long gap is not integrated, a bad reading is ignored', () => {
  const meter = createEnergyMeter({ kwh: 1.5 });
  meter.add(500, 0);
  meter.add(500, MAX_GAP_MS + 1);
  assert.equal(meter.kwh, 1.5, 'the energy of an unknown period is not guessed');
  meter.add(Number.NaN, MAX_GAP_MS + 2);
  meter.add(-3, MAX_GAP_MS + 3);
  assert.equal(meter.kwh, 1.5);
  assert.deepEqual(createEnergyMeter({ kwh: -2 }).toJSON(), { kwh: 0 });
});

test('the index is published and survives a restart of the container', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'apcupsd-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { servers: HOST_A };

  const first = await createWorld({ config, statuses: { [A]: backUps }, dataDir: directory });
  assert.equal(first.gladys.fake.lastState(ENERGY), 0);
  // 46 W for one hour, read every 10 s.
  for (let i = 0; i < 360; i += 1) {
    first.advance(10_000);
    await first.monitor.cycle();
  }
  assert.equal(first.gladys.fake.lastState(ENERGY), 0.046);
  const { clock } = first;
  await first.close();

  const second = await createWorld({
    config,
    statuses: { [A]: backUps },
    dataDir: directory,
    clock: clock + 60_000,
  });
  try {
    assert.equal(second.gladys.fake.lastState(ENERGY), 0.046, 'the index goes on, never back');
    second.advance(10_000);
    await second.monitor.cycle();
    assert.ok(second.gladys.fake.lastState(ENERGY) >= 0.046);
  } finally {
    await second.close();
  }
});

test('a UPS without nominal power has no power nor energy feature', async () => {
  const smartUps = await loadFixture('smart-ups-1400');
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: smartUps } });
  try {
    const keys = world.gladys.fake.discoveredDevices[0].features.map((f) =>
      f.external_id.split(':').pop(),
    );
    assert.ok(!keys.includes('power') && !keys.includes('energy'));
    assert.ok(keys.includes('load'));
  } finally {
    await world.close();
  }
});
