// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// statuses: a Back-UPS ES 600 (USB), a SMART-UPS 1400 (no nominal power), an
// old apcupsd without model nor serial, and a UPS reporting every field this
// integration reads — in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFixture } from './helpers/fakeNis.js';
import { createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const backUps = await loadFixture('back-ups-es-600');
const smartUps = await loadFixture('smart-ups-1400');
const minimal = await loadFixture('minimal-3.8.5');
// Every field read by the integration, real dates included.
const everything = {
  ...backUps,
  SERIALNO: '3B0000X00002',
  OUTPUTV: '120.0 Volts',
  NOMOUTV: '120 Volts',
  XONBATT: '2026-10-12 06:41:02 +0200',
  BATTDATE: '2024-03-15',
  STATUS: 'ONBATT LOWBATT REPLACEBATT',
};

const statuses = {
  '192.0.2.10:3551': backUps,
  '192.0.2.11:3551': smartUps,
  '192.0.2.12:3551': minimal,
  '192.0.2.13:3551': everything,
};
const servers = Object.keys(statuses).join(', ');

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`every discovered device follows the Gladys rules (${language})`, async () => {
    const world = await createWorld({ config: { servers, language }, statuses });
    try {
      const devices = world.gladys.fake.discoveredDevices;
      assert.equal(devices.length, 4, 'one device per UPS');
      assert.equal(new Set(devices.map((d) => d.external_id)).size, 4, 'unique device ids');

      for (const device of devices) {
        const where = device.name;
        assert.ok(device.name, 'a device name');

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }
    } finally {
      await world.close();
    }
  });
}
