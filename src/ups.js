// -----------------------------------------------------------------------------
// From the raw apcupsd status (`{ STATUS: 'ONLINE', BCHARGE: '100.0 Percent',
// ... }`) to a typed reading. Pure functions, no I/O.
//
// Field names and formats come from the apcupsd manual ("apcaccess status"
// fields) and from real statuses published by aioapcaccess and the Home
// Assistant integration (test/fixtures/apcupsd/). A field the UPS does not
// report is simply absent: every value below may be undefined.
// -----------------------------------------------------------------------------

// The words of the STATUS field, as apcupsd prints them. "SHUTTING DOWN" is
// the only two-word flag: normalized to SHUTTINGDOWN.
export const STATUS_WORDS = [
  'COMMLOST',
  'SHUTTINGDOWN',
  'ONBATT',
  'ONLINE',
  'OVERLOAD',
  'LOWBATT',
  'REPLACEBATT',
  'NOBATT',
  'CAL',
  'TRIM',
  'BOOST',
  'SLAVEDOWN',
  'SLAVE',
];

// STATFLAG bits (apcupsd include/defines.h), used when an old apcupsd sends
// no STATUS. The battery-present bit is not read: old versions never set it,
// which would read as "no battery".
const STATFLAG_BITS = [
  [0x001, 'CAL'],
  [0x002, 'TRIM'],
  [0x004, 'BOOST'],
  [0x008, 'ONLINE'],
  [0x010, 'ONBATT'],
  [0x020, 'OVERLOAD'],
  [0x040, 'LOWBATT'],
  [0x080, 'REPLACEBATT'],
  [0x100, 'COMMLOST'],
  [0x200, 'SHUTTINGDOWN'],
  [0x400, 'SLAVE'],
  [0x800, 'SLAVEDOWN'],
];

/**
 * "124.0 Volts" → 124, "0 Seconds" → 0, "N/A" → undefined.
 * @param {string | undefined} value
 */
export function parseNumber(value) {
  const match = typeof value === 'string' ? value.match(/^\s*(-?\d+(?:\.\d+)?)/) : null;
  return match ? Number(match[1]) : undefined;
}

/**
 * The status flags, from STATUS, else from STATFLAG.
 * @param {Record<string, string>} status
 * @returns {Set<string>}
 */
export function statusWords(status) {
  if (typeof status.STATUS === 'string' && status.STATUS.trim()) {
    const words = new Set();
    const tokens = status.STATUS.toUpperCase().replace(/SHUTTING\s+DOWN/g, 'SHUTTINGDOWN');
    for (const token of tokens.split(/\s+/)) {
      if (token) {
        words.add(token);
      }
    }
    return words;
  }
  // Older apcupsd: "0x05000008" or "0x05000008 Status Flag".
  const flag = typeof status.STATFLAG === 'string' ? status.STATFLAG.match(/0x[0-9a-f]+/i) : null;
  const words = new Set();
  if (flag) {
    const bits = Number.parseInt(flag[0], 16);
    for (const [bit, word] of STATFLAG_BITS) {
      if (bits & bit) {
        words.add(word);
      }
    }
  }
  return words;
}

/** Some UPS report the serial number "Blank". */
function cleanSerial(value) {
  const serial = typeof value === 'string' ? value.trim() : '';
  return serial && serial.toLowerCase() !== 'blank' ? serial : undefined;
}

function cleanText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text !== 'N/A' ? text : undefined;
}

// The battery date as the UPS stores it ("2019-03-15", or "13/11/15" on
// older Smart-UPS: the day/month order varies, it is kept as written). The
// epoch means the date was never set.
function cleanBatteryDate(value) {
  const date = cleanText(value);
  return date && !/^19[67]\d-01-01$/.test(date) ? date : undefined;
}

/**
 * "2016-02-09 21:13:11 +0000" → "2016-02-09 21:13". apcupsd writes the epoch
 * (or N/A) when nothing happened yet: no date then.
 */
export function parseEventDate(value) {
  const match =
    typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/) : null;
  if (!match || Number(match[1]) < 1980) {
    return undefined;
  }
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
}

/**
 * @param {Record<string, string>} status raw apcupsd status
 */
export function readUps(status) {
  const words = statusWords(status);
  const commLost = words.has('COMMLOST');
  let mains;
  if (!commLost && words.has('ONBATT')) {
    mains = 0;
  } else if (!commLost && words.has('ONLINE')) {
    mains = 1;
  }
  const loadPct = parseNumber(status.LOADPCT);
  const nominalPower = parseNumber(status.NOMPOWER);
  const model = cleanText(status.APCMODEL) ?? cleanText(status.MODEL);
  return {
    name: cleanText(status.UPSNAME) ?? model,
    model,
    serial: cleanSerial(status.SERIALNO),
    words,
    known: words.size > 0,
    commLost,
    mains,
    lowBattery: commLost || !words.size ? undefined : words.has('LOWBATT'),
    replaceBattery: commLost || !words.size ? undefined : words.has('REPLACEBATT'),
    batteryCharge: parseNumber(status.BCHARGE),
    timeLeft: parseNumber(status.TIMELEFT),
    loadPct,
    nominalPower: nominalPower > 0 ? nominalPower : undefined,
    power:
      loadPct !== undefined && nominalPower > 0
        ? Math.round((loadPct * nominalPower) / 100)
        : undefined,
    inputVoltage: parseNumber(status.LINEV),
    outputVoltage: parseNumber(status.OUTPUTV),
    batteryVoltage: parseNumber(status.BATTV),
    nominalInputVoltage: parseNumber(status.NOMINV),
    nominalOutputVoltage: parseNumber(status.NOMOUTV),
    nominalBatteryVoltage: parseNumber(status.NOMBATTV),
    temperature: parseNumber(status.ITEMP),
    batteryDate: cleanBatteryDate(status.BATTDATE),
    lastTransferReason: cleanText(status.LASTXFER),
    lastTransferAt: parseEventDate(status.XONBATT),
    reportsTransferDate: typeof status.XONBATT === 'string',
    transfers: parseNumber(status.NUMXFERS),
    timeOnBattery: parseNumber(status.TONBATT),
    totalTimeOnBattery: parseNumber(status.CUMONBATT),
  };
}
