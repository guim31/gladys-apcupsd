// -----------------------------------------------------------------------------
// Client of the apcupsd Network Information Server (NIS), the protocol
// `apcaccess` and the Home Assistant integration (aioapcaccess) speak.
//
// The protocol is a TCP exchange of length-prefixed records: every message is
// a 2-byte big-endian length followed by that many bytes. The client sends
// the command `status`; the server answers one record per line
// ("MODEL    : Back-UPS ES 600\n"), then an empty record (length 0), and the
// client closes. There is no authentication and nothing to write: the NIS is
// read-only by design, and so is this integration.
// -----------------------------------------------------------------------------

import net from 'node:net';

export const STATUS_COMMAND = 'status';
const DEFAULT_TIMEOUT_MS = 5000;
// A status is about 2 KB: anything far bigger is not an apcupsd answer.
const MAX_RESPONSE_BYTES = 64 * 1024;

/** An error with a stable `code` the callers translate into a hint. */
export class NisError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NisError';
    this.code = code;
  }
}

/**
 * Frame a command the way the NIS expects it.
 * @param {string} command
 * @returns {Buffer}
 */
export function encodeCommand(command) {
  const body = Buffer.from(command, 'ascii');
  const header = Buffer.alloc(2);
  header.writeUInt16BE(body.length);
  return Buffer.concat([header, body]);
}

/**
 * Split a received buffer into its records.
 * @param {Buffer} buffer
 * @returns {{ records: string[], complete: boolean }} `complete` once the empty end record is read
 */
export function decodeRecords(buffer) {
  const records = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const length = buffer.readUInt16BE(offset);
    if (length === 0) {
      return { records, complete: true };
    }
    if (offset + 2 + length > buffer.length) {
      break;
    }
    records.push(buffer.toString('latin1', offset + 2, offset + 2 + length));
    offset += 2 + length;
  }
  return { records, complete: false };
}

/**
 * Turn the status records into a flat object: `{ MODEL: 'Back-UPS ES 600', ... }`.
 * A key seen twice keeps its last value, like apcaccess.
 * @param {string[]} records
 * @returns {Record<string, string>}
 */
export function parseStatusRecords(records) {
  const status = {};
  for (const record of records) {
    const separator = record.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = record.slice(0, separator).trim();
    const value = record.slice(separator + 1).trim();
    if (key) {
      status[key] = value;
    }
  }
  return status;
}

/**
 * Read the status of the UPS an apcupsd instance monitors.
 * @param {{ host: string, port: number }} server
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Record<string, string>>}
 * @throws {NisError} codes: REFUSED, TIMEOUT, NOT_FOUND, UNREACHABLE, CLOSED, INVALID, NETWORK
 */
export function requestStatus({ host, port }, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const socket = net.createConnection({ host, port });

    const finish = (err, value) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (err) {
        reject(err);
      } else {
        resolve(value);
      }
    };

    socket.setTimeout(timeoutMs, () =>
      finish(new NisError('TIMEOUT', `no answer within ${timeoutMs / 1000} s`)),
    );
    socket.on('connect', () => socket.write(encodeCommand(STATUS_COMMAND)));
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        finish(new NisError('INVALID', 'answer too long for an apcupsd status'));
        return;
      }
      const { records, complete } = decodeRecords(Buffer.concat(chunks, size));
      if (complete) {
        const status = parseStatusRecords(records);
        if (Object.keys(status).length === 0) {
          finish(new NisError('INVALID', 'empty status'));
        } else {
          finish(null, status);
        }
      }
    });
    socket.on('end', () =>
      finish(new NisError('CLOSED', 'connection closed before the end of the status')),
    );
    socket.on('close', () =>
      finish(new NisError('CLOSED', 'connection closed before the end of the status')),
    );
    socket.on('error', (err) => finish(translateSocketError(err)));
  });
}

function translateSocketError(err) {
  switch (err.code) {
    case 'ECONNREFUSED':
      return new NisError('REFUSED', 'connection refused');
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return new NisError('NOT_FOUND', 'unknown host name');
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return new NisError('UNREACHABLE', 'host unreachable');
    case 'ETIMEDOUT':
      return new NisError('TIMEOUT', 'connection timed out');
    case 'ECONNRESET':
      return new NisError('CLOSED', 'connection reset');
    default:
      return new NisError('NETWORK', err.code ?? err.message);
  }
}
