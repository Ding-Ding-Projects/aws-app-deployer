'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../src/renderer/browser.js'), 'utf8');
function harness({ hash = '#token=private-key', existing, replies = [] } = {}) {
  const calls = [], timers = [], history = [], nodes = [], reloads = [];
  const node = () => ({ style: {}, events: {}, append(...args) { nodes.push(...args); }, replaceChildren() {}, remove() {}, addEventListener(type, fn) { this.events[type] = fn; }, setAttribute() {}, click() {}, focus() {} });
  const context = { window: existing ? { deployer: existing } : {}, location: { hash, pathname: '/', search: '', reload() { reloads.push(true); } }, history: { replaceState(...args) { history.push(args); } }, document: { getElementById: node, createElement: node, body: node() }, URL, URLSearchParams, Uint8Array, Blob, btoa: s => Buffer.from(s, 'binary').toString('base64'), setTimeout: fn => timers.push(fn), fetch: async (path, options) => { calls.push({ path, ...options }); return { status: 200, json: async () => replies.shift() || { ok: true } }; } };
  vm.runInNewContext(source, context);
  return { api: context.window.deployer, calls, timers, history, nodes, reloads };
}
test('desktop preload bridge is never replaced', () => {
  const bridge = { desktop: true };
  const h = harness({ existing: bridge });
  assert.equal(h.api, bridge); assert.equal(h.calls.length, 0);
});
test('fragment key is exchanged once and removed before authenticated RPC', async () => {
  const h = harness();
  assert.equal((await h.api.ready()).ok, true);
  await h.api.ready(); await h.api.identity({ profile: 'default', region: 'us-east-1' });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].path, '/api/session');
  assert.deepEqual(JSON.parse(h.calls[0].body), { token: 'private-key' });
  assert.deepEqual(h.history[0], [null, '', '/']);
  assert.equal(h.calls[1].body.includes('private-key'), false);
  assert.equal(h.calls[1].credentials, 'same-origin');
});
test('missing fragment resumes existing protected session via settings RPC', async () => {
  const h = harness({ hash: '' }); await h.api.ready();
  assert.deepEqual(JSON.parse(h.calls[0].body), { method: 'settings', args: [] });
});
test('invalid access renders locked state and does not start polling', async () => {
  const h = harness({ replies: [{ ok: false, error: 'AUTH_REQUIRED' }] });
  assert.equal((await h.api.ready()).ok, false); assert.equal(h.timers.length, 0);
  assert.ok(h.nodes.some(n => n.textContent === 'Protected browser companion'));
});
test('upload rejects traversal, duplicate paths, oversized and excessive files before reading bytes', async () => {
  const h = harness();
  for (const path of ['../Dockerfile', '/etc/Dockerfile', 'project/../Dockerfile', 'project\\Dockerfile', 'C:/Dockerfile', 'project/\0Dockerfile']) {
    assert.equal((await h.api.uploadFiles([{ name: path, size: 1 }])).error, 'UPLOAD_INVALID');
  }
  assert.equal((await h.api.uploadFiles([{ name: 'Dockerfile', size: 1 }, { name: 'Dockerfile', size: 1 }])).error, 'UPLOAD_INVALID');
  assert.equal((await h.api.uploadFiles([{ name: 'Dockerfile', size: 21 * 1024 * 1024 }])).error, 'UPLOAD_TOO_LARGE');
  assert.equal((await h.api.uploadFiles(Array(501).fill({ size: 0 }))).error, 'UPLOAD_TOO_LARGE');
  assert.equal(h.calls.length, 0);
});
test('upload preserves binary bytes and chooses shallowest Dockerfile', async () => {
  const h = harness({ replies: [{ ok: true, files: ['/uploads/id/project/nested/Dockerfile', '/uploads/id/project/Dockerfile'] }] });
  const r = await h.api.uploadFiles([{ name: 'Dockerfile', webkitRelativePath: 'project/Dockerfile', size: 3, arrayBuffer: async () => Uint8Array.from([0, 128, 255]).buffer }]);
  assert.equal(r.path, '/uploads/id/project/Dockerfile');
  assert.deepEqual(JSON.parse(h.calls[0].body), { files: [{ path: 'project/Dockerfile', content: 'AID/' }] });
});
test('operation poll delivers events and advances cursor', async () => {
  const h = harness({ replies: [{ ok: true }, { ok: true, events: [{ seq: 5, kind: 'login', type: 'cancelled' }], cursor: 5 }, { ok: true, events: [], cursor: 5 }] });
  const events = []; h.api.onOperation(e => events.push(e)); await h.api.ready();
  await h.timers.shift()(); await h.timers.shift()();
  assert.equal(events[0].type, 'cancelled'); assert.equal(h.calls[2].path, '/api/events?after=5');
});
test('authorization code uses RPC once and is not included in later calls', async () => {
  const h = harness(); await h.api.submitLoginCode('op-1', 'secret-code'); await h.api.profiles();
  assert.deepEqual(JSON.parse(h.calls[0].body), { method: 'submitLoginCode', args: ['op-1', 'secret-code'] });
  assert.equal(h.calls[1].body.includes('secret-code'), false);
});

