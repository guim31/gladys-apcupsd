// -----------------------------------------------------------------------------
// A fake apcupsd network information server, on 127.0.0.1 and a free port:
// answers the `status` command like apcupsd (one length-prefixed record per
// line, then an empty record). `mode` makes it misbehave.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { readFile } from 'node:fs/promises';

/** Encode a status object the way apcupsd sends it. */
export function encodeStatus(status) {
  const parts = [];
  for (const [key, value] of Object.entries(status)) {
    const body = Buffer.from(`${key.padEnd(9)}: ${value}\n`, 'latin1');
    const header = Buffer.alloc(2);
    header.writeUInt16BE(body.length);
    parts.push(header, body);
  }
  parts.push(Buffer.alloc(2));
  return Buffer.concat(parts);
}

export async function loadFixture(name) {
  return JSON.parse(
    await readFile(new URL(`../fixtures/apcupsd/${name}.json`, import.meta.url), 'utf8'),
  );
}

/**
 * @param {{ status?: object, raw?: Buffer, mode?: 'ok'|'split'|'hang'|'close'|'garbage' }} options
 */
export async function startFakeNis({ status = {}, raw, mode = 'ok' } = {}) {
  const server = {
    status,
    raw,
    mode,
    commands: [],
  };
  const sockets = new Set();
  const tcp = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let received = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length < 2 || received.length < 2 + received.readUInt16BE(0)) {
        return;
      }
      const command = received.toString('ascii', 2, 2 + received.readUInt16BE(0));
      server.commands.push(command);
      const answer = server.raw ?? encodeStatus(server.status);
      switch (server.mode) {
        case 'hang':
          return;
        case 'close':
          socket.end(answer.subarray(0, 20));
          return;
        case 'garbage':
          socket.end(Buffer.from('HTTP/1.1 400 Bad Request\r\n\r\n'));
          return;
        case 'split': {
          // One byte at a time: records cut anywhere.
          let i = 0;
          const next = () => {
            if (i < answer.length && !socket.destroyed) {
              socket.write(answer.subarray(i, i + 1));
              i += 1;
              setImmediate(next);
            }
          };
          next();
          return;
        }
        default:
          socket.write(answer);
      }
    });
  });
  await new Promise((resolve) => tcp.listen(0, '127.0.0.1', resolve));
  server.host = '127.0.0.1';
  server.port = tcp.address().port;
  server.close = () =>
    new Promise((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      tcp.close(resolve);
    });
  return server;
}
