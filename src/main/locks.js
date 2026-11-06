'use strict';
// Toy element locks. Just for fun, never security: deleting the app data folder removes them.
// Each lock has its own policy and credentials. PIN and password are stored as scrypt hashes;
// the TOTP secret is stored encrypted. The vault file itself is encrypted with the operating
// system's protected storage (DPAPI on Windows) and is never part of settings, history or exports.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const POLICIES = {
  pin: ['pin'], password: ['password'], 'pin+password': ['pin', 'password'],
  'password+totp': ['password', 'totp'], 'pin+totp': ['pin', 'totp'], 'password+pin+totp': ['password', 'pin', 'totp'],
};
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32encode = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32decode = s => { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) throw new Error('base32'); bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
function totp(secret, t = Date.now(), step = 30, digits = 6) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / step)));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits)).padStart(digits, '0');
}
const totpOk = (secret, code, t = Date.now()) => /^\d{6}$/.test(code || '') && [-1, 0, 1].some(w => crypto.timingSafeEqual(Buffer.from(totp(secret, t + w * 30000)), Buffer.from(code)));
const hash = v => { const salt = crypto.randomBytes(16); return { salt: salt.toString('hex'), hash: crypto.scryptSync(v, salt, 32).toString('hex') }; };
const hashOk = (h, v) => typeof v === 'string' && crypto.timingSafeEqual(crypto.scryptSync(v, Buffer.from(h.salt, 'hex'), 32), Buffer.from(h.hash, 'hex'));
const validPin = v => typeof v === 'string' && /^\d{4,12}$/.test(v);
const validPassword = v => typeof v === 'string' && v.length >= 6 && v.length <= 200;
const WAIT_FREE = 5, WAIT_BASE = 30000, WAIT_MAX = 3600000, LADDER_PER_HOUR = 3;

