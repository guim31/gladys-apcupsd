// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the monitor, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { MESSAGES } from './i18n.js';
import { Monitor } from './monitor.js';
import { Store } from './store.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'apcupsd-app' });

export const ACTIONS = ['check_servers'];

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, requestStatus, timers, now
 */
export function registerHandlers(gladys, options = {}) {
  const monitor = new Monitor({
    gladys,
    store: options.store ?? new Store(),
    requestStatus: options.requestStatus,
    timers: options.timers ?? true,
    now: options.now,
  });

  // Resolved once the monitor has started; every handler waits for it, so a
  // request arriving during the first read is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      if (started) {
        // A reconnection (Gladys restarted): send again what it may have lost.
        await monitor.resync();
        return;
      }
      started = true;
      await monitor.start(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => monitor.rediscover()));

  // Fallback of the container's own timer (Gladys#3198).
  gladys.onPoll(whenReady((device) => monitor.pollFromCore(device)));

  gladys.onDeviceCreated(whenReady((device) => monitor.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady((device) => monitor.onDeviceCreated(device)));

  gladys.onConfigUpdated(
    whenReady(async (config) => {
      logger.info('Configuration updated');
      await monitor.reconfigure(normalizeConfig(config));
    }),
  );

  gladys.onAction(
    'check_servers',
    whenReady(async () => {
      logger.info('Checking the apcupsd servers (asked by the user)');
      return monitor.checkServers();
    }),
  );

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(monitor, request)),
    );
  }

  return {
    monitor,
    ready,
    stop: () => monitor.stop(),
  };
}
