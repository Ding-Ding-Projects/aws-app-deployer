'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createServer } = require('../../src/web/server');
const { isolatedEnv, validLoginUrl } = require('../../src/web/auth');
const { upload } = require('../../src/web/uploads');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
test('environment does not inherit credentials or host AWS config', () => { const env = isolatedEnv('/session', { PATH: '/bin', AWS_ACCESS_KEY_ID: 'secret', AWS_PROFILE: 'host', AWS_CONFIG_FILE: '/host' }); assert.equal(env.AWS_ACCESS_KEY_ID, undefined); assert.equal(env.AWS_CONFIG_FILE, '/session/.aws/config'); assert.equal(env.HOME, '/session'); });
test('uploads reject traversal, duplicate paths and invalid base64 before writing', async () => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-test-')); try { for (const files of [[{ path: '../escape', content: '' }], [{ path: 'Dockerfile', content: '$' }], [{ path: 'a', content: '' }, { path: 'a', content: '' }]]) await assert.rejects(upload(dir, files)); assert.deepEqual(await fs.readdir(dir), []); } finally { await fs.rm(dir, { recursive: true }); } });
test('browser sessions isolate settings, source ownership and operations; remote login verifies STS', async t => {
  let child, spawnArgs, code, envs = [];
  const server = await createServer({ token: 'x'.repeat(32), runnerFactory: env => { envs.push(env); return async (cmd,args) => args[0] === 'sts' ? { ok:true, stdout: JSON.stringify({Account:'123456789012',Arn:'arn:aws:iam::123456789012:user/test',UserId:'user'}) } : {ok:true,stdout:'',stderr:''}; }, spawnProcess: (cmd,args,opts) => { spawnArgs = args; child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.stdin.on('data', chunk => { code = chunk.toString(); }); child.kill = () => { queueMicrotask(() => child.emit('close', null)); }; return child; } });
  server.listen(0,'127.0.0.1'); await once(server,'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await server.cleanup(); await new Promise(resolve => server.close(resolve)); });
  const call = async (route, data, cookie, origin=base) => { const response = await fetch(base+route, {method:'POST', headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)}); return {response, value:await response.json()}; };
  const a = await call('/api/session',{token:'x'.repeat(32)}), b = await call('/api/session',{token:'x'.repeat(32)}); const ca=a.response.headers.get('set-cookie').split(';')[0], cb=b.response.headers.get('set-cookie').split(';')[0];
  const rpc = async (cookie,method,...args) => (await call('/api/rpc',{method,args},cookie)).value;
  assert.equal((await call('/api/rpc',{method:'settings',args:[]},ca,'https://evil.example')).response.status,403);
  await rpc(ca,'setSetting','displayName','Alice'); assert.equal((await rpc(cb,'settings')).settings.displayName,''); assert.notEqual(envs[0].HOME,envs[1].HOME);
  const sample = await rpc(ca,'sampleSource'); assert.equal((await rpc(ca,'inspectSource',sample.path)).ok,true); assert.equal((await rpc(cb,'inspectSource',sample.path)).error,'SOURCE_NOT_OWNED'); assert.equal((await rpc(ca,'inspectSource',path.dirname(path.dirname(sample.path)) + '/../../../.aws/config')).error,'SOURCE_NOT_OWNED'); assert.equal((await rpc(ca,'inspectSource',sample.path.replace('Dockerfile','compose.yaml'))).error,'BROWSER_COMPOSE_UNSUPPORTED');
  const login = await rpc(ca,'login',{profile:'default',region:'us-east-1'}); assert.deepEqual(spawnArgs,['login','--remote','--profile','default','--region','us-east-1']);
  child.stdout.write('https://us-east-1.signin.aws.amazon.com/v1/authorize?state=test\n');
  assert.equal((await rpc(cb,'submitLoginCode',login.op,'sensitive-code')).error,'UNKNOWN_OPERATION'); assert.equal((await rpc(ca,'submitLoginCode',login.op,'sensitive-code')).ok,true); assert.equal(code,'sensitive-code\n'); child.emit('close',0); await new Promise(resolve=>setImmediate(resolve));
  const events = await (await fetch(base+'/api/events?after=0',{headers:{Cookie:ca}})).json(); assert.equal(events.events.at(-1).type,'succeeded'); assert.equal(JSON.stringify(events).includes('sensitive-code'),false); assert.equal(JSON.stringify(events).includes('state=test'),false);
  const other = await (await fetch(base+'/api/events',{headers:{Cookie:cb}})).json(); assert.deepEqual(other.events,[]);
  assert.equal(validLoginUrl('https://123456789012.signin.aws.amazon.com.evil.test/v1/authorize'),false);
});

async function fixture(t, options = {}) {
  const children = [], envs = []; let identityResult = { ok: false, error: 'AWS_LOGIN_REQUIRED' };
  const server = await createServer({ token: 'x'.repeat(32), ...options, runnerFactory: env => { envs.push(env); return async () => identityResult; }, spawnProcess: () => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.killed = []; child.kill = signal => { child.killed.push(signal); if (!child.delayClose) queueMicrotask(() => child.emit('close', null)); }; children.push(child); return child; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await server.cleanup(); await new Promise(resolve => server.close(resolve)); });
  let cookie;
  const post = async (route, data) => { const response = await fetch(base + route, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) }); return { response, data: await response.json() }; };
  cookie = (await post('/api/session', { token: 'x'.repeat(32) })).response.headers.get('set-cookie').split(';')[0];
  return { base, cookie, children, envs, rpc: async (method, ...args) => (await post('/api/rpc', { method, args })).data, events: async () => (await fetch(base + '/api/events', { headers: { Cookie: cookie } })).json() };
}
test('denied login and failed STS cannot produce login success; repeat login preserves config', async t => {
  const f = await fixture(t), selection = { profile: 'default', region: 'us-east-1' };
  const first = await f.rpc('login', selection); f.children[0].stderr.write('sensitive CLI output'); f.children[0].emit('close', 1);
  assert.equal((await f.events()).events.at(-1).result.error, 'AWS_LOGIN_FAILED');
  await fs.appendFile(f.envs[0].AWS_CONFIG_FILE, '\nlogin_session = existing\n[login-session existing]\nlogin_refresh_token = private-refresh\n');
  const second = await f.rpc('login', selection); assert.notEqual(first.op, second.op);
  const config = await fs.readFile(f.envs[0].AWS_CONFIG_FILE, 'utf8'); assert.equal(config.match(/\[default\]/g).length, 1); assert.match(config, /login_session = existing/); assert.match(config, /login_refresh_token = private-refresh/);
  f.children[1].emit('close', 0); await new Promise(resolve => setImmediate(resolve));
  const events = await f.events(); assert.equal(events.events.at(-1).result.error, 'AWS_LOGIN_REQUIRED'); assert.equal(events.events.some(e => e.type === 'succeeded'), false); assert.equal(JSON.stringify(events).includes('private-refresh'), false); assert.equal(JSON.stringify(events).includes('sensitive CLI output'), false);
});
test('cancel terminates remote login and removes authorization URL from buffered events', async t => {
  const f = await fixture(t); const login = await f.rpc('login', { profile: 'default', region: 'us-east-1' });
  f.children[0].stdout.write('https://us-east-1.signin.aws.amazon.com/v1/authorize?state=private\n');
  assert.equal((await f.events()).events.some(e => e.url), true);
  assert.equal((await f.rpc('cancel', login.op)).ok, true); assert.equal(f.children[0].killed[0], 'SIGTERM');
  const events = await f.events(); assert.equal(events.events.at(-1).type, 'cancelled'); assert.equal(JSON.stringify(events).includes('state=private'), false);
  f.children[0].stdout.write('https://us-east-1.signin.aws.amazon.com/v1/authorize?state=late\n'); assert.equal(JSON.stringify(await f.events()).includes('state=late'), false);
});
test('expired sessions reject access, cancel login and remove their local credentials', async t => {
  const f = await fixture(t, { sessionMs: 200 }); await f.rpc('login', { profile: 'default', region: 'us-east-1' });
  const root = f.envs[0].HOME; await fs.writeFile(path.join(root, '.aws', 'credentials'), 'private');
  await new Promise(resolve => setTimeout(resolve, 230)); const result = await f.rpc('settings'); assert.equal(result.error, 'UNAUTHORIZED'); assert.equal(f.children[0].killed[0], 'SIGTERM'); await assert.rejects(fs.access(root));
});
test('browser draft persistence strips arbitrary fields and environment values', async t => {
  const f = await fixture(t); await f.rpc('setSetting', 'draft', { step: 2, name: 'hello', env: [{ k: 'TOKEN', v: 'private-value', extra: 'private-extra' }], envText: 'secret text', environment: { TOKEN: 'secret' }, credentials: 'private', nested: { secrets: 'private' } });
  const draft = (await f.rpc('settings')).settings.draft; assert.deepEqual(draft, { step: 2, name: 'hello', env: [{ k: 'TOKEN', v: '' }] });
  const saved = await fs.readFile(path.join(f.envs[0].HOME, 'state/settings.json'), 'utf8'); assert.equal(saved.includes('private'), false); assert.equal(saved.includes('secret'), false);
});
test('an upload body completed after expiry cannot recreate a disposed session', async t => {
  const f = await fixture(t, { sessionMs: 100 }); const http = require('node:http');
  const root = f.envs[0].HOME;
  const payload = JSON.stringify({ files: [{ path: 'late/Dockerfile', content: Buffer.from('FROM scratch').toString('base64') }] });
  let finish; const response = new Promise((resolve, reject) => {
    const req = http.request(f.base + '/api/upload', { method: 'POST', headers: { Origin: f.base, Cookie: f.cookie, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) })); }); req.on('error', reject); req.write(payload.slice(0, 10)); finish = () => req.end(payload.slice(10));
  });
  await new Promise(resolve => setTimeout(resolve, 140)); assert.equal((await f.rpc('settings')).error, 'UNAUTHORIZED'); await assert.rejects(fs.access(root));
  finish(); const late = await response; assert.equal(late.status, 401); assert.equal(late.body.error, 'UNAUTHORIZED'); await assert.rejects(fs.access(root));
});
test('expiry waits for child close before removing credentials, including late child writes', async t => {
  const f = await fixture(t, { sessionMs: 100 }); await f.rpc('login', { profile: 'default', region: 'us-east-1' }); const child = f.children[0]; child.delayClose = true;
  const root = f.envs[0].HOME; await new Promise(resolve => setTimeout(resolve, 140));
  let settled = false; const expired = f.rpc('settings').then(result => { settled = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(settled, false); assert.equal(child.killed[0], 'SIGTERM');
  await fs.writeFile(path.join(root, '.aws/credentials'), 'last-child-write'); child.emit('close', null);
  assert.equal((await expired).error, 'UNAUTHORIZED'); await assert.rejects(fs.access(root));
});
test('concurrent login requests reserve one startup before asynchronous config writes', async t => {
  const f = await fixture(t); const selection = { profile: 'default', region: 'us-east-1' };
  const results = await Promise.all([f.rpc('login', selection), f.rpc('login', selection)]);
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(results.filter(result => result.error === 'LOGIN_IN_PROGRESS').length, 1); assert.equal(f.children.length, 1);
  assert.equal((await fs.readFile(f.envs[0].AWS_CONFIG_FILE, 'utf8')).match(/\[default\]/g).length, 1);
});
