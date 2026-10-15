// -----------------------------------------------------------------------------
// The monitor through the real handlers and the SDK's fake Gladys: its own
// polling timer (Gladys#3198), the core's onPoll as a fallback, the states
// sent again for a device just added, the heartbeat, the connection status,
// the transport badge and the quiet logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NisError } from '../src/nis.js';
import { STATE_HEARTBEAT_MS } from '../src/monitor.js';
import { loadFixture } from './helpers/fakeNis.js';
import { createWorld, HOST_A, HOST_B, withStatus } from './helpers/world.js';

const backUps = await loadFixture('back-ups-es-600');
const smartUps = await loadFixture('smart-ups-1400');
const A = `${HOST_A}:3551`;
const B = `${HOST_B}:3551`;
const DEVICE = 'ext:test-integration:ups:3B0000X00001';

/** Let the reads started by a fired timer run to their end. */
async function settle() {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Capture the console: the SDK logger writes there. */
function captureLogs(t) {
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  return lines;
}

test('the container refreshes the states by itself, without any onPoll (Gladys#3198)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({
    config: { servers: HOST_A, poll_interval: '10' },
    statuses: { [A]: backUps },
    timers: true,
  });
  t.after(() => world.close());
  const onPoll = t.mock.method(world.monitor, 'pollFromCore');
  const reads = () => world.reads.length;
  const before = reads();

  world.statuses[A] = { ...backUps, BCHARGE: '87.0 Percent', TIMELEFT: '40.5 Minutes' };
  world.advance(10_000);
  t.mock.timers.tick(10_000);
  await settle();
  assert.equal(reads(), before + 1, 'read again after one period');
  assert.equal(world.gladys.fake.lastState(`${DEVICE}:battery`), 87);
  assert.equal(world.gladys.fake.lastState(`${DEVICE}:runtime`), 40.5);

  world.advance(10_000);
  t.mock.timers.tick(10_000);
  await settle();
  assert.equal(reads(), before + 2, 'and again');
  assert.equal(onPoll.mock.callCount(), 0, 'the core never had to poll');
});

test("the core's onPoll is a fallback: skipped right after the timer, used when it stalls", async () => {
  const world = await createWorld({
    config: { servers: HOST_A, poll_interval: '10' },
    statuses: { [A]: backUps },
  });
  try {
    const device = world.gladys.fake.devices[0];
    const before = world.reads.length;
    world.advance(5_000);
    assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
    assert.equal(world.reads.length, before, 'read 5 s ago: skipped');

    world.advance(5_000);
    world.statuses[A] = { ...backUps, LOADPCT: '20.0 Percent' };
    assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
    assert.equal(world.reads.length, before + 1, 'a period without read: the core polls');
    assert.equal(world.gladys.fake.lastState(`${DEVICE}:load`), 20);
    assert.equal(world.gladys.fake.lastState(`${DEVICE}:power`), 66);
  } finally {
    await world.close();
  }
});

test('only the changes are published, and everything every 6 hours', async () => {
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: backUps } });
  try {
    const { fake } = world.gladys;
    const count = () => fake.states.length;
    const first = count();
    assert.ok(first >= 15, 'every state once');

    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(count(), first, 'nothing changed, nothing sent');

    world.statuses[A] = { ...backUps, LINEV: '121.0 Volts' };
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(count(), first + 1, 'one value changed, one state');
    assert.equal(fake.lastState(`${DEVICE}:input-voltage`), 121);

    // The SDK heartbeat runs on the real clock.
    const realNow = Date.now;
    Date.now = () => realNow() + STATE_HEARTBEAT_MS + 1000;
    try {
      world.advance(10_000);
      await world.monitor.cycle();
    } finally {
      Date.now = realNow;
    }
    assert.ok(count() >= first + 1 + 15, 'the heartbeat sends the stable values again');
  } finally {
    await world.close();
  }
});

test('a device just added gets all its states at once', async () => {
  const world = await createWorld({
    config: { servers: HOST_A },
    statuses: { [A]: backUps },
    addDevices: false,
  });
  try {
    const { fake } = world.gladys;
    assert.equal(fake.states.length, 0, 'no state for a device Gladys does not have');
    const [device] = fake.discoveredDevices;
    await fake.deviceCreated(device);
    assert.equal(fake.lastState(`${DEVICE}:mains`), 1);
    assert.equal(fake.lastState(`${DEVICE}:status`), 'On mains');
    assert.equal(fake.lastState(`${DEVICE}:model`), 'Back-UPS ES 600');
    assert.deepEqual(fake.widgetRefreshes.slice(-1), ['ups']);
    assert.deepEqual(fake.transports, [{ device_external_id: DEVICE, transport: 'local' }]);
  } finally {
    await world.close();
  }
});

