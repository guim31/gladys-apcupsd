// -----------------------------------------------------------------------------
// The NIS client against the raw bytes of a real apcupsd answer, and against a
// fake server on 127.0.0.1 (no network).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { decodeRecords, encodeCommand, parseStatusRecords, requestStatus } from '../src/nis.js';
import { loadFixture, startFakeNis } from './helpers/fakeNis.js';

const raw = await readFile(new URL('./fixtures/apcupsd/smart-ups-1400.nis', import.meta.url));
const parsed = await loadFixture('smart-ups-1400');

test('the status command is framed with its length', () => {
  assert.deepEqual(encodeCommand('status'), Buffer.from('\x00\x06status', 'latin1'));
});

test('a real apcupsd answer decodes to the status aioapcaccess reads', () => {
  const { records, complete } = decodeRecords(raw);
  assert.equal(complete, true);
  assert.equal(records.length, 53);
  assert.deepEqual(parseStatusRecords(records), parsed);
});

test('an answer cut anywhere is not complete yet', () => {
  for (const cut of [1, 2, 3, 30, raw.length - 2, raw.length - 1]) {
    assert.equal(decodeRecords(raw.subarray(0, cut)).complete, false, `cut at ${cut}`);
  }
});

test('requestStatus reads a server, even one sending a byte at a time', async (t) => {
  const server = await startFakeNis({ raw, mode: 'split' });
  t.after(() => server.close());
  const status = await requestStatus(server, { timeoutMs: 2000 });
  assert.deepEqual(status, parsed);
  assert.deepEqual(server.commands, ['status']);
});

test('requestStatus reports each failure with a code', async (t) => {
  const hanging = await startFakeNis({ raw, mode: 'hang' });
  const closing = await startFakeNis({ raw, mode: 'close' });
  const http = await startFakeNis({ raw, mode: 'garbage' });
  t.after(() => Promise.all([hanging.close(), closing.close(), http.close()]));

  await assert.rejects(requestStatus(hanging, { timeoutMs: 200 }), { code: 'TIMEOUT' });
  await assert.rejects(requestStatus(closing, { timeoutMs: 2000 }), { code: 'CLOSED' });
  await assert.rejects(requestStatus(http, { timeoutMs: 2000 }), (err) =>
    ['CLOSED', 'INVALID'].includes(err.code),
  );

  // A port nobody listens on: the NIS is off or bound to localhost only.
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  await assert.rejects(requestStatus({ host: '127.0.0.1', port }, { timeoutMs: 2000 }), {
    code: 'REFUSED',
  });
});

test('an oversized answer is refused', async (t) => {
  const huge = await startFakeNis({
    status: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`K${i}`, 'x'.repeat(40)])),
  });
  t.after(() => huge.close());
  await assert.rejects(requestStatus(huge, { timeoutMs: 2000 }), { code: 'INVALID' });
});
