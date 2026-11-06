'use strict';
// The only operations the renderer can ask for. Every input is validated again here, every
// long-running operation gets an operation ID and exactly one terminal event, and events carry
// that ID plus the account they were started for so the renderer can never mix them up.
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validProfile, validRegion } = require('../backend');

const NAME = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const OPEN_HOSTS = [/\.elb\.amazonaws\.com$/, /^github\.com$/, /^docs\.aws\.amazon\.com$/, /^aws\.amazon\.com$/];
const CATALOG = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
const PHOTO_RELEASES = 'https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100';

function safeExternal(url) {
  try {
    const u = new URL(url);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return false;
    if (u.protocol === 'http:' && !/\.elb\.amazonaws\.com$/.test(u.hostname)) return false;
    return OPEN_HOSTS.some(re => re.test(u.hostname));
  } catch { return false; }
}

async function inspectDockerfile(dockerfilePath) {
  const text = await fsp.readFile(dockerfilePath, 'utf8');
  if (text.length > 512 * 1024) return { ok: false, error: 'SOURCE_TOO_LARGE' };
  const ports = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*EXPOSE\s+(.+)$/i.exec(line);
    if (m) for (const p of m[1].trim().split(/\s+/)) { const n = /^(\d+)(?:\/(tcp|udp))?$/i.exec(p); if (n && (n[2] || 'tcp').toLowerCase() === 'tcp') ports.add(Number(n[1])); }
  }
  return { ok: true, source: { kind: 'dockerfile', contextPath: path.dirname(dockerfilePath), dockerfilePath, service: path.basename(path.dirname(dockerfilePath)), containerPort: ports.size === 1 ? [...ports][0] : undefined, ports: [...ports] } };
}

