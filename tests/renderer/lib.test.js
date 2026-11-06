'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Lib = require('../../src/renderer/lib');

test('three language modes, every string has both languages', () => {
  for (const [k, v] of Object.entries(Lib.STRINGS)) assert.ok(v[0] && v[1], k);
  assert.equal(Lib.t('deploy', 'en'), 'Deploy');
  assert.equal(Lib.t('deploy', 'yue'), '部署');
  assert.equal(Lib.t('deploy', 'both'), 'Deploy · 部署');
  assert.match(Lib.t('dim_sum_troll', 'en'), /cannot be turned off/);
});

test('funny level changes wording at every level, never to nothing', () => {
  const lines = [1, 2, 3, 4, 5].map(l => Lib.funny('success', l, 'en'));
  assert.equal(new Set(lines).size, 5);
  assert.equal(Lib.funny('failure', 99, 'yue'), Lib.funny('failure', 5, 'yue'));
});

test('personal vocabulary is validated whole and applied on word boundaries', () => {
  assert.equal(Lib.parseVocabulary('{').error, 'MALFORMED_JSON');
  assert.equal(Lib.parseVocabulary('{"version":2,"entries":{"a":"b"}}').error, 'SCHEMA');
  assert.equal(Lib.parseVocabulary('{"version":1,"entries":{"Deploy":"Ship","Deploy":"Push"}}').error, 'DUPLICATE_KEY');
  assert.equal(Lib.parseVocabulary('{"version":1,"entries":{"x":"<b>"}}').error, 'ENTRY_INVALID');
  assert.equal(Lib.parseVocabulary('x'.repeat(300 * 1024)).error, 'TOO_LARGE');
  const r = Lib.parseVocabulary('{"version":1,"entries":{"Deploy":"Ship","New deployment":"Fresh launch"}}');
  assert.equal(r.ok, true);
  assert.equal(Lib.applyVocabulary('New deployment · Deploy · Deployments', r.vocabulary), 'Fresh launch · Ship · Deployments');
});

test('regex builder explains tokens and reports invalid patterns', () => {
  const e = Lib.explainRegex('^(dep|roll)');
  assert.equal(e.ok, true);
  assert.deepEqual(e.parts.map(p => p.token), ['^', '(', 'dep', '|', 'roll', ')']);
  assert.equal(Lib.explainRegex('(').ok, false);
  const s = Lib.search([{ label: 'Deploy new application' }, { label: 'Settings' }], '^dep', { regex: true });
  assert.deepEqual(s.items.map(i => i.label), ['Deploy new application']);
});

test('colour translator round-trips hex, rgb, hsl and names', () => {
  assert.equal(Lib.parseColor('#ABC'), '#aabbcc');
  assert.equal(Lib.parseColor('rgb(110, 168, 255)'), '#6ea8ff');
  assert.equal(Lib.parseColor('hsl(0, 100%, 50%)'), '#ff0000');
  assert.equal(Lib.parseColor('teal'), '#008080');
  assert.equal(Lib.parseColor('rgb(300,0,0)'), null);
  assert.equal(Lib.toRgb('#6ea8ff'), 'rgb(110, 168, 255)');
});

test('schedule handles days and the midnight boundary', () => {
  const sch = { enabled: true, lightAt: '07:00', darkAt: '19:00', days: [0, 1, 2, 3, 4, 5, 6] };
  assert.equal(Lib.scheduledTheme(sch, new Date(2026, 10, 6, 12, 0)), 'light');
  assert.equal(Lib.scheduledTheme(sch, new Date(2026, 10, 6, 23, 30)), 'dark');
  assert.equal(Lib.scheduledTheme({ ...sch, lightAt: '20:00', darkAt: '06:00' }, new Date(2026, 10, 6, 2, 0)), 'light');
  assert.equal(Lib.scheduledTheme({ ...sch, days: [1] }, new Date(2026, 10, 6, 12, 0)), null);
  assert.equal(Lib.scheduledTheme({ ...sch, enabled: false }, new Date()), null);
});

test('every backend stage maps to a visible step', () => {
  for (const st of ['validation', 'identity', 'prerequisites', 'ownership', 'build', 'repository', 'push', 'stack', 'health', 'endpoint']) assert.ok(Lib.stageIndex(st) >= 0, st);
  assert.equal(Lib.stageIndex('complete'), Lib.STAGES.length);
  assert.equal(Lib.stageIndex('repository'), Lib.stageIndex('push'));
});

