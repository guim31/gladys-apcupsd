import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseServers } from '../src/config.js';

test('normalizeConfig gives usable defaults', () => {
  assert.deepEqual(normalizeConfig(), {
    servers: [],
    invalidServers: [],
    pollIntervalMs: 10_000,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(null).servers, []);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('a server is host or host:port, the port defaulting to 3551', () => {
  const { servers, invalid } = parseServers(
    '192.0.2.10, nas.example.lan:3552;[2001:db8::1]:3553\n2001:db8::2',
  );
  assert.deepEqual(invalid, []);
  assert.deepEqual(
    servers.map((s) => [s.host, s.port, s.key]),
    [
      ['192.0.2.10', 3551, '192.0.2.10:3551'],
      ['nas.example.lan', 3552, 'nas.example.lan:3552'],
      ['2001:db8::1', 3553, '[2001:db8::1]:3553'],
      ['2001:db8::2', 3551, '[2001:db8::2]:3551'],
    ],
  );
});

test('duplicates are dropped, mistakes are reported', () => {
  const { servers, invalid } = parseServers(
    '192.0.2.10 192.0.2.10:3551 http://192.0.2.12:3551/ 300.1.1.1 192.0.2.13:99999 bad_host 1.2.3',
  );
  assert.deepEqual(
    servers.map((s) => s.key),
    ['192.0.2.10:3551', '192.0.2.12:3551'],
  );
  assert.deepEqual(invalid, ['300.1.1.1', '192.0.2.13:99999', 'bad_host', '1.2.3']);
});

test('the refresh interval and the language only take the offered values', () => {
  assert.equal(normalizeConfig({ poll_interval: '30' }).pollIntervalMs, 30_000);
  assert.equal(normalizeConfig({ poll_interval: 5 }).pollIntervalMs, 5_000);
  assert.equal(normalizeConfig({ poll_interval: '1' }).pollIntervalMs, 10_000);
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
