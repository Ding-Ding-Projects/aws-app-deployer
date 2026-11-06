'use strict';
// Local conversions that need external tools: FFmpeg for video and audio, 7-Zip for archives,
// and a YAML reader. Every process runs without a shell, can be cancelled, and never overwrites
// an existing file: outputs get a new name next to the input.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MEDIA = {
  mp4: { label: 'Video to MP4 (H.264)', ext: 'mp4', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'] },
  webm: { label: 'Video to WebM (VP9)', ext: 'webm', args: ['-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '5', '-c:a', 'libopus'] },
  gif: { label: 'Video to GIF', ext: 'gif', args: ['-vf', 'fps=12,scale=640:-2:flags=lanczos', '-loop', '0'] },
  mp3: { label: 'Audio to MP3', ext: 'mp3', args: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'] },
  wav: { label: 'Audio to WAV', ext: 'wav', args: ['-vn', '-c:a', 'pcm_s16le'] },
  ogg: { label: 'Audio to Ogg (Opus)', ext: 'ogg', args: ['-vn', '-c:a', 'libopus', '-b:a', '128k'] },
  m4a: { label: 'Extract audio to M4A', ext: 'm4a', args: ['-vn', '-c:a', 'aac', '-b:a', '192k'] },
};

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}.${ext}`), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++}).${ext}`);
  return p;
}

// Run a process, streaming lines to onLine, honouring cancellation.
function stream(cmd, args, { signal, onLine, cwd } = {}) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve({ ok: false, error: 'CANCELLED' });
    let child; try { child = spawn(cmd, args, { shell: false, windowsHide: true, cwd }); } catch { return resolve({ ok: false, error: 'UNAVAILABLE' }); }
    let tail = '', buf = '';
    const feed = chunk => { buf += chunk.toString(); const lines = buf.split(/\r?\n|\r/); buf = lines.pop(); for (const l of lines) { tail = (tail + l + '\n').slice(-4000); onLine?.(l); } };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    const cancel = () => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 1500).unref?.(); };
    signal?.addEventListener('abort', cancel, { once: true });
    child.on('error', () => resolve({ ok: false, error: 'UNAVAILABLE' }));
    child.on('close', code => { signal?.removeEventListener('abort', cancel); resolve(signal?.aborted ? { ok: false, error: 'CANCELLED' } : code === 0 ? { ok: true } : { ok: false, error: 'COMMAND_FAILED', exitCode: code, detail: tail.trim().split('\n').slice(-3).join(' ') }); });
  });
}

function createMedia({ env = process.env, exists = p => fs.existsSync(p), sevenZipBundled, run = stream } = {}) {
  const links = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links') : null;
  const ffmpegPath = () => { const c = links && path.join(links, 'ffmpeg.exe'); return c && exists(c) ? c : 'ffmpeg'; };
  const sevenFull = () => { const c = path.join(env.ProgramFiles || 'C:\\Program Files', '7-Zip', '7z.exe'); return exists(c) ? c : null; };
  async function status() {
    const ff = await run(ffmpegPath(), ['-hide_banner', '-version'], {});
    return { ok: true, ffmpeg: ff.ok, sevenZip: !!sevenZipBundled && exists(sevenZipBundled), sevenZipFull: !!sevenFull() };
  }
  const checkInput = p => typeof p === 'string' && path.isAbsolute(p) && exists(p) && fs.statSync(p).isFile();
  async function convertMedia(input, preset, { signal, onProgress } = {}) {
    const P = MEDIA[preset]; if (!P || !checkInput(input)) return { ok: false, error: 'INVALID_INPUT' };
    const out = uniquePath(path.dirname(input), path.basename(input, path.extname(input)) + ' converted', P.ext);
    let duration = 0;
    const r = await run(ffmpegPath(), ['-hide_banner', '-nostdin', '-n', '-i', input, ...P.args, '-progress', 'pipe:1', out], {
      signal, onLine: l => {
        const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(l); if (d) duration = (+d[1] * 3600 + +d[2] * 60 + +d[3]) * 1000;
        const t = /^out_time_ms=(\d+)/.exec(l); if (t && duration) onProgress?.({ step: 'convert', done: Math.min(duration, +t[1] / 1000), total: duration });
      },
    });
    if (!r.ok) { try { if (exists(out)) fs.unlinkSync(out); } catch { } return r.error === 'UNAVAILABLE' ? { ok: false, error: 'FFMPEG_MISSING' } : r; }
    return { ok: true, path: out, size: fs.statSync(out).size };
  }
  async function archive(files, { signal, onProgress } = {}) {
    if (!Array.isArray(files) || !files.length || files.length > 1000 || !files.every(f => typeof f === 'string' && path.isAbsolute(f) && exists(f))) return { ok: false, error: 'INVALID_INPUT' };
    const out = uniquePath(path.dirname(files[0]), files.length === 1 ? path.basename(files[0]) : 'Archive', '7z');
    const r = await run(sevenFull() || sevenZipBundled, ['a', '-t7z', '-mx=7', '-bsp1', out, ...files], { signal, onLine: l => { const m = /(\d+)%/.exec(l); if (m) onProgress?.({ step: 'archive', done: +m[1], total: 100 }); } });
    return r.ok ? { ok: true, path: out, size: fs.statSync(out).size } : r;
  }
  async function extract(file, { signal, onProgress } = {}) {
    if (!checkInput(file)) return { ok: false, error: 'INVALID_INPUT' };
    const isRar = /\.rar$/i.test(file);
    const exe = isRar ? sevenFull() : (sevenFull() || sevenZipBundled);
    if (!exe) return { ok: false, error: 'SEVEN_ZIP_FULL_REQUIRED' };
    let dest = path.join(path.dirname(file), path.basename(file).replace(/\.(7z|zip|rar|tar|gz|tgz|xz|bz2)$/i, '')), i = 2;
    while (exists(dest)) dest = path.join(path.dirname(file), `${path.basename(file).replace(/\.[^.]+$/, '')} (${i++})`);
    const r = await run(exe, ['x', file, `-o${dest}`, '-y', '-aou', '-bsp1'], { signal, onLine: l => { const m = /(\d+)%/.exec(l); if (m) onProgress?.({ step: 'extract', done: +m[1], total: 100 }); } });
    return r.ok ? { ok: true, path: dest } : r;
  }
  function yamlToJson(text) {
    if (typeof text !== 'string' || text.length > 25 * 1024 * 1024) return { ok: false, error: 'TOO_LARGE' };
    try { const YAML = require('yaml'); const docs = YAML.parseAllDocuments(text, { maxAliasCount: 100 }); const bad = docs.find(d => d.errors.length); if (bad) return { ok: false, error: 'MALFORMED_YAML', detail: bad.errors[0].message.split('\n')[0] }; const values = docs.map(d => d.toJS({ maxAliasCount: 100 })); return { ok: true, text: JSON.stringify(values.length === 1 ? values[0] : values, null, 2) + '\n' }; }
    catch (e) { return { ok: false, error: 'MALFORMED_YAML', detail: String(e.message || e).split('\n')[0] }; }
  }
  return { status, convertMedia, archive, extract, yamlToJson, MEDIA };
}
module.exports = { createMedia, stream, uniquePath, MEDIA };