function createBridge({ backend, deployer, installer, store, emit, fetchUrl = globalThis.fetch, uuid = randomUUID, random = Math.random, cacheDir = null }) {
  // Published photos are catalog-v1* release assets of the public photo repository. The map is
  // cached in application data for a day; photos themselves are never copied.
  async function publishedPhotos() {
    const file = cacheDir && path.join(cacheDir, 'dim-sum-photos.json');
    try { const c = JSON.parse(await fsp.readFile(file, 'utf8')); if (Date.now() - c.at < 864e5) return c.photos; } catch { }
    const photos = {};
    const r = await fetchUrl(PHOTO_RELEASES, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return photos;
    for (const rel of await r.json()) if (/^catalog-v1/.test(rel.tag_name)) for (const a of rel.assets || []) if (/\.png$/.test(a.name)) photos[a.name] = a.browser_download_url;
    if (file) await fsp.writeFile(file, JSON.stringify({ at: Date.now(), source: PHOTO_RELEASES, photos })).catch(() => {});
    return photos;
  }
  const ops = new Map();
  function start(kind, scope, work) {
    const id = `op-${uuid().slice(0, 8)}`;
    const controller = new AbortController();
    ops.set(id, { kind, scope, controller });
    const send = (type, payload) => emit({ op: id, kind, scope, type, ...payload });
    send('started', {});
    Promise.resolve().then(() => work({ signal: controller.signal, progress: p => send('progress', p) }))
      .then(result => send(result?.ok ? 'succeeded' : (controller.signal.aborted ? 'cancelled' : 'failed'), { result }))
      .catch(() => send('failed', { result: { ok: false, error: 'INTERNAL_ERROR' } }))
      .finally(() => ops.delete(id));
    return { ok: true, op: id };
  }
  const sel = s => (s && validProfile(s.profile) && validRegion(s.region) ? { profile: s.profile, region: s.region } : null);

  return {
    async prerequisites() {
      const [r, winget] = await Promise.all([backend.prerequisites({}), process.platform === 'win32' ? installer.hasWinget({}) : false]);
      return { ...r, winget, platform: process.platform };
    },
    async profiles() {
      const r = await backend.profiles({});
      if (!r.ok) return r;
      const list = await Promise.all(r.profiles.map(async name => { const reg = await backend.profileRegion(name, {}); return { name, region: reg.ok ? reg.region : null }; }));
      return { ok: true, profiles: list };
    },
    identity(s) { const v = sel(s); return v ? backend.identity(v, {}) : { ok: false, error: 'INVALID_INPUT' }; },
    login(s) {
      const v = sel(s); if (!v) return { ok: false, error: 'INVALID_INPUT' };
      return start('login', v, ({ signal, progress }) => { progress({ stage: 'browser' }); return backend.login(v, { signal }); });
    },
    install(tools) {
      if (!Array.isArray(tools) || !tools.length || tools.some(t => !['aws', 'docker'].includes(t))) return { ok: false, error: 'INVALID_INPUT' };
      return start('install', null, ({ signal, progress }) => installer.installMissing([...new Set(tools)], { signal, onProgress: progress }));
    },
    async inspectSource(file) {
      if (typeof file !== 'string' || !path.isAbsolute(file)) return { ok: false, error: 'INVALID_INPUT' };
      try {
        const base = path.basename(file).toLowerCase();
        if (/^(compose|docker-compose)\.ya?ml$/.test(base)) return await deployer.inspectCompose(file, {});
        if (base === 'dockerfile' || base.endsWith('.dockerfile')) return await inspectDockerfile(file);
        return { ok: false, error: 'UNSUPPORTED_SOURCE' };
      } catch { return { ok: false, error: 'SOURCE_NOT_FOUND' }; }
    },
    deploy(input) {
      const v = sel(input);
      if (!v || !input.expectedIdentity || !NAME.test(input.name || '') || !input.source) return { ok: false, error: 'INVALID_INPUT' };
      const s = input.source;
      let source;
      if (s.kind === 'compose' && typeof s.composePath === 'string' && path.isAbsolute(s.composePath)) source = { kind: 'compose', composePath: s.composePath };
      else if (s.kind === 'dockerfile' && [s.contextPath, s.dockerfilePath].every(p => typeof p === 'string' && path.isAbsolute(p))) source = { kind: 'dockerfile', contextPath: s.contextPath, dockerfilePath: s.dockerfilePath };
      else return { ok: false, error: 'INVALID_INPUT' };
      const env = {};
      for (const [k, val] of Object.entries(input.environment || {})) { if (!ENV_KEY.test(k) || typeof val !== 'string' || val.length > 4096) return { ok: false, error: 'INVALID_INPUT' }; env[k] = val; }
      const port = input.containerPort === undefined ? undefined : Number(input.containerPort);
      if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) return { ok: false, error: 'INVALID_INPUT' };
      const health = input.healthCheckPath || '/';
      if (!/^\/[A-Za-z0-9._~\/-]{0,200}$/.test(health)) return { ok: false, error: 'INVALID_INPUT' };
      const payload = { ...v, expectedIdentity: input.expectedIdentity, name: input.name, source, environment: env, healthCheckPath: health, ...(port ? { containerPort: port } : {}) };
      return start('deploy', { ...v, accountId: input.expectedIdentity.accountId, name: input.name }, async ({ signal, progress }) => {
        const result = await deployer.deploy(payload, { signal, onProgress: progress });
        store.recordDeployment({ name: input.name, ...v, accountId: input.expectedIdentity.accountId, ok: !!result.ok, url: result.url || null, image: result.image || null, error: result.ok ? null : result.error, stage: result.stage || null });
        return result;
      });
    },
    cancel(id) { const op = ops.get(id); if (!op) return { ok: false, error: 'UNKNOWN_OPERATION' }; op.controller.abort(); return { ok: true }; },
    settings: () => ({ ok: true, settings: store.get(), sources: store.sources(), defaults: store.defaults() }),
    removeDeployments: ats => store.removeDeployments(ats),
    setSetting(key, value) { return store.set(key, value); },
    resetSetting(key) { return store.reset(key); },
    history: () => ({ ok: true, history: store.history(), deployments: store.deployments(), labels: store.labels() }),
    restore: i => (Number.isInteger(i) ? store.restore(i) : { ok: false, error: 'INVALID_INPUT' }),
    label: (i, text) => store.label(i, text),
    async docs() {
      const dir = path.join(__dirname, '..', '..', 'docs', 'features');
      try {
        const files = (await fsp.readdir(dir)).filter(f => /^[a-z0-9-]+\.md$/.test(f)).sort();
        return { ok: true, docs: await Promise.all(files.map(async f => { const body = await fsp.readFile(path.join(dir, f), 'utf8'); return { id: f.slice(0, -3), title: (/^# (.+)$/m.exec(body) || [, f])[1], body }; })) };
      } catch { return { ok: false, error: 'DOCS_MISSING' }; }
    },
    async changelog() {
      try { return { ok: true, ...JSON.parse(await fsp.readFile(path.join(__dirname, '..', 'changelog.json'), 'utf8')) }; }
      catch { return { ok: false, error: 'NOT_GENERATED' }; }
    },
    canOpen: url => safeExternal(url),
    async dimSum() {
      const s = store.get();
      if (s.school || !s.setupComplete || s.launches < 2 || random() >= 0.1) return { ok: true, show: false };
      try {
        const data = await (await fetchUrl(CATALOG, { signal: AbortSignal.timeout(6000) })).json();
        const photos = await publishedPhotos();
        const dishes = (data.dishes || []).filter(d => d?.name?.en && d?.name?.zhHant);
        if (!dishes.length) return { ok: true, show: false };
        const d = dishes[Math.floor(random() * dishes.length)];
        const file = String(d.image?.path || '').split('/').pop();
        return { ok: true, show: true, dish: { en: d.name.en, zh: d.name.zhHant, image: photos[file] || null, alt: d.image?.alt?.en || d.name.en } };
      } catch { return { ok: true, show: false }; }
    },
  };
}

module.exports = { createBridge, safeExternal, inspectDockerfile };
