'use strict';
// Local Ollama manager. Talks only to Ollama's documented local HTTP API on the fixed loopback
// address. The model library list is read from ollama.com's public library pages; when those
// cannot be read, only installed models are shown and the catalog is reported as offline.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BASE = 'http://127.0.0.1:11434';
const MODEL = /^[a-z0-9][a-z0-9._-]{0,63}(\/[a-z0-9._-]{1,64})?(:[A-Za-z0-9._-]{1,64})?$/;

// Conservative fit verdict from real numbers only. Unknown inputs give Unknown, never a guess.
function fitVerdict({ sizeBytes, ramBytes, vramBytes }) {
  if (!sizeBytes || !ramBytes) return { verdict: 'Unknown', why: 'The model size or this computer\'s memory is not known.' };
  const need = sizeBytes * 1.2;
  if (vramBytes && need <= vramBytes) return { verdict: 'Runs well', why: `Needs about ${gb(need)} and the graphics card has ${gb(vramBytes)}.` };
  if (need <= ramBytes * 0.6) return { verdict: 'Runs with limits', why: `Needs about ${gb(need)}; it fits in system memory (${gb(ramBytes)}) but runs slower without enough graphics memory.` };
  return { verdict: 'Unlikely', why: `Needs about ${gb(need)}, more than this computer can comfortably give (${gb(ramBytes)} memory${vramBytes ? `, ${gb(vramBytes)} graphics memory` : ''}).` };
}
const gb = b => `${(b / 1073741824).toFixed(1)} GB`;

function parseLibrary(html) {
  const names = new Set(); const re = /href="\/library\/([a-z0-9._-]{1,64})"/g; let m;
  while ((m = re.exec(html))) names.add(m[1]);
  return [...names];
}
function parseTags(html, model) {
  const tags = new Map(); const re = new RegExp(`href="/library/${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([A-Za-z0-9._-]{1,64})"`, 'g'); let m;
  while ((m = re.exec(html))) tags.set(m[1], null);
  const sizeRe = /([A-Za-z0-9._-]+)<\/[^>]+>[\s\S]{0,400}?(\d+(?:\.\d+)?)\s*(GB|MB)/g;
  while ((m = sizeRe.exec(html))) if (tags.has(m[1]) && tags.get(m[1]) === null) tags.set(m[1], Math.round(parseFloat(m[2]) * (m[3] === 'GB' ? 1073741824 : 1048576)));
  return [...tags].map(([tag, size]) => ({ tag, size }));
}

