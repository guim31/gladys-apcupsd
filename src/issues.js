// -----------------------------------------------------------------------------
// Repeated failures, logged once.
//
// A server polled every 10 s that stays down would write the same warning
// again and again. An issue log keeps, per key, whether the problem is
// ongoing: the first failure is a warning, the next ones go to debug, and the
// recovery is one info line.
// -----------------------------------------------------------------------------

/**
 * @param {{ debug: Function, info: Function, warn: Function }} logger
 */
export function createIssueLog(logger) {
  const ongoing = new Set();
  return {
    /**
     * @param {string} key what failed (one key per independent problem)
     * @param {string} message
     */
    fail(key, message) {
      if (ongoing.has(key)) {
        logger.debug(`${message} (still failing)`);
        return;
      }
      ongoing.add(key);
      logger.warn(message);
    },

    /**
     * @param {string} key
     * @param {string} message said on recovery only
     */
    ok(key, message) {
      if (ongoing.delete(key)) {
        logger.info(message);
      }
    },

    isFailing(key) {
      return ongoing.has(key);
    },
  };
}
