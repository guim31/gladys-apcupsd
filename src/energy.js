// -----------------------------------------------------------------------------
// Cumulative energy of a UPS, integrated from its estimated power.
//
// apcupsd reports a load in percent of the nominal power, never an energy
// counter. The container integrates the estimated power over time (trapezoid
// rule between two reads) into a kWh index Gladys can turn into a consumption
// and a cost (energy-sensor/energy is one of the core's index types). The
// index is kept under /data so it never goes backwards across restarts: the
// core reads a decrease as a counter reset.
//
// A gap between two reads longer than MAX_GAP_MS (server unreachable,
// container stopped) is not integrated: the energy of that period is unknown,
// and guessing it would be worse than leaving it out.
// -----------------------------------------------------------------------------

export const MAX_GAP_MS = 5 * 60 * 1000;

/**
 * @param {{ kwh?: number }} [saved] what the store kept
 */
export function createEnergyMeter(saved = {}) {
  let kwh = Number.isFinite(saved.kwh) && saved.kwh >= 0 ? saved.kwh : 0;
  let last = null; // { at, watts }
  return {
    /**
     * Add a power reading.
     * @param {number} watts
     * @param {number} at timestamp (ms)
     * @returns {number} the index, in kWh
     */
    add(watts, at) {
      if (!Number.isFinite(watts) || watts < 0) {
        return kwh;
      }
      if (last && at > last.at && at - last.at <= MAX_GAP_MS) {
        const hours = (at - last.at) / 3_600_000;
        kwh += (((last.watts + watts) / 2) * hours) / 1000;
      }
      last = { at, watts };
      return kwh;
    },
    get kwh() {
      return kwh;
    },
    toJSON() {
      return { kwh };
    },
  };
}
