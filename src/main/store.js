'use strict';
// Local, per-Windows-user settings and history. No secrets are ever stored here.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  theme: 'system', accent: '#6ea8ff', rainbow: false, reduceMotion: false,
  displayName: '', language: 'en', funnyLevel: 3, emoji: true,
  narration: false, voice: '', rate: 1, sounds: true,
  schedule: { enabled: false, lightAt: '07:00', darkAt: '19:00', days: [0, 1, 2, 3, 4, 5, 6] },
  focus: false, calm: false, school: false,
  setupComplete: false, launches: 0,
  selection: null, draft: null, vocabulary: null,
  a11y: { textSize: 100, contrast: false, focus: false, targets: false, hidden: false },
  ui: { filtersOpen: {}, panels: {} },
});
const HISTORY_LIMIT = 300;
const DEPLOY_LIMIT = 50;

const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const VALIDATORS = {
  theme: v => ['system', 'light', 'dark'].includes(v),
  accent: isHex, rainbow: v => typeof v === 'boolean', reduceMotion: v => typeof v === 'boolean',
  displayName: v => typeof v === 'string' && v.length <= 60 && !/[\u0000-\u001f]/.test(v),
  language: v => ['en', 'yue', 'both'].includes(v),
  funnyLevel: v => Number.isInteger(v) && v >= 1 && v <= 5,
  emoji: v => typeof v === 'boolean', narration: v => typeof v === 'boolean',
  voice: v => typeof v === 'string' && v.length <= 200,
  rate: v => typeof v === 'number' && v >= 0.5 && v <= 2,
  sounds: v => typeof v === 'boolean',
  schedule: v => v && typeof v === 'object' && typeof v.enabled === 'boolean' && isTime(v.lightAt) && isTime(v.darkAt) && Array.isArray(v.days) && v.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6),
  focus: v => typeof v === 'boolean', calm: v => typeof v === 'boolean', school: v => typeof v === 'boolean',
  setupComplete: v => typeof v === 'boolean',
  selection: v => v === null || (v && typeof v.profile === 'string' && typeof v.region === 'string'),
  draft: v => v === null || (v && typeof v === 'object' && JSON.stringify(v).length < 20000 && !('secrets' in v)),
  vocabulary: v => v === null || (v && typeof v === 'object' && v.entries && typeof v.entries === 'object'),
  a11y: v => v && typeof v === 'object' && Number.isInteger(v.textSize) && v.textSize >= 80 && v.textSize <= 160 && ['contrast', 'focus', 'targets', 'hidden'].every(k => typeof v[k] === 'boolean'),
  ui: v => v && typeof v === 'object' && v.filtersOpen && typeof v.filtersOpen === 'object' && v.panels && typeof v.panels === 'object' && JSON.stringify(v).length < 20000,
};

function createStore(dir, { now = () => new Date().toISOString() } = {}) {
  const file = path.join(dir, 'settings.json');
  let state = { settings: structuredClone(DEFAULTS), history: [], deployments: [] };
  const written = new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(raw.settings || {})) if (VALIDATORS[k]?.(v) || k === 'launches') { state.settings[k] = v; written.add(k); }
    if (Array.isArray(raw.history)) state.history = raw.history.slice(-HISTORY_LIMIT);
    if (Array.isArray(raw.deployments)) state.deployments = raw.deployments.slice(-DEPLOY_LIMIT);
  } catch { /* first run or unreadable file: defaults */ }
  // Migration: any stored off switch for the dim sum surprise is dropped; it cannot be turned off.
  delete state.settings.dimSum;
  const save = () => { fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state, null, 2)); fs.renameSync(tmp, file); };
  return {
    get: () => structuredClone(state.settings),
    set(key, value) {
      if (key === 'dimSum') return { ok: true, value: true, locked: true };
      if (!VALIDATORS[key]?.(value)) return { ok: false, error: 'INVALID_INPUT' };
      const before = state.settings[key];
      state.settings[key] = value;
      written.add(key);
      if (!['draft', 'selection'].includes(key)) state.history.push({ at: now(), key, before: key === 'vocabulary' ? !!before : before, after: key === 'vocabulary' ? !!value : value });
      state.history = state.history.slice(-HISTORY_LIMIT);
      save();
      return { ok: true, value };
    },
    bumpLaunch() { state.settings.launches = (state.settings.launches || 0) + 1; save(); return state.settings.launches; },
    history: () => structuredClone(state.history),
    deployments: () => structuredClone(state.deployments),
    sources: () => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, written.has(k) ? 'file' : 'default'])),
    defaults: () => structuredClone(DEFAULTS),
    removeDeployments(ats) {
      if (!Array.isArray(ats) || ats.some(a => typeof a !== 'string')) return { ok: false, error: 'INVALID_INPUT' };
      const before = state.deployments.length, set = new Set(ats);
      const key = d => d.id || d.at;
      const removed = state.deployments.filter(d => set.has(key(d)));
      state.deployments = state.deployments.filter(d => !set.has(key(d)));
      state.history.push({ at: now(), key: 'deployments.removed', before: removed.map(d => d.name), after: null, restore: removed });
      save();
      return { ok: true, removed: before - state.deployments.length, skipped: ats.length - (before - state.deployments.length) };
    },
    recordDeployment(entry) { state.deployments.push({ id: require('node:crypto').randomUUID(), at: now(), ...entry }); state.deployments = state.deployments.slice(-DEPLOY_LIMIT); save(); },
    reset(key) { if (!(key in DEFAULTS)) return { ok: false, error: 'INVALID_INPUT' }; return this.set(key, structuredClone(DEFAULTS[key])); },
  };
}

module.exports = { createStore, DEFAULTS, VALIDATORS };
