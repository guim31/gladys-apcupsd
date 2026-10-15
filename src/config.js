// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Port of the apcupsd Network Information Server (NISPORT in apcupsd.conf).
export const DEFAULT_PORT = 3551;

// Refresh intervals offered in the form, in seconds. A select, not a number
// field: the Gladys form renders numbers without `step`.
export const POLL_INTERVALS = ['5', '10', '30', '60'];

export const DEFAULT_CONFIG = {
  servers: '',
  poll_interval: '10',
  language: 'fr',
};

// One apcupsd instance serves one UPS: a few servers at most.
const MAX_SERVERS = 16;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const IPV6 = /^[0-9a-f:.]+$/i;

/**
 * Parse the server list typed by the user: `host`, `host:port`, `[ipv6]:port`,
 * separated by commas, semicolons, spaces or new lines.
 * @param {unknown} raw
 * @returns {{ servers: { host: string, port: number, key: string }[], invalid: string[] }}
 */
export function parseServers(raw) {
  const servers = [];
  const invalid = [];
  const entries = typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
  for (const entry of entries) {
    const text = entry.trim();
    if (!text) {
      continue;
    }
    const server = parseServer(text);
    if (!server) {
      invalid.push(text);
    } else if (!servers.some((s) => s.key === server.key) && servers.length < MAX_SERVERS) {
      servers.push(server);
    }
  }
  return { servers, invalid };
}

function parseServer(text) {
  // Users paste what apcupsd.conf or a browser shows: drop a scheme.
  const value = text.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  let host;
  let portText;
  const bracketed = value.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    [, host, portText] = bracketed;
    if (!IPV6.test(host) || !host.includes(':')) {
      return null;
    }
  } else if ((value.match(/:/g) ?? []).length > 1) {
    // A bare IPv6 address: no port possible without brackets.
    host = value;
    if (!IPV6.test(host)) {
      return null;
    }
  } else {
    [host, portText] = value.split(':');
    if (!isValidHost(host)) {
      return null;
    }
  }
  const port = portText === undefined ? DEFAULT_PORT : Number(portText);
  if (!/^\d*$/.test(portText ?? '') || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  host = host.toLowerCase();
  const key = host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
  return { host, port, key };
}

function isValidHost(host) {
  const ipv4 = host.match(IPV4);
  if (ipv4) {
    return ipv4.slice(1).every((part) => Number(part) <= 255);
  }
  // A dotted string made of digits only is a mistyped address, not a name.
  if (/^[\d.]+$/.test(host)) {
    return false;
  }
  return HOSTNAME.test(host);
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { servers, invalid } = parseServers(
    typeof source.servers === 'string' ? source.servers : DEFAULT_CONFIG.servers,
  );
  const interval = String(source.poll_interval ?? DEFAULT_CONFIG.poll_interval);
  return {
    servers,
    invalidServers: invalid,
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(interval) ? interval : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