function createLocks({ dir, safeStorage, now = Date.now, random = crypto.randomInt, catalog = async () => [] }) {
  const file = path.join(dir, 'locks.vault');
  const available = () => !!safeStorage?.isEncryptionAvailable?.();
  let vault = { locks: {} };
  try { if (fs.existsSync(file) && available()) vault = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))); } catch { vault = { locks: {}, unreadable: true }; }
  const save = () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify({ locks: vault.locks }))); };
  const seal = s => safeStorage.encryptString(s).toString('base64');
  const unseal = s => safeStorage.decryptString(Buffer.from(s, 'base64'));
  const nonces = new Map();
  const validId = id => typeof id === 'string' && /^[\w:.\-=]{1,160}$/.test(id);

  function waitLeft(l) { return Math.max(0, (l.until || 0) - now()); }
  function status() {
    return { ok: true, available: available(), unreadable: !!vault.unreadable, dir, locks: Object.entries(vault.locks).map(([id, l]) => ({ id, label: l.label, policy: l.policy, createdAt: l.createdAt, waitMs: waitLeft(l), ladderLeft: LADDER_PER_HOUR - (l.ladder || []).filter(t => now() - t < 3600000).length })) };
  }
  function newTotp(label) {
    const secret = b32encode(crypto.randomBytes(20));
    const uri = `otpauth://totp/${encodeURIComponent('AWS App Deployer:' + String(label || 'lock').slice(0, 40))}?secret=${secret}&issuer=${encodeURIComponent('AWS App Deployer')}&algorithm=SHA1&digits=6&period=30`;
    return { ok: true, secret, uri };
  }
  function create(id, { label, policy, pin, password, totpSecret, totpCode } = {}) {
    if (!available()) return { ok: false, error: 'VAULT_UNAVAILABLE' };
    if (!validId(id) || !POLICIES[policy] || typeof label !== 'string') return { ok: false, error: 'INVALID_INPUT' };
    if (vault.locks[id]) return { ok: false, error: 'ALREADY_LOCKED' };
    const need = POLICIES[policy], rec = { label: label.slice(0, 80), policy, createdAt: new Date(now()).toISOString(), fails: 0, until: 0, ladder: [] };
    if (need.includes('pin')) { if (!validPin(pin)) return { ok: false, error: 'PIN_INVALID' }; rec.pin = hash(pin); }
    if (need.includes('password')) { if (!validPassword(password)) return { ok: false, error: 'PASSWORD_INVALID' }; rec.password = hash(password); }
    if (need.includes('totp')) { try { if (!totpOk(totpSecret, totpCode, now())) return { ok: false, error: 'TOTP_CODE_WRONG' }; } catch { return { ok: false, error: 'TOTP_SECRET_INVALID' }; } rec.totp = seal(totpSecret); }
    vault.locks[id] = rec; save();
    return { ok: true };
  }
  function verify(id, creds = {}) {
    const l = vault.locks[id];
    if (!l) return { ok: false, error: 'NOT_LOCKED' };
    const wait = waitLeft(l); if (wait) return { ok: false, error: 'WAIT', waitMs: wait };
    let good = true;
    for (const f of POLICIES[l.policy]) {
      try {
        if (f === 'pin') good = hashOk(l.pin, creds.pin) && good;
        if (f === 'password') good = hashOk(l.password, creds.password) && good;
        if (f === 'totp') good = totpOk(unseal(l.totp), creds.totp, now()) && good;
      } catch { good = false; }
    }
    if (good) { l.fails = 0; l.until = 0; save(); return { ok: true }; }
    l.fails = (l.fails || 0) + 1;
    if (l.fails >= WAIT_FREE) l.until = now() + Math.min(WAIT_MAX, WAIT_BASE * 2 ** (l.fails - WAIT_FREE));
    l.waitTotal = waitLeft(l); save();
    return { ok: false, error: 'NO_MATCH', attemptsBeforeWait: Math.max(0, WAIT_FREE - l.fails), waitMs: waitLeft(l) };
  }
  function remove(id, creds) { const v = verify(id, creds); if (!v.ok) return v; delete vault.locks[id]; save(); return { ok: true }; }

  // ---- The unlock ladder: each completed rung clears a share of the wait, never the credential.
  async function ladderStart(id, rung, { school = false } = {}) {
    const l = vault.locks[id];
    if (!l || !waitLeft(l)) return { ok: false, error: 'NO_WAIT' };
    l.ladder = (l.ladder || []).filter(t => now() - t < 3600000);
    if (l.ladder.length >= LADDER_PER_HOUR) return { ok: false, error: 'LADDER_LIMIT' };
    const order = school ? ['sums', 'mole', 'clock'] : ['dimsum', 'sums', 'mole', 'clock'];
    if (!order.includes(rung)) return { ok: false, error: 'INVALID_INPUT' };
    const nonce = crypto.randomBytes(16).toString('hex');
    let challenge;
    if (rung === 'dimsum') {
      const dishes = (await catalog()).filter(d => d?.name?.en);
      if (dishes.length < 4) return { ok: false, error: 'CATALOG_UNAVAILABLE' };
      const pick = new Set(); while (pick.size < 4) pick.add(random(dishes.length));
      const opts = [...pick].map(i => dishes[i]); const answer = random(4);
      challenge = { rung, prompt: opts[answer].description?.en || opts[answer].name.zhHant, zh: opts[answer].name.zhHant, choices: opts.map(d => d.name.en) };
      nonces.set(nonce, { id, rung, answer, at: now() });
    } else if (rung === 'sums') {
      const qs = Array.from({ length: 10 }, () => [random(1, 13), random(1, 13)]);
      challenge = { rung, sums: qs.map(([a, b]) => `${a} + ${b}`) };
      nonces.set(nonce, { id, rung, answer: qs.map(([a, b]) => a + b), at: now() });
    } else if (rung === 'mole') {
      const duration = 20000, moles = Array.from({ length: 16 }, (_, i) => ({ id: crypto.randomBytes(4).toString('hex'), hole: random(9), at: 600 + i * 1150 }));
      challenge = { rung, duration, moles, need: 10 };
      nonces.set(nonce, { id, rung, answer: new Set(moles.map(m => m.id)), duration, at: now() });
    } else { challenge = { rung, waitMs: waitLeft(l) }; return { ok: true, nonce: null, challenge }; }
    return { ok: true, nonce, challenge };
  }
  function ladderAnswer(nonce, answer) {
    const n = nonces.get(nonce); nonces.delete(nonce);
    if (!n) return { ok: false, error: 'NONCE_USED_OR_UNKNOWN' };
    const l = vault.locks[n.id]; if (!l) return { ok: false, error: 'NOT_LOCKED' };
    let passed = false;
    if (n.rung === 'dimsum') passed = answer === n.answer;
    if (n.rung === 'sums') passed = Array.isArray(answer) && answer.length === 10 && answer.every((v, i) => Number(v) === n.answer[i]);
    if (n.rung === 'mole') { if (now() - n.at < n.duration) return { ok: false, error: 'ROUND_NOT_FINISHED' }; const hits = new Set((Array.isArray(answer) ? answer : []).filter(h => n.answer.has(h))); passed = hits.size >= 10; }
    if (!passed) return { ok: true, passed: false, waitMs: waitLeft(l) };
    l.ladder = [...(l.ladder || []), now()];
    const share = Math.ceil((l.waitTotal || waitLeft(l)) / 4);
    l.until = Math.max(now(), (l.until || 0) - share); save();
    return { ok: true, passed: true, waitMs: waitLeft(l) };
  }
  return { status, newTotp, create, verify, remove, ladderStart, ladderAnswer, POLICIES };
}

module.exports = { createLocks, totp, b32encode, POLICIES };
