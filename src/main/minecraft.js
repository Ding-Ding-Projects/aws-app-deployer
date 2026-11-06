'use strict';
// Minecraft server creator and manager. Four execution targets share one adapter interface:
// local Windows process, local Docker container, process on an SSH host (inside tmux), and a
// Docker container on an SSH host. Versions come from the official catalogs at run time:
// Mojang's version manifest (every release, snapshot, pre-release and old alpha/beta, with the
// server download only where one exists), PaperMC's Fill v3 API and Fabric's meta API.
// Nothing runs through a shell on this computer; SSH uses key-based BatchMode only.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const MOJANG = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const PAPER = 'https://fill.papermc.io/v3/projects/paper';
const FABRIC = 'https://meta.fabricmc.net/v2/versions';
const ID = /^[a-z0-9-]{3,40}$/;
const HOST = /^[A-Za-z0-9._-]{1,64}(@[A-Za-z0-9._-]{1,253})?$/;
const VERSION = /^[A-Za-z0-9._ -]{1,40}$/;

// Typed descriptors for server.properties. Unknown keys found in a file are preserved unchanged.
const PROPERTIES = {
  motd: { type: 'text', label: 'Message of the day', default: 'A Minecraft Server', max: 59 },
  'server-port': { type: 'int', label: 'Port', default: 25565, min: 1024, max: 65535, restart: true },
  'max-players': { type: 'int', label: 'Max players', default: 20, min: 1, max: 1000 },
  difficulty: { type: 'enum', label: 'Difficulty', default: 'easy', values: ['peaceful', 'easy', 'normal', 'hard'] },
  gamemode: { type: 'enum', label: 'Game mode', default: 'survival', values: ['survival', 'creative', 'adventure', 'spectator'] },
  hardcore: { type: 'bool', label: 'Hardcore', default: false, restart: true },
  pvp: { type: 'bool', label: 'Player versus player', default: true },
  'online-mode': { type: 'bool', label: 'Check accounts with Mojang (online mode)', default: true, restart: true },
  'white-list': { type: 'bool', label: 'Allowlist only', default: false },
  'enforce-whitelist': { type: 'bool', label: 'Kick players not on the allowlist', default: false },
  'allow-flight': { type: 'bool', label: 'Allow flight', default: false },
  'enable-command-block': { type: 'bool', label: 'Command blocks', default: false },
  'spawn-protection': { type: 'int', label: 'Spawn protection radius', default: 16, min: 0, max: 256 },
  'view-distance': { type: 'int', label: 'View distance (chunks)', default: 10, min: 3, max: 32 },
  'simulation-distance': { type: 'int', label: 'Simulation distance (chunks)', default: 10, min: 3, max: 32, since: '1.18' },
  'level-seed': { type: 'text', label: 'World seed', default: '', max: 64, restart: true },
  'level-type': { type: 'enum', label: 'World preset', default: 'minecraft:normal', values: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:single_biome_surface'], restart: true },
  'generate-structures': { type: 'bool', label: 'Generate structures', default: true, restart: true },
  'level-name': { type: 'text', label: 'World folder name', default: 'world', max: 40, restart: true, pattern: /^[A-Za-z0-9 _-]+$/ },
};
function validProp(key, value) {
  const d = PROPERTIES[key]; if (!d) return false;
  if (d.type === 'bool') return typeof value === 'boolean';
  if (d.type === 'int') return Number.isInteger(value) && value >= d.min && value <= d.max;
  if (d.type === 'enum') return d.values.includes(value);
  return typeof value === 'string' && value.length <= d.max && !/[\r\n]/.test(value) && (!d.pattern || d.pattern.test(value));
}
function parseProperties(text) {
  const entries = [];
  for (const line of String(text).replace(/\r?\n$/, '').split(/\r?\n/)) {
    if (line === '' && !text) continue;
    const m = /^([^#!=:\s][^=:]*?)\s*[=:]\s*(.*)$/.exec(line);
    entries.push(m ? { key: m[1], raw: m[2] } : { line });
  }
  return entries;
}
function toTyped(entries) {
  const out = {}, unknown = {};
  for (const e of entries) if (e.key) {
    const d = PROPERTIES[e.key];
    if (!d) { unknown[e.key] = e.raw; continue; }
    out[e.key] = d.type === 'bool' ? e.raw === 'true' : d.type === 'int' ? parseInt(e.raw, 10) : e.raw.replace(/\\:/g, ':');
  }
  return { values: out, unknown };
}
function writeProperties(entries, changes) {
  const done = new Set();
  const lines = entries.map(e => {
    if (!e.key || !(e.key in changes)) return e.line ?? `${e.key}=${e.raw}`;
    done.add(e.key); return `${e.key}=${String(changes[e.key])}`;
  });
  for (const [k, v] of Object.entries(changes)) if (!done.has(k)) lines.push(`${k}=${String(v)}`);
  return lines.join('\n').replace(/\n*$/, '\n');
}

// Pre-generation plan: forceload batches of at most 256 chunks covering the rectangle.
function forceloadBatches(x0, z0, w, h, max = 256) {
  const out = [], side = Math.floor(Math.sqrt(max));
  for (let x = x0; x < x0 + w; x += side) for (let z = z0; z < z0 + h; z += side) {
    const x2 = Math.min(x0 + w, x + side) - 1, z2 = Math.min(z0 + h, z + side) - 1;
    out.push([x * 16, z * 16, x2 * 16, z2 * 16]);
  }
  return out;
}

// Game rules for the exact version, read from the server's own data generator report.
function gameRulesFromReport(commandsJson) {
  const rule = commandsJson?.children?.gamerule?.children || {};
  return Object.entries(rule).map(([name, node]) => {
    const value = node.children?.value; const parser = value?.parser;
    return { name, type: parser === 'brigadier:bool' ? 'bool' : parser === 'brigadier:integer' ? 'int' : 'unknown', min: value?.properties?.min, max: value?.properties?.max };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

function createMinecraft({ dir, fetchJson = async u => (await fetch(u, { signal: AbortSignal.timeout(15000) })).json(), fetchUrl = globalThis.fetch, spawnProcess = spawn, sevenZip, now = Date.now }) {
  const regFile = path.join(dir, 'servers.json');
  let reg = { servers: {} }; try { reg = JSON.parse(fs.readFileSync(regFile, 'utf8')); } catch { }
  const saveReg = () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(regFile + '.tmp', JSON.stringify(reg, null, 2)); fs.renameSync(regFile + '.tmp', regFile); };
  const live = new Map(); // local processes this app owns: id -> { child, log: [] }
  const catalogCache = {};

  function exec(cmd, args, { input, signal, timeoutMs = 60000, onLine } = {}) {
    return new Promise(resolve => {
      let child; try { child = spawnProcess(cmd, args, { shell: false, windowsHide: true }); } catch { return resolve({ ok: false, error: 'UNAVAILABLE' }); }
      let out = '', err = '', done = false;
      const fin = r => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
      const t = setTimeout(() => { child.kill(); fin({ ok: false, error: 'TIMEOUT' }); }, timeoutMs);
      signal?.addEventListener('abort', () => { child.kill(); fin({ ok: false, error: 'CANCELLED' }); }, { once: true });
      child.stdout.on('data', d => { out += d; if (out.length > 4e6) out = out.slice(-2e6); if (onLine) String(d).split(/\r?\n/).filter(Boolean).forEach(onLine); });
      child.stderr.on('data', d => { err += d; if (err.length > 1e6) err = err.slice(-5e5); });
      child.on('error', () => fin({ ok: false, error: 'UNAVAILABLE' }));
      child.on('close', code => fin(code === 0 ? { ok: true, stdout: out } : { ok: false, error: /Permission denied|Host key verification/i.test(err) ? 'SSH_AUTH_FAILED' : /Could not resolve|Connection (refused|timed out)|No route/i.test(err) ? 'SSH_UNREACHABLE' : 'COMMAND_FAILED', detail: err.trim().split('\n').slice(-2).join(' ') }));
      if (input !== undefined) child.stdin.end(input); else child.stdin?.end?.();
    });
  }
  const sshArgs = host => ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes', host];
  const remote = (host, script, o) => exec('ssh', [...sshArgs(host), script], o);

  // ---- Version catalogs (fetched live, cached for the session with retrieval time) ----
  async function catalog(flavour) {
    if (catalogCache[flavour] && now() - catalogCache[flavour].at < 3600000) return catalogCache[flavour];
    try {
      let versions;
      if (flavour === 'vanilla') { const m = await fetchJson(MOJANG); versions = m.versions.map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime, url: v.url, sha1: v.sha1 })); }
      else if (flavour === 'paper') { const m = await fetchJson(PAPER); versions = Object.values(m.versions || {}).flat().map(id => ({ id, type: /pre|rc|snapshot/i.test(id) ? 'snapshot' : 'release' })); }
      else if (flavour === 'fabric') { const g = await fetchJson(FABRIC + '/game'); versions = g.map(v => ({ id: v.version, type: v.stable ? 'release' : 'snapshot' })); }
      else return { ok: false, error: 'UNKNOWN_FLAVOUR' };
      catalogCache[flavour] = { ok: true, flavour, versions, at: now(), complete: true };
      return catalogCache[flavour];
    } catch { return catalogCache[flavour] ? { ...catalogCache[flavour], stale: true } : { ok: false, error: 'CATALOG_OFFLINE' }; }
  }

  // Resolve the exact server download for a flavour and version, with its checksum.
  async function resolveDownload(flavour, version) {
    if (flavour === 'vanilla') {
      const c = await catalog('vanilla'); if (!c.ok) return c;
      const v = c.versions.find(x => x.id === version); if (!v) return { ok: false, error: 'UNKNOWN_VERSION' };
      const meta = await fetchJson(v.url);
      const s = meta.downloads?.server; if (!s) return { ok: false, error: 'NO_SERVER_DISTRIBUTION' };
      return { ok: true, url: s.url, sha1: s.sha1, size: s.size, java: meta.javaVersion?.majorVersion || 8 };
    }
    if (flavour === 'paper') {
      const b = await fetchJson(`${PAPER}/versions/${encodeURIComponent(version)}/builds`);
      const list = Array.isArray(b) ? b : []; const pick = list.find(x => x.channel === 'STABLE') || list[0];
      const d = pick?.downloads?.['server:default'];
      if (!d || !/^https:\/\/fill-data\.papermc\.io\//.test(d.url)) return { ok: false, error: 'NO_SERVER_DISTRIBUTION' };
      return { ok: true, url: d.url, sha256: d.checksums?.sha256, size: d.size, build: pick.id, channel: pick.channel, java: 21 };
    }
    if (flavour === 'fabric') {
      const loaders = await fetchJson(`${FABRIC}/loader/${encodeURIComponent(version)}`); const installer = (await fetchJson(`${FABRIC}/installer`))[0];
      if (!loaders.length || !installer) return { ok: false, error: 'NO_SERVER_DISTRIBUTION' };
      return { ok: true, url: `${FABRIC}/loader/${encodeURIComponent(version)}/${loaders[0].loader.version}/${installer.version}/server/jar`, java: 21 };
    }
    return { ok: false, error: 'UNKNOWN_FLAVOUR' };
  }

  async function downloadVerified(dl, target, { signal, onProgress } = {}) {
    const r = await fetchUrl(dl.url, { signal }); if (!r.ok) return { ok: false, error: 'DOWNLOAD_FAILED' };
    const total = Number(r.headers.get('content-length') || dl.size || 0);
    const h1 = crypto.createHash('sha1'), h256 = crypto.createHash('sha256'); let done = 0;
    const tmp = target + '.part', out = fs.createWriteStream(tmp);
    try { for await (const c of r.body) { h1.update(c); h256.update(c); done += c.length; if (!out.write(c)) await new Promise(x => out.once('drain', x)); onProgress?.({ step: 'download', done, total }); } } finally { await new Promise(x => out.end(x)); }
    if ((dl.sha1 && h1.digest('hex') !== dl.sha1) || (dl.sha256 && h256.digest('hex') !== dl.sha256)) { await fsp.rm(tmp, { force: true }); return { ok: false, error: 'CHECKSUM_MISMATCH' }; }
    await fsp.rename(tmp, target); return { ok: true, verified: !!(dl.sha1 || dl.sha256) };
  }

  const list = () => ({ ok: true, servers: Object.values(reg.servers).map(s => ({ ...s, running: s.target.kind === 'local' ? live.has(s.id) : s.running ?? null })) });
  const serverDir = id => path.join(dir, 'servers', id);

  async function create(spec, { signal, onProgress } = {}) {
    const { name, flavour, version, target = { kind: 'local' }, port = 25565, memoryMb = 2048, eula } = spec || {};
    if (!eula) return { ok: false, error: 'EULA_REQUIRED' };
    if (typeof name !== 'string' || !/^[\w .-]{1,40}$/.test(name) || !['vanilla', 'paper', 'fabric'].includes(flavour) || !VERSION.test(version || '') || !Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(memoryMb) || memoryMb < 512 || memoryMb > 65536) return { ok: false, error: 'INVALID_INPUT' };
    if (!['local', 'docker', 'ssh', 'ssh-docker'].includes(target.kind) || (target.kind.startsWith('ssh') && !HOST.test(target.host || ''))) return { ok: false, error: 'INVALID_TARGET' };
    if (Object.values(reg.servers).some(s => s.port === port && JSON.stringify(s.target) === JSON.stringify(target))) return { ok: false, error: 'PORT_IN_USE_BY_ANOTHER_SERVER' };
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'server').slice(0, 24) + '-' + crypto.randomBytes(3).toString('hex');
    const rec = { id, name, flavour, version, target, port, memoryMb, createdAt: new Date(now()).toISOString(), path: null, container: null };
    onProgress?.({ step: 'resolve' });
    if (target.kind === 'local') {
      const dl = await resolveDownload(flavour, version); if (!dl.ok) return dl;
      const d = serverDir(id); fs.mkdirSync(d, { recursive: true });
      const got = await downloadVerified(dl, path.join(d, 'server.jar'), { signal, onProgress }); if (!got.ok) { fs.rmSync(d, { recursive: true, force: true }); return got; }
      fs.writeFileSync(path.join(d, 'eula.txt'), `# Accepted in AWS App Deployer on ${new Date(now()).toISOString()}\neula=true\n`);
      fs.writeFileSync(path.join(d, 'server.properties'), writeProperties([], { 'server-port': port, motd: name }));
      Object.assign(rec, { path: d, java: dl.java, verified: got.verified });
    } else if (target.kind === 'docker' || target.kind === 'ssh-docker') {
      rec.container = 'aad-mc-' + id;
      const args = ['create', '--name', rec.container, '-p', `${port}:25565`, '-e', 'EULA=TRUE', '-e', `TYPE=${flavour.toUpperCase()}`, '-e', `VERSION=${version}`, '-e', `MEMORY=${memoryMb}M`, '-e', 'ENABLE_RCON=true', '-v', `${rec.container}-data:/data`, 'itzg/minecraft-server'];
      onProgress?.({ step: 'container' });
      const r = target.kind === 'docker' ? await exec('docker', args, { signal, timeoutMs: 900000 }) : await remote(target.host, ['docker', ...args].map(q).join(' '), { signal, timeoutMs: 900000 });
      if (!r.ok) return r;
    } else {
      const dl = await resolveDownload(flavour, version); if (!dl.ok) return dl;
      const rdir = `~/aad-minecraft/${id}`;
      onProgress?.({ step: 'remote-download' });
      const check = dl.sha1 ? `echo ${q(dl.sha1 + '  server.jar')} | sha1sum -c -` : dl.sha256 ? `echo ${q(dl.sha256 + '  server.jar')} | sha256sum -c -` : 'true';
      const script = `set -e; command -v tmux >/dev/null || { echo NEED_TMUX >&2; exit 3; }; command -v java >/dev/null || { echo NEED_JAVA >&2; exit 4; }; mkdir -p ${rdir} && cd ${rdir} && curl -fsSL -o server.jar ${q(dl.url)} && ${check} && printf 'eula=true\\nserver-port=${port}\\n' > eula.txt && printf 'server-port=${port}\\nmotd=%s\\n' ${q(name)} > server.properties`;
      const r = await remote(target.host, script, { signal, timeoutMs: 900000 });
      if (!r.ok) return { ...r, error: /NEED_TMUX/.test(r.detail || '') ? 'REMOTE_NEEDS_TMUX' : /NEED_JAVA/.test(r.detail || '') ? 'REMOTE_NEEDS_JAVA' : r.error };
      rec.path = rdir;
    }
    reg.servers[id] = rec; saveReg(); onProgress?.({ step: 'done' });
    return { ok: true, server: rec };
  }

  function get(id) { const s = reg.servers[id]; return ID.test(id || '') && s ? s : null; }
  async function start(id, { javaPath = 'java' } = {}) {
    const s = get(id); if (!s) return { ok: false, error: 'UNKNOWN_SERVER' };
    if (s.target.kind === 'local') {
      if (live.has(id)) return { ok: true, already: true };
      let child; try { child = spawnProcess(javaPath, [`-Xmx${s.memoryMb}M`, `-Xms${Math.min(1024, s.memoryMb)}M`, '-jar', 'server.jar', 'nogui'], { cwd: s.path, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { return { ok: false, error: 'JAVA_MISSING' }; }
      const L = { child, log: [], ready: false };
      const push = d => String(d).split(/\r?\n/).filter(Boolean).forEach(l => { L.log.push(l); if (L.log.length > 2000) L.log.shift(); if (/Done \(/.test(l)) L.ready = true; });
      child.stdout.on('data', push); child.stderr.on('data', push);
      child.on('error', () => { L.log.push('Java could not start. Install Java and try again.'); L.failed = 'JAVA_MISSING'; live.delete(id); });
      child.on('close', code => { L.log.push(`Server stopped (exit code ${code}).`); live.delete(id); s.lastExit = code; saveReg(); });
      live.set(id, L); return { ok: true };
    }
    const r = s.target.kind === 'docker' ? await exec('docker', ['start', s.container]) : s.target.kind === 'ssh-docker' ? await remote(s.target.host, `docker start ${q(s.container)}`) : await remote(s.target.host, `cd ${s.path} && tmux new-session -d -s ${q('aad-' + id)} ${q(`java -Xmx${s.memoryMb}M -jar server.jar nogui`)}`);
    if (r.ok) { s.running = true; saveReg(); }
    return r.ok ? { ok: true } : r;
  }
  async function command(id, cmd) {
    const s = get(id); if (!s) return { ok: false, error: 'UNKNOWN_SERVER' };
    if (typeof cmd !== 'string' || !cmd.trim() || cmd.length > 256 || /[\r\n]/.test(cmd)) return { ok: false, error: 'INVALID_COMMAND' };
    const c = cmd.replace(/^\//, '');
    if (s.target.kind === 'local') { const L = live.get(id); if (!L) return { ok: false, error: 'NOT_RUNNING' }; L.child.stdin.write(c + '\n'); L.log.push('> ' + c); return { ok: true }; }
    if (s.target.kind === 'docker') return exec('docker', ['exec', s.container, 'rcon-cli', ...c.split(' ')]);
    if (s.target.kind === 'ssh-docker') return remote(s.target.host, ['docker', 'exec', s.container, 'rcon-cli', ...c.split(' ')].map(q).join(' '));
    return remote(s.target.host, `tmux send-keys -t ${q('aad-' + id)} ${q(c)} Enter`);
  }
  async function stop(id) {
    const s = get(id); if (!s) return { ok: false, error: 'UNKNOWN_SERVER' };
    if (s.target.kind === 'local') {
      const L = live.get(id); if (!L) return { ok: true, already: true };
      L.child.stdin.write('stop\n');
      for (let i = 0; i < 60 && live.has(id); i++) await new Promise(r => setTimeout(r, 500));
      if (live.has(id)) { L.child.kill(); return { ok: true, forced: true }; }
      return { ok: true };
    }
    const r = s.target.kind === 'docker' ? await exec('docker', ['stop', '-t', '30', s.container], { timeoutMs: 60000 }) : s.target.kind === 'ssh-docker' ? await remote(s.target.host, `docker stop -t 30 ${q(s.container)}`, { timeoutMs: 60000 }) : await command(id, 'stop');
    if (r.ok) { s.running = false; saveReg(); }
    return r;
  }
  async function logs(id) {
    const s = get(id); if (!s) return { ok: false, error: 'UNKNOWN_SERVER' };
    if (s.target.kind === 'local') { const L = live.get(id); if (L) return { ok: true, running: true, ready: L.ready, lines: L.log.slice(-300) }; try { return { ok: true, running: false, lines: fs.readFileSync(path.join(s.path, 'logs', 'latest.log'), 'utf8').split(/\r?\n/).slice(-300) }; } catch { return { ok: true, running: false, lines: [] }; } }
    const r = s.target.kind === 'docker' ? await exec('docker', ['logs', '--tail', '300', s.container]) : s.target.kind === 'ssh-docker' ? await remote(s.target.host, `docker logs --tail 300 ${q(s.container)} 2>&1`) : await remote(s.target.host, `tail -n 300 ${s.path}/logs/latest.log 2>/dev/null; tmux has-session -t ${q('aad-' + id)} 2>/dev/null && echo __RUNNING__ || true`);
    if (!r.ok) return { ...r, connection: r.error.startsWith('SSH') ? 'lost' : 'ok' };
    const lines = r.stdout.split(/\r?\n/); const running = lines.includes('__RUNNING__');
    return { ok: true, running: s.target.kind === 'ssh' ? running : s.running ?? null, lines: lines.filter(l => l !== '__RUNNING__').slice(-300) };
  }
  // Properties are edited as typed values for local servers; other targets show and run commands.
  async function properties(id) {
    const s = get(id); if (!s) return { ok: false, error: 'UNKNOWN_SERVER' };
    if (s.target.kind !== 'local') return { ok: false, error: 'EDIT_ON_TARGET_UNSUPPORTED' };
    let text = ''; try { text = fs.readFileSync(path.join(s.path, 'server.properties'), 'utf8'); } catch { }
    const t = toTyped(parseProperties(text)); return { ok: true, ...t, descriptors: Object.fromEntries(Object.entries(PROPERTIES).map(([k, d]) => [k, { ...d, pattern: undefined }])), running: live.has(id) };
  }
  async function setProperties(id, changes) {
    const s = get(id); if (!s || s.target.kind !== 'local') return { ok: false, error: 'UNKNOWN_SERVER' };
    for (const [k, v] of Object.entries(changes || {})) if (!validProp(k, v)) return { ok: false, error: 'INVALID_VALUE', key: k };
    const f = path.join(s.path, 'server.properties'); let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch { }
    fs.writeFileSync(f + '.bak', text); fs.writeFileSync(f + '.tmp', writeProperties(parseProperties(text), changes)); fs.renameSync(f + '.tmp', f);
    if ('server-port' in changes) { s.port = changes['server-port']; saveReg(); }
    return { ok: true, restartNeeded: live.has(id) && Object.keys(changes).some(k => PROPERTIES[k].restart) };
  }
  async function backup(id, { signal, onProgress } = {}) {
    const s = get(id); if (!s || s.target.kind !== 'local') return { ok: false, error: 'BACKUP_LOCAL_ONLY' };
    if (live.has(id)) await command(id, 'save-all flush');
    const bdir = path.join(s.path, 'backups'); fs.mkdirSync(bdir, { recursive: true });
    const level = toTyped(parseProperties(fs.existsSync(path.join(s.path, 'server.properties')) ? fs.readFileSync(path.join(s.path, 'server.properties'), 'utf8') : '')).values['level-name'] || 'world';
    if (!fs.existsSync(path.join(s.path, level))) return { ok: false, error: 'NO_WORLD_YET' };
    const out = path.join(bdir, `${level}-${new Date(now()).toISOString().replace(/[:.]/g, '-')}.7z`);
    const r = await exec(sevenZip, ['a', '-t7z', out, path.join(s.path, level)], { signal, timeoutMs: 3600000 });
    return r.ok ? { ok: true, path: out } : r;
  }
  async function remove(id) {
    const s = get(id); if (!s) return { ok: false, error: 'UNKNOWN_SERVER' };
    await stop(id);
    if (s.target.kind === 'local') fs.rmSync(s.path, { recursive: true, force: true });
    else if (s.target.kind === 'docker') await exec('docker', ['rm', s.container]);
    else if (s.target.kind === 'ssh-docker') await remote(s.target.host, `docker rm ${q(s.container)}`);
    delete reg.servers[id]; saveReg(); return { ok: true };
  }

  // Read this exact version's game rules by running its data generator.
  async function gameRules(id, { javaPath = 'java', signal } = {}) {
    const s = get(id); if (!s || s.target.kind !== 'local') return { ok: false, error: 'LOCAL_ONLY' };
    const out = path.join(s.path, 'generated');
    let r = await exec(javaPath, ['-DbundlerMainClass=net.minecraft.data.Main', '-jar', 'server.jar', '--reports', '--output', out].map(String), { signal, timeoutMs: 600000 });
    if (!r.ok) r = await exec(javaPath, ['-cp', path.join(s.path, 'server.jar'), 'net.minecraft.data.Main', '--reports', '--output', out], { signal, timeoutMs: 600000 });
    try { return { ok: true, rules: gameRulesFromReport(JSON.parse(fs.readFileSync(path.join(out, 'reports', 'commands.json'), 'utf8'))) }; }
    catch { return { ok: false, error: r.ok ? 'REPORT_MISSING' : r.error === 'UNAVAILABLE' ? 'JAVA_MISSING' : 'DATA_GENERATOR_FAILED' }; }
  }

  // Pre-generate a rectangle of chunks with vanilla forceload batches, then write it to a
  // folder or a .7z/.zip next to the chosen destination. The server must be running.
  async function pregenerate(id, { x = -50, z = -50, w = 100, h = 100, destination, format = 'folder' }, { signal, onProgress } = {}) {
    const s = get(id); if (!s || s.target.kind !== 'local') return { ok: false, error: 'LOCAL_ONLY' };
    if (![x, z, w, h].every(Number.isInteger) || w < 1 || h < 1 || w * h > 1000000) return { ok: false, error: 'INVALID_AREA' };
    if (typeof destination !== 'string' || !path.isAbsolute(destination) || !['folder', 'zip'].includes(format)) return { ok: false, error: 'INVALID_DESTINATION' };
    const L = live.get(id); if (!L?.ready) return { ok: false, error: 'START_SERVER_FIRST' };
    const batches = forceloadBatches(x, z, w, h);
    for (let i = 0; i < batches.length; i++) {
      if (signal?.aborted) { await command(id, 'forceload remove all'); return { ok: false, error: 'CANCELLED' }; }
      const [a, b, c, d] = batches[i]; const mark = L.log.length;
      await command(id, `forceload add ${a} ${b} ${c} ${d}`);
      for (let t = 0; t < 240 && !L.log.slice(mark).some(l => /Marked|marked|forceloaded|Chunks? (in|at)|No chunks/i.test(l)); t++) await new Promise(r => setTimeout(r, 500));
      await command(id, 'forceload remove all');
      onProgress?.({ step: 'generate', done: i + 1, total: batches.length });
    }
    await command(id, 'save-all flush'); await new Promise(r => setTimeout(r, 3000));
    const level = toTyped(parseProperties(fs.readFileSync(path.join(s.path, 'server.properties'), 'utf8'))).values['level-name'] || 'world';
    const src = path.join(s.path, level);
    let target = path.join(destination, `${s.name.replace(/[^\w.-]+/g, '-')}-world`), n = 2;
    const ext = format === 'zip' ? '.zip' : '';
    while (fs.existsSync(target + ext)) target = path.join(destination, `${s.name.replace(/[^\w.-]+/g, '-')}-world (${n++})`);
    onProgress?.({ step: 'write' });
    if (format === 'folder') { await fsp.cp(src, target, { recursive: true, errorOnExist: true }); if (!fs.existsSync(path.join(target, 'level.dat'))) return { ok: false, error: 'VERIFY_FAILED' }; return { ok: true, path: target, chunks: w * h }; }
    const r = await exec(sevenZip, ['a', '-tzip', target + ext, src], { signal, timeoutMs: 3600000 });
    if (!r.ok) return r;
    const t = await exec(sevenZip, ['t', target + ext], { timeoutMs: 600000 });
    return t.ok ? { ok: true, path: target + ext, chunks: w * h } : { ok: false, error: 'VERIFY_FAILED' };
  }

  return { catalog, resolveDownload, list, create, start, stop, command, logs, properties, setProperties, backup, remove, gameRules, pregenerate, PROPERTIES };
}

module.exports = { createMinecraft, parseProperties, writeProperties, toTyped, validProp, forceloadBatches, gameRulesFromReport, PROPERTIES };