test('the connection status names the server that does not answer', async () => {
  const world = await createWorld({
    config: { servers: `${HOST_A}, ${HOST_B}` },
    statuses: { [A]: backUps, [B]: new NisError('REFUSED', 'connection refused') },
  });
  try {
    const { fake } = world.gladys;
    assert.equal(fake.connectionStatus.connected, false);
    assert.match(
      fake.connectionStatus.message.en,
      /1 of 2 apcupsd server\(s\) unreachable: 192\.0\.2\.11:3551 \(connection refused: is the network server on \(NISIP 0\.0\.0\.0\)\?\)/,
    );
    assert.match(fake.connectionStatus.message.fr, /NISIP 0\.0\.0\.0/);

    const sent = fake.connectionStatuses.length;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(fake.connectionStatuses.length, sent, 'sent on change only');

    world.statuses[B] = smartUps;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.deepEqual(fake.connectionStatus, { connected: true });
  } finally {
    await world.close();
  }
});

test('without any server, the Configuration screen says what to fill in', async () => {
  const world = await createWorld({ config: {} });
  try {
    assert.equal(world.gladys.fake.connectionStatus.connected, false);
    assert.match(world.gladys.fake.connectionStatus.message.fr, /adresse de votre serveur apcupsd/);
    assert.deepEqual(world.gladys.fake.discoveredDevices, []);
  } finally {
    await world.close();
  }
});

test('the transport badge follows the server and the UPS', async () => {
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: backUps } });
  try {
    const { fake } = world.gladys;
    world.statuses[A] = new NisError('TIMEOUT', 'no answer within 5 s');
    world.advance(10_000);
    await world.monitor.cycle();
    assert.deepEqual(fake.transports.at(-1), {
      device_external_id: DEVICE,
      transport: 'unreachable',
    });

    world.statuses[A] = withStatus(backUps, 'COMMLOST');
    world.advance(10_000);
    await world.monitor.cycle();
    const degraded = fake.transports.at(-1);
    assert.equal(degraded.transport, 'local');
    assert.equal(degraded.degraded, true);
    assert.equal(degraded.message.fr, 'Onduleur muet');

    const sent = fake.transports.length;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(fake.transports.length, sent, 'sent on change only');
  } finally {
    await world.close();
  }
});

test('a server down at startup keeps its device in the Discovery tab', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'apcupsd-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await createWorld({
    config: { servers: HOST_A },
    statuses: { [A]: backUps },
    dataDir: directory,
  });
  await first.close();
  const second = await createWorld({
    config: { servers: HOST_A },
    statuses: {},
    dataDir: directory,
    addDevices: false,
  });
  try {
    const [device] = second.gladys.fake.discoveredDevices;
    assert.equal(device.external_id, DEVICE);
    assert.equal(device.name, 'MyUPS');
  } finally {
    await second.close();
  }
});

test('two servers reporting the same UPS give one device', async () => {
  const world = await createWorld({
    config: { servers: `${HOST_A}, ${HOST_B}` },
    statuses: { [A]: backUps, [B]: withStatus(backUps, 'ONLINE SLAVE') },
  });
  try {
    assert.equal(world.gladys.fake.discoveredDevices.length, 1);
  } finally {
    await world.close();
  }
});

test('a normal cycle writes nothing at info level, a lasting failure one line', async (t) => {
  delete process.env.LOG_LEVEL; // the default: info
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: backUps } });
  try {
    const lines = captureLogs(t);
    for (let i = 0; i < 5; i += 1) {
      world.statuses[A] = { ...backUps, LINEV: `${120 + i}.0 Volts` };
      world.advance(10_000);
      await world.monitor.cycle();
    }
    assert.deepEqual(lines, [], 'steady cycles are silent');

    world.statuses[A] = new NisError('REFUSED', 'connection refused');
    for (let i = 0; i < 5; i += 1) {
      world.advance(10_000);
      await world.monitor.cycle();
    }
    assert.equal(lines.length, 1, 'one warning for the whole failure');
    assert.match(
      lines[0],
      /\[WARN\].*192\.0\.2\.10:3551: apcupsd unreachable \(connection refused\)/,
    );

    world.statuses[A] = backUps;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(lines.length, 2);
    assert.match(lines[1], /\[INFO\].*apcupsd answers again/);
  } finally {
    await world.close();
  }
});

test('nothing secret reaches the logs', async (t) => {
  process.env.LOG_LEVEL = 'debug';
  t.after(() => delete process.env.LOG_LEVEL);
  const lines = captureLogs(t);
  const world = await createWorld({
    config: { servers: `${HOST_A}, ${HOST_B}` },
    statuses: { [A]: backUps, [B]: new NisError('TIMEOUT', 'no answer') },
  });
  try {
    await world.gladys.fake.action('check_servers');
    world.advance(10_000);
    await world.monitor.cycle();
    assert.ok(lines.length > 0, 'debug logs were written');
    // The NIS has no credentials; the only secret around is the token the
    // supervisor gives the container.
    const token = world.gladys.token ?? process.env.GLADYS_INTEGRATION_TOKEN;
    for (const line of lines) {
      if (token) {
        assert.ok(!line.includes(token), `token in "${line}"`);
      }
      assert.doesNotMatch(line, /password|secret|token=/i);
    }
  } finally {
    await world.close();
  }
});
