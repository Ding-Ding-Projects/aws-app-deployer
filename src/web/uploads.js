'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_BYTES = 16 * 1024 * 1024;
function inside(root, file) { return typeof file === 'string' && path.isAbsolute(file) && path.resolve(file).startsWith(path.resolve(root) + path.sep); }
async function upload(root, files) {
  if (!Array.isArray(files) || !files.length || files.length > 500) throw Error('INVALID_UPLOAD');
  let size = 0; const seen = new Set();
  const checked = files.map(f => {
    if (!f || typeof f.path !== 'string' || f.path.length > 512 || f.path.includes('\\') || f.path.split('/').some(p => !p || p === '.' || p === '..' || /[\x00-\x1f:]/.test(p)) || path.isAbsolute(f.path) || seen.has(f.path) || typeof f.content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.content)) throw Error('INVALID_UPLOAD');
    seen.add(f.path); const bytes = Buffer.from(f.content, 'base64'); size += bytes.length; if (size > MAX_BYTES) throw Error('UPLOAD_TOO_LARGE'); return { name: f.path, bytes };
  });
  const dir = path.join(root, randomUUID()); await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  try { for (const f of checked) { const dest = path.join(dir, f.name); await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 }); await fs.writeFile(dest, f.bytes, { flag: 'wx', mode: 0o600 }); } }
  catch (e) { await fs.rm(dir, { recursive: true, force: true }); throw e; }
  return checked.map(f => path.join(dir, f.name));
}
module.exports = { upload, inside, MAX_BYTES };
