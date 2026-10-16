// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code and the documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import {
  DEFAULT_DEVICE_NAME,
  MESSAGES,
  NAMES,
  REPORT_TEXT,
  STATUS_LABELS,
  TRANSFER_REASONS,
} from '../src/i18n.js';
import { TEXT } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  status: 40,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 50, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the same in every language, the description long enough', () => {
  assert.equal(typeof manifest.name, 'string');
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('every message table of the code has the four languages', () => {
  const longTexts = new Set(['noDevice', 'estimated']);
  const found = [
    ...problems(DEFAULT_DEVICE_NAME, 'DEFAULT_DEVICE_NAME', MAX.featureName),
    ...Object.entries(MESSAGES).flatMap(([key, value]) =>
      problems(value, `MESSAGES.${key}`, MAX.message),
    ),
    ...Object.entries(STATUS_LABELS).flatMap(([key, value]) =>
      problems(value, `STATUS_LABELS.${key}`, MAX.status),
    ),
    ...Object.entries(TRANSFER_REASONS).flatMap(([key, value]) =>
      problems(value, `TRANSFER_REASONS.${key}`, MAX.status),
    ),
    ...Object.entries(TEXT).flatMap(([key, value]) =>
      problems(value, `TEXT.${key}`, longTexts.has(key) ? MAX.message : MAX.status),
    ),
  ];
  assert.deepEqual(found, []);
});

test('the feature names exist in every language, distinct on a device', () => {
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
  for (const lang of LANGS) {
    const names = Object.values(NAMES[lang]);
    assert.equal(new Set(names).size, names.length, `duplicate feature name in ${lang}`);
  }
});

test('the server reports exist in every language', () => {
  const render = (value) =>
    typeof value === 'function'
      ? value(1, 2)
      : typeof value === 'object'
        ? Object.values(value)[0] // the hints, checked one by one below
        : value;
  assert.deepEqual(tableProblems(REPORT_TEXT, 'REPORT_TEXT', MAX.message, render), []);
  for (const lang of LANGS) {
    assert.deepEqual(
      sorted(Object.keys(REPORT_TEXT[lang].hint)),
      sorted(Object.keys(REPORT_TEXT.en.hint)),
      `REPORT_TEXT.${lang}.hint`,
    );
    for (const [code, text] of Object.entries(REPORT_TEXT[lang].hint)) {
      assert.deepEqual(textProblems(text, `hint.${lang}.${code}`, lang, 100), []);
    }
  }
});

test('the four documentations have the same sections', async () => {
  const headings = {};
  for (const lang of LANGS) {
    const text = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    headings[lang] = text.split('\n').filter((line) => /^#{1,3} /.test(line));
    assert.ok(text.length >= 3000, `docs/${lang}.md is too short`);
    if (lang === 'de') {
      assert.doesNotMatch(text, POLITE_GERMAN, 'docs/de.md says "du"');
    }
    assert.match(
      text,
      /Tested on real hardware|Testée sur du vrai matériel|Mit echter Hardware getestet|Probada con hardware real/,
    );
  }
  const shape = (lines) => lines.map((line) => line.match(/^#+/)[0]);
  for (const lang of LANGS) {
    assert.deepEqual(shape(headings[lang]), shape(headings.en), `docs/${lang}.md sections`);
    assert.ok(headings[lang].length >= 10, `docs/${lang}.md has ${headings[lang].length} headings`);
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'UPS', fr: 'Onduleur', de: 'USV' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'UPS', fr: 'Onduleur', de: '', es: 'SAI' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre USV', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
