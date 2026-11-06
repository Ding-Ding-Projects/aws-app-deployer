'use strict';
// Local, per-Windows-user settings and history. No secrets are ever stored here.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  theme: 'system', accent: '#6ea8ff', rainbow: false, reduceMotion: false,
  displayName: '', language: 'en', funnyLevel: 3, funnyLevels: { en: 5, yue: 5 }, emoji: true,
  narration: false, voice: '', rate: 1, pitch: 1, voices: { en: '', yue: '' }, sounds: true, logo: null,
  schedule: { enabled: false, lightAt: '07:00', darkAt: '19:00', days: [0, 1, 2, 3, 4, 5, 6] },
  focus: false, calm: false, school: false, timeAware: false, oneThing: false, nextAction: '', momentum: false, momentumUntil: 0,
  sketch: null, schedules: [], externalSource: { enabled: false, url: '', mapKey: 'theme', every: 5 },
  setupComplete: false, launches: 0,
  selection: null, draft: null, vocabulary: null,
  a11y: { textSize: 100, contrast: false, focus: false, targets: false, hidden: false },
  ui: { filtersOpen: {}, panels: {} },
  tickets: [],
  appearance: { elements: {}, presets: {} },
});
const HISTORY_LIMIT = 5000;
const DEPLOY_LIMIT = 50;

const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const VALIDATORS = {
  theme: v => ['system', 'light', 'dark'].includes(v),
  accent: v => typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v), rainbow: v => typeof v === 'boolean', reduceMotion: v => typeof v === 'boolean',
  displayName: v => typeof v === 'string' && v.length <= 60 && !/[\u0000-\u001f]/.test(v),
  language: v => ['en', 'yue', 'both'].includes(v),
  funnyLevel: v => Number.isInteger(v) && v >= 1 && v <= 5,
  funnyLevels: v => v && typeof v === 'object' && ['en', 'yue'].every(k => Number.isInteger(v[k]) && v[k] >= 1 && v[k] <= 5),
  timeAware: v => typeof v === 'boolean', oneThing: v => typeof v === 'boolean', momentum: v => typeof v === 'boolean',
  nextAction: v => typeof v === 'string' && v.length <= 200 && !/[\u0000-\u001f]/.test(v),
  momentumUntil: v => Number.isInteger(v) && v >= 0,
  sketch: v => v === null || (v && typeof v === 'object' && Array.isArray(v.strokes) && v.strokes.length <= 400 && (v.bg === null || v.bg === undefined || (typeof v.bg === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v.bg))) && JSON.stringify(v).length < 6000000),
  schedules: v => Array.isArray(v) && v.length <= 100 && JSON.stringify(v).length < 20000 && v.every(r => r && typeof r.key === 'string' && typeof r.at === 'string' && Array.isArray(r.days)),
  externalSource: v => v && typeof v === 'object' && typeof v.enabled === 'boolean' && typeof v.url === 'string' && v.url.length <= 500 && typeof v.mapKey === 'string' && Number.isInteger(v.every) && v.every >= 1 && v.every <= 1440,
  emoji: v => typeof v === 'boolean', narration: v => typeof v === 'boolean',
  voice: v => typeof v === 'string' && v.length <= 200,
  rate: v => typeof v === 'number' && v >= 0.5 && v <= 2,
  sounds: v => typeof v === 'boolean',
  pitch: v => typeof v === 'number' && v >= 0.5 && v <= 2,
  voices: v => v && typeof v === 'object' && ['en', 'yue'].every(k => typeof v[k] === 'string' && v[k].length <= 200),
  logo: v => v === null || (v && typeof v === 'object' && JSON.stringify(v).length < 420000 && (v.image === undefined || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v.image))),
  schedule: v => v && typeof v === 'object' && typeof v.enabled === 'boolean' && isTime(v.lightAt) && isTime(v.darkAt) && Array.isArray(v.days) && v.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6),
  focus: v => typeof v === 'boolean', calm: v => typeof v === 'boolean', school: v => typeof v === 'boolean',
  setupComplete: v => typeof v === 'boolean',
  selection: v => v === null || (v && typeof v.profile === 'string' && typeof v.region === 'string'),
  draft: v => v === null || (v && typeof v === 'object' && JSON.stringify(v).length < 20000 && !('secrets' in v)),
  vocabulary: v => v === null || (v && typeof v === 'object' && v.entries && typeof v.entries === 'object'),
  a11y: v => v && typeof v === 'object' && Number.isInteger(v.textSize) && v.textSize >= 80 && v.textSize <= 160 && ['contrast', 'focus', 'targets', 'hidden'].every(k => typeof v[k] === 'boolean'),
  tickets: v => Array.isArray(v) && v.length <= 200 && v.every(t => t && typeof t.id === 'string' && typeof t.description === 'string' && t.description.length <= 2000),
  appearance: v => v && typeof v === 'object' && v.elements && typeof v.elements === 'object' && v.presets && typeof v.presets === 'object' && JSON.stringify(v).length < 200000,
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
    if (raw.labels && typeof raw.labels === 'object') state.labels = raw.labels;
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
    // Restores never rewrite history: they append a new revision naming the one restored.
    restore(index) {
      const h = state.history[index];
      if (!h) return { ok: false, error: 'UNKNOWN_REVISION' };
      if (h.key === 'deployments.removed' && Array.isArray(h.restore)) {
        const have = new Set(state.deployments.map(d => d.id || d.at));
        const back = h.restore.filter(d => !have.has(d.id || d.at));
        state.deployments.push(...back); state.deployments.sort((a, b) => a.at.localeCompare(b.at));
        state.history.push({ at: now(), key: 'deployments.restored', before: null, after: back.map(d => d.name), restoredFrom: index });
        save(); return { ok: true, restored: back.length, skipped: h.restore.length - back.length };
      }
      if (!(h.key in DEFAULTS) || h.key === 'vocabulary' || !VALIDATORS[h.key]?.(h.before)) return { ok: false, error: 'NOT_RESTORABLE' };
      const before = state.settings[h.key];
      state.settings[h.key] = structuredClone(h.before); written.add(h.key);
      state.history.push({ at: now(), key: h.key, before, after: h.before, restoredFrom: index });
      save(); return { ok: true, key: h.key, value: state.settings[h.key] };
    },
    label(index, text) {
      if (!state.history[index] || typeof text !== 'string' || text.length > 80) return { ok: false, error: 'INVALID_INPUT' };
      state.labels = { ...(state.labels || {}), [index]: text.trim() }; save(); return { ok: true };
    },
    labels: () => ({ ...(state.labels || {}) }),
    reset(key) { if (!(key in DEFAULTS)) return { ok: false, error: 'INVALID_INPUT' }; return this.set(key, structuredClone(DEFAULTS[key])); },
  };
}

module.exports = { createStore, DEFAULTS, VALIDATORS };
