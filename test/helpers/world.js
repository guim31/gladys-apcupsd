// -----------------------------------------------------------------------------
// A test world: the SDK's fake Gladys, the real handlers (src/app.js), a store
// in a temporary directory, a clock the test moves, and apcupsd servers whose
// statuses the test edits (or a real fake NIS server, see fakeNis.js).
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { NisError } from '../../src/nis.js';
import { Store } from '../../src/store.js';

export const HOST_A = '192.0.2.10';
export const HOST_B = '192.0.2.11';

/**
 * @param {object} [options]
 * @param {object} [options.config] raw configuration (manifest keys)
 * @param {Record<string, object|Error>} [options.statuses] by server key (`host:port`)
 * @param {boolean} [options.addDevices] add every discovered device to Gladys
 * @param {string} [options.dataDir] reuse a store directory (a restart)
 * @param {boolean} [options.timers] run the poll timer
 * @param {Function} [options.requestStatus] replaces the edited statuses
 */
export async function createWorld({
  config = {},
  statuses = {},
  addDevices = true,
  dataDir,
  timers = false,
  requestStatus,
  clock = 1_800_000_000_000,
} = {}) {
  const directory = dataDir ?? (await mkdtemp(join(tmpdir(), 'apcupsd-test-')));
  const world = {
    statuses,
    clock,
    reads: [],
    directory,
  };
  const gladys = createFakeGladys({ config: { language: 'en', ...config } });
  const app = registerHandlers(gladys, {
    store: new Store(directory),
    timers,
    now: () => world.clock,
    requestStatus:
      requestStatus ??
      (async (server) => {
        world.reads.push(server.key);
        const status = world.statuses[server.key];
        if (status instanceof Error) {
          throw status;
        }
        if (!status) {
          throw new NisError('REFUSED', 'connection refused');
        }
        return structuredClone(status);
      }),
  });
  await gladys.connect();
  await app.ready;
  if (addDevices) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
  }
  world.gladys = gladys;
  world.app = app;
  world.monitor = app.monitor;
  world.advance = (ms) => {
    world.clock += ms;
  };
  world.close = async () => {
    await app.stop();
    await gladys.disconnect();
    if (!dataDir) {
      await rm(directory, { recursive: true, force: true });
    }
  };
  return world;
}

/** A copy of a status with another STATUS field. */
export function withStatus(status, words, extra = {}) {
  return { ...status, STATUS: words, ...extra };
}
