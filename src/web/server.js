'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createBridge } = require('../main/bridge');
const { createStore } = require('../main/store');
const { createBackend, createDeployer, createRunner, validProfile, validRegion } = require('../backend');
const { equal, isolatedEnv, validLoginUrl } = require('./auth');
const { upload, inside } = require('./uploads');
const fail = error => ({ ok: false, error });
async function createServer({ token = process.env.AWS_DEPLOYER_ACCESS_TOKEN, origin = process.env.AWS_DEPLOYER_PUBLIC_ORIGIN, sessionMs = 30 * 60 * 1000, spawnProcess = spawn, runnerFactory, maxSessions = 16 } = {}) {
  if (typeof token !== 'string' || token.length < 32) throw Error('AWS_DEPLOYER_ACCESS_TOKEN must contain at least 32 characters');
  if (origin && (new URL(origin).origin !== origin || !/^https?:/.test(origin))) throw Error('Invalid public origin');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-web-')); await fs.chmod(root, 0o700);
  const sessions = new Map();
  const disposing = new Set();
  let shuttingDown = false;
  const creatingSessions = new Set();
  function scoped(s, work) { if (s.closed || s.expires <= Date.now()) return Promise.resolve(fail('UNAUTHORIZED')); const promise = Promise.resolve(work()); s.inflight.add(promise); promise.finally(() => s.inflight.delete(promise)).catch(() => {}); return promise; }
  function trackChild(s, command, args, options) { if (s.closed) throw Error('SESSION_CLOSED'); const child = spawnProcess(command, args, options); let resolve; const closed = new Promise(r => { resolve = r; }); const entry = { child, closed }; s.children.add(entry); child.once('close', () => { s.children.delete(entry); resolve(); }); return child; }
  function dispose(s) {
    if (s.disposal) return s.disposal;
    s.closed = true; sessions.delete(s.id);
    for (const op of s.operations) s.bridge.cancel(op);
    for (const login of s.logins.values()) login.abort();
    s.disposal = (async () => {
      const children = [...s.children];
      for (const { child } of children) child.kill('SIGTERM');
      const force = setTimeout(() => { for (const { child } of s.children) child.kill('SIGKILL'); }, 500);
      try { await Promise.all([Promise.allSettled([...s.inflight]), ...children.map(entry => entry.closed)]); }
      finally { clearTimeout(force); }
      await fs.rm(s.root, { recursive: true, force: true });
    })();
    disposing.add(s.disposal); s.disposal.finally(() => disposing.delete(s.disposal)).catch(() => {});
    return s.disposal;
  }
  function session() {
    if (shuttingDown) throw Error('SERVER_CLOSED');
    if (sessions.size + creatingSessions.size >= maxSessions) throw Error('SESSION_LIMIT');
    const pending = initializeSession(); creatingSessions.add(pending);
    pending.finally(() => creatingSessions.delete(pending)).catch(() => {});
    return pending;
  }
  async function initializeSession() {
    const id = randomBytes(32).toString('hex'), dir = path.join(root, id); await fs.mkdir(path.join(dir, '.aws'), { recursive: true, mode: 0o700 });
    const sourceRoot = path.join(dir, 'sources'); await fs.mkdir(sourceRoot);
    const env = isolatedEnv(dir); if (process.env.DOCKER_HOST) env.DOCKER_HOST = process.env.DOCKER_HOST;
    const s = { id, root: dir, sourceRoot, env, children: new Set(), inflight: new Set(), logins: new Map(), operations: new Set(), events: [], seq: 0, expires: Date.now() + sessionMs };
    const run = runnerFactory ? runnerFactory(env) : createRunner((cmd, args, opts) => trackChild(s, cmd, args, { ...opts, env }));
    const backend = createBackend({ run }), deployer = createDeployer({ run, backend });
    s.backend = backend;
    s.emit = event => { if (s.closed) return; s.events.push({ ...event, seq: ++s.seq }); if (event.type === 'started') s.operations.add(event.op); if (['failed', 'succeeded', 'cancelled'].includes(event.type)) s.operations.delete(event.op); if (s.events.length > 500) s.events.shift(); };
    const rawStore = createStore(path.join(dir, 'state'));
    const store = new Proxy(rawStore, { get(target, key) { const value = target[key]; if (typeof value !== 'function') return value; return (...args) => s.closed && ['set', 'reset', 'bumpLaunch', 'recordDeployment', 'removeDeployments'].includes(key) ? fail('UNAUTHORIZED') : value.apply(target, args); } });
    s.bridge = createBridge({ backend, deployer, installer: { hasWinget: async () => false }, store, emit: s.emit }); sessions.set(id, s); return s;
  }
  async function remoteLogin(s, selection) {
    if (!validProfile(selection?.profile) || !validRegion(selection?.region)) return fail('INVALID_INPUT');
    if (s.logins.size) return fail('LOGIN_IN_PROGRESS');
    const op = 'op-' + randomUUID().slice(0, 8), scope = { profile: selection.profile, region: selection.region };
    let config = await fs.readFile(s.env.AWS_CONFIG_FILE, 'utf8').catch(() => '');
    const section = selection.profile === 'default' ? 'default' : 'profile ' + selection.profile;
    const lines = config.split(/\r?\n/); let active = false, found = false;
    const kept = lines.filter(line => { const header = /^\s*\[([^\]]+)\]\s*$/.exec(line); if (header) { active = header[1] === section; if (active) found = true; } return !(active && /^\s*region\s*=/.test(line)); });
    if (!found) kept.push(`[${section}]`, `region = ${selection.region}`);
    else { const index = kept.findIndex(line => line.trim() === `[${section}]`); kept.splice(index + 1, 0, `region = ${selection.region}`); }
    await fs.writeFile(s.env.AWS_CONFIG_FILE + '.tmp', kept.join('\n') + '\n', { mode: 0o600 });
    await fs.rename(s.env.AWS_CONFIG_FILE + '.tmp', s.env.AWS_CONFIG_FILE);
    let child; try { child = trackChild(s, 'aws', ['login', '--remote', '--profile', selection.profile, '--region', selection.region], { env: s.env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { return fail('UNAVAILABLE'); }
    s.emit({ op, kind: 'login', scope, type: 'started' });
    let done = false, output = '', bytes = 0, submitted = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); s.logins.delete(op); for (const event of s.events) if (event.op === op && event.url) delete event.url; s.emit({ op, kind: 'login', scope, type: result.ok ? 'succeeded' : result.error === 'CANCELLED' ? 'cancelled' : 'failed', result }); };
    const stop = error => { if (done) return; child.kill('SIGTERM'); const kill = setTimeout(() => child.kill('SIGKILL'), 500); kill.unref(); finish(fail(error)); };
    const timer = setTimeout(() => stop('TIMEOUT'), 300000); timer.unref();
    s.logins.set(op, { abort: () => stop('CANCELLED'), submit(code) { if (submitted || typeof code !== 'string' || !code.length || code.length > 8192 || /[\x00-\x20\x7f]/.test(code)) return fail('INVALID_INPUT'); submitted = true; child.stdin.write(code + '\n'); return { ok: true }; } });
    child.stdin.on('error', () => {});
    const collect = chunk => { if (done) return; bytes += chunk.length; if (bytes > 65536) return stop('OUTPUT_LIMIT'); output = (output + chunk.toString()).slice(-16384); for (const candidate of output.match(/https:\/\/[^\s<>"']+/g) || []) if (validLoginUrl(candidate)) { if (!s.logins.get(op)?.urlSent) { s.logins.get(op).urlSent = true; s.emit({ op, kind: 'login', scope, type: 'progress', stage: 'browser', url: candidate }); s.emit({ op, kind: 'login', scope, type: 'progress', stage: 'code' }); } } };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', () => finish(fail('UNAVAILABLE')));
    child.on('close', async code => { if (done) return; if (code !== 0) return finish(fail('AWS_LOGIN_FAILED')); try { finish(await backendIdentity()); } catch { finish(fail('AWS_LOGIN_FAILED')); } });
    async function backendIdentity() { return s.backend.identity(scope, {}); }
    return { ok: true, op };
  }
  const allowed = new Set(['prerequisites', 'profiles', 'identity', 'settings', 'setSetting', 'resetSetting', 'history', 'dimSum', 'removeDeployments']);
  async function rpc(s, method, args) {
    if (!Array.isArray(args) || args.length > 4) return fail('INVALID_INPUT');
    if (method === 'setSetting' && args[0] === 'draft' && args[1] !== null) {
      const value = args[1];
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_INPUT');
      const draft = {};
      if (Number.isInteger(value.step) && value.step >= 0 && value.step <= 10) draft.step = value.step;
      for (const key of ['file', 'name', 'port', 'health']) if (typeof value[key] === 'string' && value[key].length <= 1024) draft[key] = value[key];
      if (Array.isArray(value.env)) draft.env = value.env.slice(0, 100).filter(item => item && typeof item.k === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(item.k)).map(item => ({ k: item.k, v: '' }));
      args = ['draft', draft];
    }
    if (allowed.has(method)) return s.bridge[method](...args);
    if (method === 'version') return { ok: true, version: '0.1.0', browser: true };
    if (method === 'login') {
      if (s.loginStarting || s.logins.size) return fail('LOGIN_IN_PROGRESS');
      s.loginStarting = true;
      try { return await remoteLogin(s, args[0]); }
      finally { s.loginStarting = false; }
    }
    if (method === 'submitLoginCode') return s.logins.get(args[0])?.submit(args[1]) || fail('UNKNOWN_OPERATION');
    if (method === 'cancel') { if (s.logins.has(args[0])) { s.logins.get(args[0]).abort(); return { ok: true }; } return s.bridge.cancel(args[0]); }
    if (method === 'sampleSource') { const files = await upload(s.sourceRoot, [{ path: 'hello/Dockerfile', content: Buffer.from('FROM node:22-alpine\nWORKDIR /app\nCOPY server.js .\nEXPOSE 8080\nCMD ["node","server.js"]\n').toString('base64') }, { path: 'hello/server.js', content: Buffer.from('require("node:http").createServer((q,r)=>r.end("Hello from AWS!\\n")).listen(8080,"0.0.0.0");').toString('base64') }]); return { ok: true, path: files[0] }; }
    if (method === 'inspectSource') { if (!inside(s.sourceRoot, args[0])) return fail('SOURCE_NOT_OWNED'); if (/ya?ml$/i.test(args[0])) return fail('BROWSER_COMPOSE_UNSUPPORTED'); return s.bridge.inspectSource(args[0]); }
    if (method === 'deploy') { const source = args[0]?.source; if (source?.kind !== 'dockerfile') return fail('BROWSER_COMPOSE_UNSUPPORTED'); if (![source.contextPath, source.dockerfilePath].every(p => inside(s.sourceRoot, p))) return fail('SOURCE_NOT_OWNED'); return s.bridge.deploy(args[0]); }
    return fail('UNSUPPORTED_OPERATION');
  }
  async function body(req) { let count = 0; const chunks = []; for await (const chunk of req) { count += chunk.length; if (count > 23 * 1024 * 1024) throw Error('BODY_TOO_LARGE'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      const localOrigin = `http://${req.headers.host}`, expected = origin || localOrigin;
      if (!req.headers.host || /[\s/\\]/.test(req.headers.host)) return json(fail('INVALID_HOST'), 400);
      const url = new URL(req.url, localOrigin);
      if (url.pathname.startsWith('/api/')) {
        if ((req.method !== 'GET' && req.headers.origin !== expected) || (req.headers.origin && req.headers.origin !== expected) || req.headers['sec-fetch-site'] === 'cross-site') return json(fail('ORIGIN_DENIED'), 403);
        if (req.method === 'POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(fail('JSON_REQUIRED'), 415);
        if (url.pathname === '/api/session' && req.method === 'POST') { const input = await body(req); if (!equal(input.token, token)) return json(fail('UNAUTHORIZED'), 401); const s = await session(); res.setHeader('Set-Cookie', `aws_session=${s.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionMs / 1000)}${expected.startsWith('https:') ? '; Secure' : ''}`); return json({ ok: true }); }
        const id = /(?:^|;\s*)aws_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1], s = sessions.get(id);
        if (!s || s.closed || s.expires <= Date.now()) { if (s) await dispose(s); return json(fail('UNAUTHORIZED'), 401); }
        if (url.pathname === '/api/events' && req.method === 'GET') return json({ ok: true, events: s.events.filter(e => e.seq > (Number(url.searchParams.get('after')) || 0)), cursor: s.seq });
        if (url.pathname === '/api/upload' && req.method === 'POST') { const input = await body(req); if (s.closed || s.expires <= Date.now()) { await dispose(s); return json(fail('UNAUTHORIZED'), 401); } return json(await scoped(s, async () => ({ ok: true, files: await upload(s.sourceRoot, input.files) }))); }
        if (url.pathname === '/api/rpc' && req.method === 'POST') { const input = await body(req); if (s.closed || s.expires <= Date.now()) { await dispose(s); return json(fail('UNAUTHORIZED'), 401); } return json(await scoped(s, () => rpc(s, input.method, input.args))); }
        if (url.pathname === '/api/session' && req.method === 'DELETE') { await dispose(s); return json({ ok: true }); }
        return json(fail('NOT_FOUND'), 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(fail('NOT_FOUND'), 404);
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').includes('..')) return json(fail('NOT_FOUND'), 404);
      const file = path.join(__dirname, '../renderer', relative); const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(file)]; if (!mime) return json(fail('NOT_FOUND'), 404);
      const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': mime }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) { json(fail(['INVALID_UPLOAD', 'UPLOAD_TOO_LARGE', 'SESSION_LIMIT', 'BODY_TOO_LARGE'].includes(error.message) ? error.message : 'INVALID_REQUEST'), 400); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  const sweep = setInterval(() => { for (const s of sessions.values()) if (s.expires <= Date.now()) dispose(s).catch(() => {}); }, 10000); sweep.unref();
  server.cleanup = async () => { shuttingDown = true; clearInterval(sweep); await Promise.allSettled([...creatingSessions]); await Promise.all([...sessions.values()].map(dispose)); await Promise.all([...disposing]); await fs.rm(root, { recursive: true, force: true }); };
  return server;
}
if (require.main === module) createServer().then(server => { server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1'); for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { server.close(); server.cleanup().finally(() => process.exit(0)); }); }).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createServer };
