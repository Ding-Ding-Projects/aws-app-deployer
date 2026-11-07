'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Lib = require('../../src/renderer/lib');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../src/renderer/kit.js'), 'utf8');
function harness() {
  const listeners = {}, hosts = [];
  const element = () => ({ style: { setProperty() {} }, classList: { add() {} }, setAttribute() {}, remove() {}, focus() {}, setSelectionRange() {}, contains(target) { return target.host === this; }, querySelector() { return element(); }, getBoundingClientRect() { return { width: 300, height: 200 }; } });
  const document = { getElementById: () => ({ className: 'app' }), createElement: element, body: { appendChild(host) { hosts.push(host); } }, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
  const context = { window: {}, document, Lib, innerWidth: 1024, innerHeight: 768, setTimeout() {} };
  vm.runInNewContext(source, context);
  return { kit: context.window.Kit, hosts, async event(type, fields) { const e = { preventDefault() {}, stopPropagation() {}, target: { closest() { return null; } }, ...fields }; for (const fn of listeners[type] || []) await fn(e); } };
}
test('filtered context actions keep original indexes and execute by keyboard or click', async () => {
  for (const mode of ['keyboard', 'click']) {
    const h = harness(); const ran = [];
    h.kit.openMenu([{ label: 'Copy', run: () => ran.push('copy') }, { label: 'Remove', danger: true, run: () => ran.push('remove') }], { x: 10, y: 10 });
    await h.event('input', { target: { id: 'ctxq', value: 'Remove', selectionStart: 6 } });
    const host = h.hosts[0];
    assert.match(host.innerHTML, /data-ctx-i="1"/); assert.doesNotMatch(host.innerHTML, /data-ctx-i="-1"/);
    assert.doesNotMatch(host.innerHTML, /hidden items keep/);
    if (mode === 'keyboard') await h.event('keydown', { key: 'Enter' });
    else { const target = { host, dataset: { ctxI: '1' }, closest: () => target }; await h.event('click', { target }); }
    assert.deepEqual(ran, ['remove']);
  }
});
test('confirmation cannot commit with zero or one key, and commits only once after both', async () => {
  const h = harness(); let committed = 0;
  h.kit.superConfirm({ title: 'Remove', detail: 'Remove local history', onConfirm: () => committed++ });
  const target = { id: 'scs', value: '100', host: h.hosts[0], style: { setProperty() {} } };
  await h.event('input', { target }); assert.equal(committed, 0);
  await h.event('keydown', { key: 'r' });
  await h.event('input', { target }); assert.equal(committed, 0);
  await h.event('keydown', { key: 'm' });
  target.value = '99'; await h.event('input', { target }); assert.equal(committed, 0);
  target.value = '100'; await h.event('input', { target }); assert.equal(committed, 1);
  await h.event('input', { target }); assert.equal(committed, 1);
});

test('menu rows for values carry live controls that change the setting and keep the menu open', async () => {
  const h = harness(); let sounds = false, theme = 'dark', size = 100;
  h.kit.openMenu([
    { kind: 'toggle', label: 'Action sounds', get: () => sounds, set: v => { sounds = v; } },
    { kind: 'choice', label: 'Theme', options: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], get: () => theme, set: v => { theme = v; } },
    { kind: 'level', label: 'Text size', min: 80, max: 160, step: 10, format: v => v + '%', get: () => size, set: v => { size = v; } },
    { kind: 'choice', label: 'Language', options: [['en', 'English']], get: () => 'en', set: () => {}, disabled: true, reason: 'English only while Study time is on' },
    { label: 'Copy', run: () => {} },
  ], { x: 10, y: 10 });
  const host = h.hosts[0];
  // A filterable menu is a combobox driving a listbox; values are options, never nested controls.
  assert.match(host.innerHTML, /role="combobox"[^>]*aria-controls="ctx-l-\d+"[^>]*aria-activedescendant="ctx-o-\d+-0"/);
  assert.match(host.innerHTML, /role="listbox"/);
  assert.match(host.innerHTML, /role="option"[^>]*aria-checked="false">[\s\S]*?Action sounds/);
  assert.match(host.innerHTML, /role="option"[^>]*aria-label="Theme: Dark"/);
  assert.match(host.innerHTML, /role="option"[^>]*aria-label="Text size: 100%"/);
  assert.match(host.innerHTML, /aria-disabled="true" aria-label="Language: English. English only while Study time is on"/);
  assert.doesNotMatch(host.innerHTML, /role="(switch|radio|radiogroup|slider|menuitem|menu)"/, 'no nested controls or menu roles');
  assert.doesNotMatch(host.innerHTML, /<button[^>]*data-ctl/, 'value pictures are not buttons');
  const ctl = (kind, rowIdx, extra = {}) => { const row = { dataset: { ctxI: String(rowIdx) } }; const t = { host, dataset: { ctl: kind, ...extra }, closest: sel => (sel === '[data-ctl]' ? t : sel === '[data-ctx-i]' ? row : null) }; return t; };
  await h.event('click', { target: ctl('toggle', 0) }); assert.equal(sounds, true);
  await h.event('click', { target: ctl('choice', 1, { v: '"light"' }) }); assert.equal(theme, 'light');
  await h.event('click', { target: ctl('inc', 2) }); assert.equal(size, 110);
  assert.equal(h.kit.menuOpen(), true, 'menu stays open after changing values');
  const key = k => h.event('keydown', { key: k, target: { id: 'ctxq', closest: () => null } });
  await key('Home'); await key(' '); assert.equal(sounds, false, 'Space on an empty filter flips the active switch');
  await key('ArrowDown'); await key('ArrowLeft'); assert.equal(theme, 'system', 'Left changes the active choice');
  await key('ArrowDown'); await key('ArrowRight'); assert.equal(size, 120, 'Right steps the active level');
  await key('ArrowDown'); await key('ArrowRight'); assert.equal(size, 120, 'a disabled value does not change');
  await h.event('click', { target: ctl('choice', 3, { v: '"en"' }) });
  assert.equal(h.kit.menuOpen(), true);
});
