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

test('Base64 toolkit round-trips UTF-8 and the URL-safe alphabet', () => {
  assert.equal(Lib.b64encode('hello, har gow'), 'aGVsbG8sIGhhciBnb3c=');
  assert.equal(Lib.b64decode('aGVsbG8sIGhhciBnb3c=').text, 'hello, har gow');
  const zh = '蝦餃 ✨?>'; const u = Lib.b64encode(zh, { urlSafe: true });
  assert.doesNotMatch(u, /[+/=]/); assert.equal(Lib.b64decode(u).text, zh);
  assert.equal(Lib.b64decode('a$b').error, 'NOT_BASE64');
  assert.equal(Lib.b64decode('').error, 'EMPTY');
  assert.equal(Lib.b64decode(Lib.b64encode(new Uint8Array([0xff, 0xfe, 0x00]))).binary, true);
});

test('converter handles CSV quoting, tables and Markdown safely', () => {
  const csv = 'name,note\n"har gow","says ""hi"", twice"\nsiu mai,"two\nlines"\n';
  const j = JSON.parse(Lib.convertText('csv>json', csv).text);
  assert.deepEqual(j, [{ name: 'har gow', note: 'says "hi", twice' }, { name: 'siu mai', note: 'two\nlines' }]);
  assert.equal(Lib.convertText('json>csv', JSON.stringify(j)).text, 'name,note\nhar gow,"says ""hi"", twice"\nsiu mai,"two\nlines"\n');
  assert.equal(Lib.convertText('json>csv', '[1,2]').error, 'NOT_A_TABLE');
  assert.equal(Lib.convertText('json>yaml', '{').error, 'MALFORMED_JSON');
  assert.match(Lib.convertText('json>yaml', '{"a":[1,"x"]}').text, /^"a": \n  - 1\n  - "x"\n$/);
  assert.equal(Lib.parseCsv('a,"b').error, 'UNCLOSED_QUOTE');
  assert.doesNotMatch(Lib.convertText('md>html', '<script>x</script>').text, /<script>/);
  assert.equal(Lib.convertText('mp4>gif', '').error, 'UNSUPPORTED');
});

test('charts are built from real local records only', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const recs = [
    { at: '2026-11-06T10:00:00Z', ok: true, durationMs: 540000 }, { at: '2026-11-05T10:00:00Z', ok: false, durationMs: 300000 },
    { at: '2026-11-05T11:00:00Z', ok: true }, { at: '2026-10-01T10:00:00Z', ok: true, durationMs: 720000 },
  ];
  const c = Lib.chartData(recs, { now });
  assert.deepEqual(c.timed.map(t => t.minutes), [9, 5, 12]);
  assert.equal(c.median, 9); assert.equal(c.latest, 12);
  assert.deepEqual(c.outcomes.slice(-2), [{ day: '2026-11-05', ok: 1, bad: 1 }, { day: '2026-11-06', ok: 1, bad: 0 }]);
  assert.deepEqual(Lib.linePoints([1, 3], 100, 50, 0), [[0, 50], [100, 0]]);
  assert.deepEqual(Lib.chartData([]).timed, []);
});

test('logo settings accept only known symbols, colours and real image data', () => {
  assert.deepEqual(Lib.cleanLogo({ symbol: 'evil', shape: 'blob', bg: 'teal' }), { symbol: 'rocket_launch', shape: 'rounded', bg: '#008080', fg: null });
  assert.equal(Lib.cleanLogo({ image: 'data:image/svg+xml;base64,PHN2Zz4=' }).image, undefined);
  assert.equal(Lib.cleanLogo({ image: 'data:image/png;base64,iVBORw0KGgo=' }).image, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(Lib.imageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'png');
  assert.equal(Lib.imageKind(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), null);
});

test('funny levels are independent per language', () => {
  assert.equal(Lib.funny('success', { en: 1, yue: 5 }, 'en'), Lib.funny('success', 1, 'en'));
  assert.equal(Lib.funny('success', { en: 1, yue: 5 }, 'yue'), Lib.funny('success', 5, 'yue'));
  assert.equal(Lib.funny('success', { en: 2, yue: 4 }, 'both'), Lib.funny('success', 2, 'en') + ' · ' + Lib.funny('success', 4, 'yue'));
});

test('colour translator handles alpha, conversions and contrast', () => {
  assert.equal(Lib.parseColor('rgba(74, 222, 154, 0.8)'), '#4ade9acc');
  assert.equal(Lib.parseColor('#4ade9a80'), '#4ade9a80');
  assert.equal(Lib.parseColor('hsla(0, 100%, 50%, 50%)'), '#ff000080');
  assert.equal(Lib.parseColor('rgba(1,2,3,2)'), null);
  assert.equal(Lib.parseColor('rgb(1,2,3)'), '#010203');
  assert.equal(Lib.toRgb('#4ade9acc'), 'rgba(74, 222, 154, 0.8)');
  assert.equal(Lib.hsvToHex(0, 100, 100), '#ff0000');
  assert.deepEqual(Lib.hexToHsv('#ff0000'), { h: 0, s: 100, v: 100 });
  assert.equal(Lib.contrast('#ffffff', '#000000'), 21);
  assert.ok(Lib.contrast('#ffffff00', '#000000') < 1.1);
});

test('scheduled settings pick the latest rule per setting and validate values', () => {
  const rules = [
    { key: 'theme', value: 'light', at: '07:00', days: [0, 1, 2, 3, 4, 5, 6] },
    { key: 'theme', value: 'dark', at: '19:00', days: [0, 1, 2, 3, 4, 5, 6] },
    { key: 'language', value: 'yue', at: '09:00', days: [6] },
    { key: 'theme', value: 'purple', at: '10:00', days: [1] },
  ];
  const fri20 = new Date(2026, 10, 6, 20, 0), fri08 = new Date(2026, 10, 6, 8, 0), mon01 = new Date(2026, 10, 9, 1, 0);
  assert.deepEqual(Lib.scheduledValues(rules, fri20), { theme: 'dark', language: 'yue' });
  assert.equal(Lib.scheduledValues(rules, fri08).theme, 'light');
  assert.equal(Lib.scheduledValues(rules, mon01).theme, 'dark');
  assert.equal(Lib.validRule(rules[3]), false);
  const ha = Lib.parseExternal('{"entity_id":"input_select.theme","state":"dark"}', { mapKey: 'theme' });
  assert.deepEqual(ha.applied, { theme: 'dark' });
  const obj = Lib.parseExternal('{"settings":{"calm":"on","theme":"neon","evil":1}}');
  assert.deepEqual(obj.applied, { calm: true }); assert.deepEqual(obj.ignored, ['theme', 'evil']);
});

test('funny level styles every message but keeps the facts', () => {
  const fact = 'Removed 2 deployment records.';
  assert.equal(Lib.styleMessage(fact, 'ok', { en: 1, yue: 1 }, 'en'), fact);
  for (const lv of [2, 3, 4, 5]) for (const k of ['ok', 'err']) assert.ok(Lib.styleMessage(fact, k, { en: lv, yue: lv }, 'en').includes(fact));
  assert.ok(Lib.styleMessage(fact, 'err', { en: 5, yue: 5 }, 'yue').startsWith('劇情急轉'));
});