test('every setting on screen explains itself with real guided steps', () => {
  const { DEFAULTS } = require('../../src/main/store');
  for (const key of Lib.SETTINGS_ON_SCREEN) {
    const ex = Lib.EXPLAIN[key];
    assert.ok(ex, `missing explanation for ${key}`);
    assert.ok(ex.what.length > 40, `${key} explanation restates its label`);
    assert.ok(ex.steps.length >= 1, `${key} has no guided step`);
    assert.ok(key in DEFAULTS, `${key} has no real default to show as provenance`);
  }
});

test('exports state their schema and keep every value, and the ZIP is readable', () => {
  const rows = [{ name: 'a,b', nested: { x: 1 } }, { name: 'c', extra: 'only here' }];
  const csv = Lib.exportAs('csv', 'x/1', rows);
  assert.match(csv, /^# x\/1\nname,nested,extra\n"a,b","\{""x"":1\}",\nc,,only here\n$/);
  assert.equal(JSON.parse(Lib.exportAs('json', 'x/1', rows)).records[1].extra, 'only here');
  assert.match(Lib.exportAs('md', 'x/1', rows), /\| a,b \| \{"x":1\} \|/);
  assert.match(Lib.exportAs('yaml', 'x/1', rows), /"encoding": "UTF-8"/);
  const z = Lib.zip([{ name: 'a.json', data: '{}' }]);
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
  assert.throws(() => Lib.zip([{ name: '../evil', data: '' }]));
  assert.equal(Lib.crc32(new TextEncoder().encode('hello')), 0x3610a686);
});

test('markdown escapes HTML and keeps links inside the app', () => {
  const h = Lib.markdown('# T\n<script>x</script> [docs](tabs) [bad](javascript:alert(1)) [web](https://github.com)');
  assert.ok(!h.includes('<script>'));
  assert.match(h, /data-doc="tabs"/);
  assert.ok(!/javascript:/.test(h));
  assert.match(h, /data-url="https:\/\/github.com"/);
});

test('history labels say what actually changed', () => {
  assert.equal(Lib.historyLabel({ key: 'theme', before: 'system', after: 'dark' }), 'theme changed: "system" → "dark"'.replace(/"/g, '') );
  assert.equal(Lib.historyCategory({ key: 'theme' }), 'Appearance');
  assert.equal(Lib.historyCategory({ key: 'theme', restoredFrom: 2 }), 'Restores');
});

test('appearance editor turns only validated values into CSS', () => {
  const a = { elements: {
    'go:settings': { rest: { size: 18, weight: 640, italic: true, underline: true, strike: true, color: 'red', radius: 12 }, hover: { glow: 10, background: 'url(x)' }, focus: { font: 'mono' } },
    'bad"key': { rest: { size: 20 } },
    'act:deploy': { rest: { size: 500, color: 'expression(alert(1))', font: 'Comic; }' } },
  }, presets: { 'Big <b>': { rest: { size: 20 } }, Loud: { rest: { caps: true } } } };
  const css = Lib.appearanceCss(a);
  assert.match(css, /\[data-ak="go:settings"\] \{ font-size: 18px !important; font-weight: 650 !important; font-style: italic !important; color: #ff0000 !important; border-radius: 12px !important; text-decoration: underline line-through !important; \}/);
  assert.match(css, /\[data-ak="go:settings"\]:hover \{ box-shadow: 0 0 10px var\(--ac\) !important; \}/);
  assert.match(css, /:focus-visible \{ font-family: "JetBrains Mono"/);
  assert.doesNotMatch(css, /bad|act:deploy|url\(|expression|Comic/);
  const clean = Lib.cleanAppearance(a);
  assert.deepEqual(Object.keys(clean.presets), ['Loud']);
  assert.equal(clean.elements['act:deploy'], undefined);
});

test('style files must carry the schema and something usable', () => {
  assert.equal(Lib.parseStyleFile('{').error, 'MALFORMED_JSON');
  assert.equal(Lib.parseStyleFile('{"elements":{}}').error, 'SCHEMA');
  assert.equal(Lib.parseStyleFile('{"schema":"aws-app-deployer.appearance/1","elements":{"x":{"rest":{"size":999}}}}').error, 'NOTHING_USABLE');
  const r = Lib.parseStyleFile('{"schema":"aws-app-deployer.appearance/1","elements":{"go:help":{"pressed":{"opacity":50}}}}');
  assert.ok(r.ok); assert.equal(Lib.appearanceCss(r.appearance), '.app [data-ak="go:help"]:active { opacity: 0.5 !important; }');
});
