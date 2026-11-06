'use strict';
// The shared School mode record, used by every app from this publisher on this Windows user.
// It holds the on/off state, the user's chosen name and one unlock credential (scrypt hash only).
// This is a user-experience lock, not security: deleting the file resets it, and the app says so.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NAME_MAX = 40;
const validName = n => typeof n === 'string' && n.trim().length >= 1 && n.length <= NAME_MAX && !/[\u0000-\u001f<>]/.test(n);
const validCred = c => c && ((c.kind === 'pin' && /^\d{4,12}$/.test(c.value || '')) || (c.kind === 'password' && typeof c.value === 'string' && c.value.length >= 6 && c.value.length <= 200));
const hash = v => { const salt = crypto.randomBytes(16); return { salt: salt.toString('hex'), hash: crypto.scryptSync(v, salt, 32).toString('hex') }; };
const hashOk = (h, v) => typeof v === 'string' && crypto.timingSafeEqual(crypto.scryptSync(v, Buffer.from(h.salt, 'hex'), 32), Buffer.from(h.hash, 'hex'));

function createSchool({ dir, now = Date.now }) {
  const file = path.join(dir, 'school-mode.json');
  const read = () => { try { const r = JSON.parse(fs.readFileSync(file, 'utf8')); return r && typeof r === 'object' ? r : {}; } catch { return {}; } };
  const write = r => { fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(r, null, 2)); fs.renameSync(tmp, file); };
  function state() { const r = read(); return { ok: true, enabled: !!r.enabled, name: validName(r.name) ? r.name : 'School mode', hasCredential: !!(r.credential && r.credential.hash), credentialKind: r.credential?.kind || null, file, waitMs: Math.max(0, (r.until || 0) - now()) }; }
  function rename(name) { if (!validName(name)) return { ok: false, error: 'NAME_INVALID' }; const r = read(); r.name = name.trim(); write(r); return state(); }
  // Turning on needs a credential to exist so that turning off can be checked.
  function enable(cred) {
    const r = read();
    if (!r.credential) { if (!validCred(cred)) return { ok: false, error: 'CREDENTIAL_NEEDED' }; r.credential = { kind: cred.kind, ...hash(cred.value) }; }
    r.enabled = true; write(r); return state();
  }
  function disable(value) {
    const r = read();
    if (!r.enabled) return state();
    if ((r.until || 0) > now()) return { ok: false, error: 'WAIT', waitMs: r.until - now() };
    let good = false; try { good = !!r.credential && hashOk(r.credential, value); } catch { good = false; }
    if (!good) { r.fails = (r.fails || 0) + 1; if (r.fails >= 5) r.until = now() + Math.min(3600000, 30000 * 2 ** (r.fails - 5)); write(r); return { ok: false, error: 'NO_MATCH', attemptsBeforeWait: Math.max(0, 5 - r.fails), file }; }
    r.enabled = false; r.fails = 0; r.until = 0; write(r); return state();
  }
  function changeCredential(oldValue, cred) {
    const r = read();
    if (r.credential && !hashOk(r.credential, oldValue || '')) return { ok: false, error: 'NO_MATCH' };
    if (!validCred(cred)) return { ok: false, error: 'CREDENTIAL_INVALID' };
    r.credential = { kind: cred.kind, ...hash(cred.value) }; write(r); return state();
  }
  return { state, rename, enable, disable, changeCredential, file };
}
module.exports = { createSchool };
