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
