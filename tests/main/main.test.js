'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInstaller, classify } = require('../../src/main/installer');
const { createStore } = require('../../src/main/store');
const { createBridge, safeExternal, inspectDockerfile } = require('../../src/main/bridge');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aad-'));
const ok = (stdout = '') => ({ ok: true, stdout, stderr: '' });
const fail = exitCode => ({ ok: false, error: 'COMMAND_FAILED', exitCode });

test('installer uses winget silently, refreshes PATH and never opens a page', async () => {
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args].join(' ')); return cmd === 'powershell.exe' ? ok('C:\\new\\path') : ok('v1'); };
  const env = {};
  const r = await createInstaller({ run, platform: 'win32', env, pause: async () => {} }).installOne('aws');
  assert.equal(r.ok, true);
  assert.ok(calls.some(c => c.startsWith('winget install --id Amazon.AWSCLI -e --silent')));
  assert.ok(!calls.some(c => /start\s+http|explorer|open/i.test(c)));
  assert.equal(env.PATH, 'C:\\new\\path');
});

test('installer falls back to the publisher installer and refuses a bad signature', async () => {
  const dir = tmp();
  const fetchUrl = async () => ({ ok: true, status: 200, headers: new Map([['content-length', '3']]), body: [Buffer.from('abc')] });
  let installed = false;
  const run = async (cmd, args) => {
    if (cmd === 'winget') return { ok: false, error: 'UNAVAILABLE' };
    if (cmd === 'powershell.exe' && args.join(' ').includes('Get-AuthenticodeSignature')) return ok(JSON.stringify({ status: 'NotSigned', subject: '' }));
    if (cmd === 'msiexec') installed = true;
    return ok();
  };
  const events = [];
  const r = await createInstaller({ run, fetchUrl, platform: 'win32', env: {}, tempDir: dir, pause: async () => {} }).installOne('aws', { onProgress: e => events.push(e) });
  assert.deepEqual([r.ok, r.error], [false, 'SIGNATURE_INVALID']);
  assert.equal(installed, false);
  assert.ok(events.some(e => e.repair === 'publisher-installer'));
  assert.equal(fs.readdirSync(dir).length, 0, 'unsigned download is deleted');
});

test('installer repairs WSL and starts Docker, and reports a declined prompt exactly', async () => {
  let dockerUp = false, wslOk = false;
  const run = async (cmd, args) => {
    if (cmd === 'wsl.exe' && args[0] === '--status') return wslOk ? ok() : fail(1);
    if (cmd === 'wsl.exe') { wslOk = true; return ok(); }
    if (cmd === 'docker') return dockerUp ? ok('"27"') : fail(1);
    if (cmd === 'powershell.exe' && args.join(' ').includes('Start-Process')) { dockerUp = true; return ok(); }
    return ok();
  };
  const events = [];
  const r = await createInstaller({ run, platform: 'win32', env: {}, pause: async () => {}, exists: () => true }).installOne('docker', { onProgress: e => events.push(e.repair) });
  assert.equal(r.ok, true);
  assert.ok(events.includes('wsl-enable') && events.includes('docker-start'));
  assert.equal(classify(fail(1223)), 'ELEVATION_DECLINED');
  assert.equal(classify(fail(1625)), 'POLICY_BLOCKED');
  assert.equal(classify(fail(3010)), 'REBOOT_REQUIRED');
  const stop = await createInstaller({ run: async (c, a) => (c === 'winget' && a[0] === 'install' ? fail(1223) : ok()), platform: 'win32', env: {} }).installOne('aws');
  assert.deepEqual([stop.ok, stop.error], [false, 'ELEVATION_DECLINED']);
  assert.equal((await createInstaller({ run: async () => ok(), platform: 'linux' }).installOne('aws')).error, 'UNSUPPORTED_PLATFORM');
});

