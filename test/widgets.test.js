// -----------------------------------------------------------------------------
// The `ups` dashboard widget: rendered exactly as sent (SDK validator), bound
// to features that exist on the device, colored by what needs attention.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { NisError } from '../src/nis.js';
import { loadFixture } from './helpers/fakeNis.js';
import { createWorld, HOST_A, HOST_B, withStatus } from './helpers/world.js';

const backUps = await loadFixture('back-ups-es-600');
const smartUps = await loadFixture('smart-ups-1400');
const A = `${HOST_A}:3551`;
const B = `${HOST_B}:3551`;

async function content(world, request) {
  const ack = await world.gladys.fake.widgetGet('ups', request);
  assert.equal(ack.success, true);
  return ack.data.content;
}

function statusItem(widget) {
  return widget.components.find((c) => c.type === 'status').items[0];
}

test('the widget shows the state and live tiles bound to existing features', async () => {
  const world = await createWorld({
    config: { servers: `${HOST_A}, ${HOST_B}` },
    statuses: { [A]: backUps, [B]: smartUps },
  });
  try {
    const devices = world.gladys.fake.discoveredDevices;
    for (const language of ['en', 'fr', 'de', 'es']) {
      for (const device of devices) {
        const widget = await content(world, { settings: { ups: device.external_id }, language });
        assert.deepEqual(validateWidgetContent(widget), [], `${device.name} (${language})`);
        const featureIds = new Set(device.features.map((f) => f.external_id));
        for (const component of widget.components) {
          if (component.device_feature) {
            assert.ok(featureIds.has(component.device_feature), component.device_feature);
          }
        }
      }
    }
    const back = await content(world, {
      settings: { ups: devices[0].external_id },
      language: 'fr',
    });
    assert.deepEqual(
      back.components.filter((c) => c.type === 'value').map((c) => c.label),
      ['Charge batterie', 'Autonomie', 'Charge', 'Puissance'],
    );
    assert.deepEqual(statusItem(back), {
      label: 'État',
      value: 'Sur secteur',
      color: WIDGET_COLORS.SUCCESS,
    });

    const smart = await content(world, {
      settings: { ups: devices[1].external_id },
      language: 'en',
    });
    assert.equal(statusItem(smart).value, 'On mains, Lowering voltage');
    assert.ok(!smart.components.some((c) => c.type === 'text'), 'no power, no caption');

    const fallback = await content(world, { language: 'en' });
    assert.equal(
      fallback.components[0].device_feature,
      back.components[0].device_feature,
      'first UPS',
    );
  } finally {
    await world.close();
  }
});

test('the color says what needs attention', async () => {
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: backUps } });
  try {
    const colorOf = async (status) => {
      world.statuses[A] = status;
      world.advance(10_000);
      await world.monitor.cycle();
      return statusItem(await content(world, { language: 'en' })).color;
    };
    assert.equal(await colorOf(withStatus(backUps, 'ONBATT')), WIDGET_COLORS.WARNING);
    assert.equal(await colorOf(withStatus(backUps, 'ONBATT LOWBATT')), WIDGET_COLORS.DANGER);
    assert.equal(await colorOf(withStatus(backUps, 'ONLINE REPLACEBATT')), WIDGET_COLORS.WARNING);
    assert.equal(await colorOf(withStatus(backUps, 'ONLINE OVERLOAD')), WIDGET_COLORS.DANGER);
    assert.equal(await colorOf(withStatus(backUps, 'COMMLOST')), WIDGET_COLORS.DANGER);

    world.statuses[A] = new NisError('TIMEOUT', 'no answer');
    world.advance(10_000);
    await world.monitor.cycle();
    const down = await content(world, { language: 'es' });
    assert.deepEqual(statusItem(down), {
      label: 'Estado',
      value: 'apcupsd inaccesible',
      color: WIDGET_COLORS.DANGER,
    });
    assert.deepEqual(validateWidgetContent(down), []);
  } finally {
    await world.close();
  }
});

test('without a UPS added to Gladys, the widget says how to add one', async () => {
  const world = await createWorld({
    config: { servers: HOST_A },
    statuses: { [A]: backUps },
    addDevices: false,
  });
  try {
    const widget = await content(world, { language: 'de' });
    assert.deepEqual(validateWidgetContent(widget), []);
    assert.match(widget.components[0].text, /Füge deine USV/);
  } finally {
    await world.close();
  }
});

test('a status change asks the dashboards for a fresh widget', async () => {
  const world = await createWorld({ config: { servers: HOST_A }, statuses: { [A]: backUps } });
  try {
    const before = world.gladys.fake.widgetRefreshes.length;
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(world.gladys.fake.widgetRefreshes.length, before, 'nothing changed');
    world.statuses[A] = withStatus(backUps, 'ONBATT');
    world.advance(10_000);
    await world.monitor.cycle();
    assert.equal(world.gladys.fake.widgetRefreshes.length, before + 1);
  } finally {
    await world.close();
  }
});