function createOllama({ dir, fetchImpl = globalThis.fetch, spawnProcess = spawn, env = process.env, run }) {
  const chatsFile = path.join(dir, 'ollama-chats.json');
  let owned = null, catalogCache = null;
  const api = async (p, opts = {}) => {
    const r = await fetchImpl(BASE + p, { ...opts, signal: opts.signal || AbortSignal.timeout(opts.timeout || 8000), headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) { let e = ''; try { e = (await r.json()).error || ''; } catch { } return { ok: false, error: 'HTTP_' + r.status, detail: String(e).slice(0, 200) }; }
    return { ok: true, res: r };
  };
  const exe = () => { const c = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'); return c && fs.existsSync(c) ? c : 'ollama'; };

  async function hardware() {
    const ram = os.totalmem(); let vram = 0, gpu = null, disk = null;
    if (run) { const r = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { timeoutMs: 8000 }); if (r.ok) { const [n, mb] = r.stdout.trim().split('\n')[0].split(',').map(s => s.trim()); gpu = n; vram = parseInt(mb, 10) * 1048576; } }
    try { const st = fs.statfsSync(env.OLLAMA_MODELS || os.homedir()); disk = st.bavail * st.bsize; } catch { }
    return { ram, vram, gpu, disk, at: Date.now() };
  }
  async function status() {
    let v; try { v = await api('/api/version', { timeout: 2500 }); } catch { v = { ok: false }; }
    if (!v.ok) {
      const installed = run ? (await run(exe(), ['--version'], { timeoutMs: 8000 })).ok : false;
      return { ok: true, installed, running: false, owned: !!owned };
    }
    const version = (await v.res.json()).version;
    const [tags, ps] = await Promise.all([api('/api/tags'), api('/api/ps')]);
    return { ok: true, installed: true, running: true, version, owned: !!owned, models: tags.ok ? (await tags.res.json()).models || [] : [], loaded: ps.ok ? (await ps.res.json()).models || [] : [], hardware: await hardware() };
  }
  async function start() {
    if (owned) return { ok: true, already: true };
    try { owned = spawnProcess(exe(), ['serve'], { shell: false, windowsHide: true, stdio: 'ignore', env: { ...env, OLLAMA_HOST: '127.0.0.1:11434' } }); } catch { return { ok: false, error: 'OLLAMA_MISSING' }; }
    owned.on('exit', () => { owned = null; }); owned.on('error', () => { owned = null; });
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); try { if ((await api('/api/version', { timeout: 1500 })).ok) return { ok: true }; } catch { } if (!owned) return { ok: false, error: 'OLLAMA_MISSING' }; }
    return { ok: false, error: 'NOT_HEALTHY' };
  }
  function stop() { if (!owned) return { ok: false, error: 'NOT_OWNED' }; owned.kill(); owned = null; return { ok: true }; }
  async function catalog({ refresh = false } = {}) {
    if (catalogCache && !refresh) return catalogCache;
    try {
      const r = await fetchImpl('https://ollama.com/library?sort=popular', { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      const names = parseLibrary(await r.text());
      if (!names.length) throw new Error();
      catalogCache = { ok: true, models: names.map(n => ({ name: n })), at: Date.now(), source: 'ollama.com/library', complete: null };
    } catch { catalogCache = catalogCache ? { ...catalogCache, stale: true } : { ok: false, error: 'CATALOG_OFFLINE' }; }
    return catalogCache;
  }
  async function tags(model) {
    if (!/^[a-z0-9._-]{1,64}$/.test(model || '')) return { ok: false, error: 'INVALID_INPUT' };
    try { const r = await fetchImpl(`https://ollama.com/library/${model}/tags`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) return { ok: false, error: 'HTTP_' + r.status }; return { ok: true, model, tags: parseTags(await r.text(), model), at: Date.now() }; }
    catch { return { ok: false, error: 'CATALOG_OFFLINE' }; }
  }
  async function streamNdjson(res, onObj) {
    let buf = ''; const dec = new TextDecoder();
    for await (const chunk of res.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { try { onObj(JSON.parse(line)); } catch { } } } }
  }
  async function pull(model, { signal, onProgress } = {}) {
    if (!MODEL.test(model || '')) return { ok: false, error: 'INVALID_INPUT' };
    let r; try { r = await api('/api/pull', { method: 'POST', body: JSON.stringify({ model, stream: true }), signal, timeout: 86400000 }); } catch { return { ok: false, error: signal?.aborted ? 'CANCELLED' : 'OLLAMA_NOT_RUNNING' }; }
    if (!r.ok) return r;
    let last = null, err = null;
    try { await streamNdjson(r.res, o => { if (o.error) err = o.error; last = o; if (o.total) onProgress?.({ step: o.status, done: o.completed || 0, total: o.total }); else onProgress?.({ step: o.status }); }); } catch { return { ok: false, error: signal?.aborted ? 'CANCELLED' : 'PULL_INTERRUPTED' }; }
    return err ? { ok: false, error: 'PULL_FAILED', detail: String(err).slice(0, 200) } : last?.status === 'success' ? { ok: true, model } : { ok: false, error: 'PULL_INCOMPLETE' };
  }
  async function remove(model) { if (!MODEL.test(model || '')) return { ok: false, error: 'INVALID_INPUT' }; const r = await api('/api/delete', { method: 'DELETE', body: JSON.stringify({ model }) }); return r.ok ? { ok: true } : r; }
  async function chat({ model, messages, system, options }, { signal, onProgress } = {}) {
    if (!MODEL.test(model || '') || !Array.isArray(messages) || messages.length > 200 || JSON.stringify(messages).length > 400000) return { ok: false, error: 'INVALID_INPUT' };
    const msgs = [...(system ? [{ role: 'system', content: String(system).slice(0, 8000) }] : []), ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 32000) }))];
    const opts = {}; for (const [k, lo, hi] of [['temperature', 0, 2], ['top_p', 0, 1], ['num_ctx', 256, 131072], ['seed', 0, 2 ** 31]]) if (typeof options?.[k] === 'number' && options[k] >= lo && options[k] <= hi) opts[k] = options[k];
    let r; try { r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ model, messages: msgs, stream: true, options: opts }), signal, timeout: 600000 }); } catch { return { ok: false, error: signal?.aborted ? 'CANCELLED' : 'OLLAMA_NOT_RUNNING' }; }
    if (!r.ok) return r;
    let text = '', stats = null;
    try { await streamNdjson(r.res, o => { if (o.message?.content) { text += o.message.content; if (text.length > 200000) throw new Error('limit'); onProgress?.({ step: 'token', delta: o.message.content }); } if (o.done) stats = { evalCount: o.eval_count, durationMs: Math.round((o.total_duration || 0) / 1e6) }; }); }
    catch { return { ok: !!text, partial: true, text, error: signal?.aborted ? 'CANCELLED' : 'STREAM_INTERRUPTED' }; }
    return { ok: true, text, stats };
  }
  function chats() { try { return { ok: true, ...JSON.parse(fs.readFileSync(chatsFile, 'utf8')) }; } catch { return { ok: true, sessions: [] }; } }
  function saveChats(data) {
    if (!data || !Array.isArray(data.sessions) || data.sessions.length > 500 || JSON.stringify(data).length > 20e6) return { ok: false, error: 'INVALID_INPUT' };
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(chatsFile + '.tmp', JSON.stringify({ sessions: data.sessions })); fs.renameSync(chatsFile + '.tmp', chatsFile); return { ok: true };
  }
  return { status, start, stop, catalog, tags, pull, remove, chat, chats, saveChats, hardware, fitVerdict };
}
module.exports = { createOllama, fitVerdict, parseLibrary, parseTags };
