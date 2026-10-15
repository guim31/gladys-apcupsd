// -----------------------------------------------------------------------------
// End to end: the real handlers and the real NIS client against a fake
// apcupsd server on 127.0.0.1, through the SDK's fake Gladys. A power outage
// as a user would live it: discovery, "Add to Gladys", outage, recovery.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestStatus } from '../src/nis.js';
import { loadFixture, startFakeNis } from './helpers/fakeNis.js';
import { createWorld, withStatus } from './helpers/world.js';

const backUps = await loadFixture('back-ups-es-600');

test('a power outage, from the apcupsd server to the scene trigger', async (t) => {
  const nis = await startFakeNis({ status: backUps });
  t.after(() => nis.close());
  const world = await createWorld({
    config: { servers: `${nis.host}:${nis.port}`, language: 'fr' },
    addDevices: false,
    requestStatus: (server) => requestStatus(server, { timeoutMs: 2000 }),
  });
  try {
    const { fake } = world.gladys;
    const [device] = fake.discoveredDevices;
    assert.equal(device.name, 'MyUPS');
    assert.deepEqual(fake.connectionStatus, { connected: true });

    await fake.deviceCreated(device);
    const id = (key) => `${device.external_id}:${key}`;
    assert.equal(fake.lastState(id('status')), 'Sur secteur');
    assert.equal(fake.lastState(id('mains')), 1);

    nis.status = withStatus(backUps, 'ONBATT', {
      BCHARGE: '97.0 Percent',
      TIMELEFT: '45.0 Minutes',
    });
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(fake.lastState(id('status')), 'Sur batterie');
    assert.equal(fake.lastState(id('mains')), 0);
    assert.equal(fake.lastState(id('battery')), 97);
    assert.deepEqual(fake.sceneEvents.at(-1), {
      key: 'power_outage',
      data: { device: device.external_id, device_name: 'MyUPS', battery_charge: 97, runtime: 45 },
    });

    nis.status = backUps;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(fake.lastState(id('mains')), 1);
    assert.equal(fake.sceneEvents.at(-1).key, 'power_restored');
    assert.equal(fake.sceneEvents.at(-1).data.outage_duration, 10);
    assert.ok(
      nis.commands.every((command) => command === 'status'),
      'read-only: status only',
    );

    const report = await fake.action('check_servers');
    assert.match(report.data.message.fr, /Back-UPS ES 600, répond\./);
  } finally {
    await world.close();
  }
});