test('access key form clears its password field and reloads after cookie exchange', async () => {
  const h = harness({ hash: '', replies: [{ ok: false, error: 'AUTH_REQUIRED' }, { ok: true }] });
  await h.api.ready();
  const input = h.nodes.find(n => n.id === 'companion-key');
  const form = h.nodes.find(n => n.events.submit);
  assert.equal(input.type, 'password'); assert.equal(input.autocomplete, 'off');
  input.value = 'manual-private-key';
  const pending = form.events.submit({ preventDefault() {} });
  assert.equal(input.value, '');
  await pending;
  assert.deepEqual(JSON.parse(h.calls[1].body), { token: 'manual-private-key' });
  assert.equal(h.reloads.length, 1);
});
test('rejected access key permits retry without persisting the key', async () => {
  const h = harness({ hash: '', replies: [{ ok: false, error: 'AUTH_REQUIRED' }, { ok: false, error: 'AUTH_REQUIRED' }] });
  await h.api.ready();
  const input = h.nodes.find(n => n.id === 'companion-key'); input.value = 'wrong-key';
  await h.nodes.find(n => n.events.submit).events.submit({ preventDefault() {} });
  assert.equal(input.value, ''); assert.equal(h.reloads.length, 0);
  assert.equal(h.nodes.find(n => n.textContent === 'Connect').disabled, false);
  assert.ok(h.nodes.some(n => /Access key not accepted/.test(n.textContent)));
});
test('sign-out deletes the server session and stops authenticated polling', async () => {
  const h = harness(); await h.api.ready(); await h.api.signOut();
  assert.equal(h.api.authenticated, false);
  assert.equal(h.calls[1].path, '/api/session'); assert.equal(h.calls[1].method, 'DELETE');
  assert.equal(h.reloads.length, 1);
  await h.timers.shift()(); assert.equal(h.calls.length, 2);
});

test('browser provenance reports actual server version without claiming a packaged updater', async () => {
  const h = harness({ replies: [{ ok: true, version: '0.2.1', browser: true }] });
  const provenance = await h.api.provenance();
  assert.equal(provenance.ok, false); assert.equal(provenance.version, '0.2.1');
  assert.equal((await h.api.updateState()).status, 'not-installed');
  assert.equal((await h.api.checkUpdates()).status, 'not-installed');
  assert.equal((await h.api.installUpdate()).error, 'UNSUPPORTED_OPERATION');
  assert.equal(typeof h.api.onUpdate(() => assert.fail('No browser updater events')), 'function');
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(h.calls[0].body).method, 'version');
});

test('browser exposes the history removal bridge', async () => {
  const h = harness();
  await h.api.removeDeployments([123]);
  assert.deepEqual(JSON.parse(h.calls[0].body), { method: 'removeDeployments', args: [[123]] });
});