test('store validates, records history and keeps the dim sum surprise on', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ settings: { dimSum: false, theme: 'neon', language: 'yue' } }));
  const s = createStore(dir);
  assert.equal(s.get().theme, 'system');
  assert.equal(s.get().language, 'yue');
  assert.equal('dimSum' in s.get(), false);
  assert.deepEqual(s.set('dimSum', false), { ok: true, value: true, locked: true });
  assert.equal(s.set('funnyLevel', 9).ok, false);
  assert.equal(s.set('funnyLevel', 5).ok, true);
  assert.equal(s.set('draft', { secrets: 'x' }).ok, false);
  assert.equal(s.history().at(-1).key, 'funnyLevel');
  assert.equal(createStore(dir).get().funnyLevel, 5, 'persists across restart');
  s.set('displayName', 'My deployer'); s.reset('displayName');
  assert.equal(s.get().displayName, '');
});

test('bridge validates inputs again and scopes operation events', async () => {
  const events = [];
  const identity = { accountId: '123456789012', arn: 'arn:aws:sts::123456789012:assumed-role/Dev/s', profile: 'dev', region: 'us-east-1' };
  const bridge = createBridge({
    backend: { login: async () => ({ ok: true, identity }) },
    deployer: { deploy: async (input, { onProgress }) => { onProgress({ stage: 'build' }); return { ok: true, url: 'http://x.elb.amazonaws.com', image: 'img@sha256:1' }; } },
    installer: {}, store: { recordDeployment: e => events.push(['recorded', e.ok]) }, emit: e => events.push([e.type, e.op, e.scope?.accountId]), uuid: () => 'abcdef12-0000',
  });
  assert.equal(bridge.login({ profile: '--evil', region: 'us-east-1' }).error, 'INVALID_INPUT');
  assert.equal(bridge.deploy({ profile: 'dev', region: 'us-east-1', expectedIdentity: identity, name: 'Bad Name', source: {} }).error, 'INVALID_INPUT');
  assert.equal(bridge.deploy({ profile: 'dev', region: 'us-east-1', expectedIdentity: identity, name: 'web-app', source: { kind: 'dockerfile', contextPath: 'rel', dockerfilePath: '/a/Dockerfile' } }).error, 'INVALID_INPUT');
  const r = bridge.deploy({ profile: 'dev', region: 'us-east-1', expectedIdentity: identity, name: 'web-app', source: { kind: 'dockerfile', contextPath: '/a', dockerfilePath: '/a/Dockerfile' }, environment: { NODE_ENV: 'production' } });
  assert.deepEqual(r, { ok: true, op: 'op-abcdef12' });
  await new Promise(res => setTimeout(res, 10));
  assert.deepEqual(events.map(e => e[0]), ['started', 'progress', 'recorded', 'succeeded']);
  assert.ok(events.filter(e => e[0] !== 'recorded').every(e => e[1] === 'op-abcdef12' && e[2] === '123456789012'));
  assert.equal(bridge.cancel('op-nope').error, 'UNKNOWN_OPERATION');
});

test('external links are limited to the app link hosts', () => {
  assert.equal(safeExternal('http://my-alb-123.us-east-1.elb.amazonaws.com/'), true);
  assert.equal(safeExternal('https://github.com/Ding-Ding-Projects/aws-app-deployer'), true);
  assert.equal(safeExternal('http://github.com/'), false);
  assert.equal(safeExternal('file:///C:/Windows/system32/calc.exe'), false);
  assert.equal(safeExternal('https://user:pw@github.com/'), false);
  assert.equal(safeExternal('https://evil.example/'), false);
});

test('Dockerfile inspection finds a single exposed TCP port', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:22\nEXPOSE 8080/tcp\nEXPOSE 9229/udp\n');
  const r = await inspectDockerfile(path.join(dir, 'Dockerfile'));
  assert.equal(r.source.containerPort, 8080);
  assert.equal(r.source.contextPath, dir);
});

