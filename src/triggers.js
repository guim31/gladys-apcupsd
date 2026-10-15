// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`, Gladys 5.1+): what HAPPENED to a
// UPS, detected as a transition between two reads.
//
// The device features already carry the states ("Mains power" = 0 during an
// outage); the triggers add one card per event in the scene editor, any UPS
// or one in particular, with the values a notification wants (battery
// charge, runtime, how long the outage lasted) as scene variables.
//
// A first read never fires anything: without a previous state there is no
// transition. The previous state survives a restart of the container (see
// src/store.js) for MEMORY_MAX_AGE_MS: an outage that starts while the
// container restarts still fires, an old memory is not trusted.
// -----------------------------------------------------------------------------

export const TRIGGER = {
  POWER_OUTAGE: 'power_outage',
  POWER_RESTORED: 'power_restored',
  BATTERY_LOW: 'battery_low',
  REPLACE_BATTERY: 'replace_battery',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGER);

export const MEMORY_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Compare a reading with the remembered power state.
 * @param {object | undefined} previous `{ mains, lowBattery, replaceBattery, outageSince, at }`
 * @param {object} ups reading (src/ups.js)
 * @param {number} now
 * @returns {{ events: { key: string, outageSeconds?: number }[], next: object }}
 */
export function detectTransitions(previous, ups, now) {
  const known = previous && now - (previous.at ?? 0) <= MEMORY_MAX_AGE_MS ? previous : {};
  const next = {
    mains: ups.mains ?? known.mains,
    lowBattery: ups.lowBattery ?? known.lowBattery,
    replaceBattery: ups.replaceBattery ?? known.replaceBattery,
    outageSince: known.outageSince,
    at: now,
  };
  const events = [];

  if (ups.mains === 0) {
    if (known.mains === 1) {
      events.push({ key: TRIGGER.POWER_OUTAGE });
      next.outageSince = now;
    } else if (next.outageSince === undefined) {
      // Already on battery when first seen: apcupsd knows since when.
      next.outageSince = now - (ups.timeOnBattery ?? 0) * 1000;
    }
  } else if (ups.mains === 1) {
    if (known.mains === 0) {
      const event = { key: TRIGGER.POWER_RESTORED };
      if (known.outageSince !== undefined) {
        event.outageSeconds = Math.max(0, Math.round((now - known.outageSince) / 1000));
      }
      events.push(event);
    }
    next.outageSince = undefined;
  }

  if (ups.lowBattery === true && known.lowBattery === false) {
    events.push({ key: TRIGGER.BATTERY_LOW });
  }
  if (ups.replaceBattery === true && known.replaceBattery === false) {
    events.push({ key: TRIGGER.REPLACE_BATTERY });
  }
  return { events, next };
}

/**
 * The flat data of a scene event: the device for the filter, then the
 * variables declared for that trigger in the manifest.
 * @param {{ key: string, outageSeconds?: number }} event
 * @param {{ deviceExternalId: string, deviceName: string, ups: object }} context
 */
export function eventData(event, { deviceExternalId, deviceName, ups }) {
  const data = { device: deviceExternalId, device_name: deviceName };
  const add = (key, value) => {
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== 'number' || Number.isFinite(value))
    ) {
      data[key] = value;
    }
  };
  switch (event.key) {
    case TRIGGER.POWER_OUTAGE:
    case TRIGGER.BATTERY_LOW:
      add('battery_charge', ups.batteryCharge);
      add('runtime', ups.timeLeft);
      break;
    case TRIGGER.POWER_RESTORED:
      add('battery_charge', ups.batteryCharge);
      add('outage_duration', event.outageSeconds);
      break;
    case TRIGGER.REPLACE_BATTERY:
      add('battery_date', ups.batteryDate);
      break;
    default:
      break;
  }
  return data;
}