test('updater is honest outside a Squirrel install and only installs when ready', () => {
  const { createUpdater, handleSquirrelEvent } = require('../../src/main/updater');
  const sent = [];
  const u = createUpdater({ app: { getVersion: () => '0.1.9' }, autoUpdater: {}, isSquirrel: false, send: s => sent.push(s) });
  assert.equal(u.state().status, 'not-installed');
  assert.equal(u.check().status, 'not-installed');
  assert.equal(u.install().error, 'NOT_READY');
  const handlers = {};
  const au = { setFeedURL: o => (handlers.feed = o.url), on: (e, f) => (handlers[e] = f), checkForUpdates: () => handlers['update-downloaded']({}, '', 'v0.2.0'), quitAndInstall: () => (handlers.installed = true) };
  const s = createUpdater({ app: { getVersion: () => '0.1.9' }, autoUpdater: au, isSquirrel: true, send: x => sent.push(x) });
  assert.match(handlers.feed, /^https:\/\/github\.com\/Ding-Ding-Projects\/aws-app-deployer\/releases\/latest\/download$/);
  s.check();
  assert.deepEqual([s.state().status, s.state().next], ['ready', '0.2.0']);
  assert.equal(s.install().ok, true);
  assert.equal(handlers.installed, true);
  assert.equal(handleSquirrelEvent({ quit() {} }), false);
});

test('store reports where each value came from and removes records with a history entry', () => {
  const dir = tmp();
  const s = createStore(dir);
  assert.equal(s.sources().theme, 'default');
  s.set('theme', 'dark');
  assert.equal(createStore(dir).sources().theme, 'file');
  s.recordDeployment({ name: 'a' }); s.recordDeployment({ name: 'b' });
  const ats = s.deployments().map(d => d.id);
  const r = s.removeDeployments([ats[0], 'missing']);
  assert.deepEqual([r.removed, r.skipped], [1, 1]);
  assert.equal(s.history().at(-1).key, 'deployments.removed');
  assert.equal(s.set('a11y', { textSize: 300, contrast: false, focus: false, targets: false, hidden: false }).ok, false);
});

test('restores append a new revision and bring removed records back', () => {
  const s = createStore(tmp());
  s.set('theme', 'dark'); s.set('theme', 'light');
  const r = s.restore(0);
  assert.deepEqual([r.ok, s.get().theme], [true, 'system']);
  assert.equal(s.history().length, 3);
  assert.equal(s.history()[2].restoredFrom, 0);
  s.recordDeployment({ name: 'x' }); const id = s.deployments()[0].id;
  s.removeDeployments([id]);
  const back = s.restore(s.history().length - 1);
  assert.deepEqual([back.restored, s.deployments().length], [1, 1]);
  assert.equal(s.restore(99).error, 'UNKNOWN_REVISION');
  assert.equal(s.label(0, 'before trip').ok, true);
});

test('every feature article is bundled and titled', async () => {
  const bridge = createBridge({ backend: {}, deployer: {}, installer: {}, store: {}, emit: () => {} });
  const r = await bridge.docs();
  const files = fs.readdirSync(path.join(__dirname, '../../docs/features')).filter(f => f.endsWith('.md'));
  assert.equal(r.docs.length, files.length);
  for (const d of r.docs) assert.ok(d.title && !d.title.endsWith('.md'), d.id);
  for (const d of r.docs) for (const [, link] of d.body.matchAll(/\]\(([a-z0-9-]+)\)/g)) assert.ok(files.includes(link + '.md'), `${d.id} links to missing ${link}`);
});

const fakeVault = () => ({ isEncryptionAvailable: () => true, encryptString: s => Buffer.from('E' + s), decryptString: b => b.toString().slice(1) });
test('each toy lock keeps its own policy, rate limits wrong answers and never stores a secret in clear', () => {
  const { createLocks, totp } = require('../../src/main/locks');
  const dir = tmp(); let t = 1_800_000_000_000;
  const L = createLocks({ dir, safeStorage: fakeVault(), now: () => t });
  assert.equal(L.create('go:settings', { label: 'Settings', policy: 'pin', pin: '12' }).error, 'PIN_INVALID');
  assert.equal(L.create('go:settings', { label: 'Settings', policy: 'pin', pin: '2468' }).ok, true);
  const { secret } = L.newTotp('Deploy');
  assert.equal(L.create('act:deploy', { label: 'Deploy', policy: 'pin+totp', pin: '1111', totpSecret: secret, totpCode: '000000' }).error, 'TOTP_CODE_WRONG');
  assert.equal(L.create('act:deploy', { label: 'Deploy', policy: 'pin+totp', pin: '1111', totpSecret: secret, totpCode: totp(secret, t) }).ok, true);
  assert.equal(L.verify('act:deploy', { pin: '2468', totp: totp(secret, t) }).ok, false, 'one lock never opens another');
  assert.equal(L.verify('act:deploy', { pin: '1111', totp: totp(secret, t - 30000) }).ok, true, 'one step of clock skew is accepted');
  assert.equal(L.verify('act:deploy', { pin: '1111', totp: totp(secret, t - 120000) }).ok, false);
  for (let i = 0; i < 5; i++) L.verify('go:settings', { pin: '0000' });
  const w = L.verify('go:settings', { pin: '2468' });
  assert.deepEqual([w.ok, w.error], [false, 'WAIT']);
  const raw = fs.readFileSync(path.join(dir, 'locks.vault'), 'utf8');
  assert.ok(!raw.includes('2468') && !raw.includes(secret), 'no clear secret on disk');
  assert.ok(!fs.readdirSync(dir).some(f => f === 'settings.json' && fs.readFileSync(path.join(dir, f), 'utf8').includes('2468')));
  t += 3_600_001;
  assert.equal(L.verify('go:settings', { pin: '2468' }).ok, true);
  assert.equal(createLocks({ dir, safeStorage: { isEncryptionAvailable: () => false } }).create('x', { label: 'x', policy: 'pin', pin: '1234' }).error, 'VAULT_UNAVAILABLE');
});

test('the unlock ladder grades in the main process with single-use nonces and cannot be won early', async () => {
  const { createLocks } = require('../../src/main/locks');
  let t = 1_800_000_000_000;
  const L = createLocks({ dir: tmp(), safeStorage: fakeVault(), now: () => t, catalog: async () => [1, 2, 3, 4, 5].map(i => ({ name: { en: 'Dish ' + i, zhHant: '點' + i }, description: { en: 'desc ' + i } })) });
  L.create('x', { label: 'X', policy: 'pin', pin: '1234' });
  for (let i = 0; i < 5; i++) L.verify('x', { pin: '0000' });
  const before = L.status().locks[0].waitMs;
  const s = await L.ladderStart('x', 'sums');
  const answers = s.challenge.sums.map(q => q.split(' + ').reduce((a, b) => +a + +b));
  assert.equal(L.ladderAnswer(s.nonce, answers).passed, true);
  assert.equal(L.ladderAnswer(s.nonce, answers).error, 'NONCE_USED_OR_UNKNOWN');
  assert.ok(L.status().locks[0].waitMs < before, 'wait shrinks');
  assert.equal(L.verify('x', { pin: '1234' }).error, 'WAIT', 'the credential is never cleared');
  const m = await L.ladderStart('x', 'mole');
  assert.equal(L.ladderAnswer(m.nonce, m.challenge.moles.map(x => x.id)).error, 'ROUND_NOT_FINISHED');
  const m2 = await L.ladderStart('x', 'mole'); t += 20001;
  assert.equal(L.ladderAnswer(m2.nonce, [m2.challenge.moles[0].id, m2.challenge.moles[0].id]).passed, false, 'each mole counts once');
  assert.equal((await L.ladderStart('x', 'dimsum', { school: true })).error, 'INVALID_INPUT', 'school mode has no dim sum rung');
});

test('landing page shares the app library and bundles every feature article', () => {
  const root = path.join(__dirname, '../..');
  assert.equal(fs.readFileSync(path.join(root, 'site/lib.js'), 'utf8'), fs.readFileSync(path.join(root, 'src/renderer/lib.js'), 'utf8'), 'run node scripts/build-site.mjs');
  const docs = JSON.parse(fs.readFileSync(path.join(root, 'site/docs.json'), 'utf8'));
  const files = fs.readdirSync(path.join(root, 'docs/features')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort();
  assert.deepEqual(docs.articles.map(a => a.id), files);
});
