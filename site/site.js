// Landing page features: command palette, language, funny level, accessibility tools,
// context menu, offline docs, direct installer download and the dim sum surprise.
// Uses the same lib.js as the app. Preferences stay in this browser only.
(() => {
  'use strict';
  const Lib = window.Lib;
  const app = document.getElementById('app');
  const REPO = 'Ding-Ding-Projects/aws-app-deployer';
  const KEY = 'aws-app-deployer.site/1';
  const DEFAULTS = { theme: 'system', lang: 'en', funnyEn: 5, funnyYue: 5, textSize: 100, contrast: false, reduce: false, focus: false, targets: false, dim: false, low: false, clock: false, one: false, next: '', momentum: false, momentumUntil: 0, accent: '', schedules: [], school: { enabled: false, name: 'School mode', salt: '', hash: '' } };
  let P = { ...DEFAULTS };
  try { P = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage blocked: defaults only */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* not saved, still applied */ } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, cls = '') => `<i class="ms ${cls}" aria-hidden="true">${n}</i>`;
  const live = document.getElementById('live');
  const say = t => { live.textContent = ''; setTimeout(() => (live.textContent = t), 30); };

  // Effective values: scheduled rules and School mode sit on top of the saved choices.
  const MAP = { theme: 'theme', language: 'lang', focus: 'dim', calm: 'low', timeAware: 'clock', accent: 'accent' };
  let E = {};
  function effective() {
    E = { ...P }; const sched = Lib.scheduledValues(P.schedules, new Date());
    for (const [k, v] of Object.entries(sched)) if (MAP[k]) E[MAP[k]] = v;
    if (P.school.enabled) E.lang = 'en';
    return E;
  }
  setInterval(() => { const before = JSON.stringify(E); effective(); if (JSON.stringify(E) !== before) apply(); }, 30000);

  // ---------- language ----------
  const YUE = {
    nav_how: '點樣用', nav_aws: '會整啲乜', nav_features: '功能', nav_docs: '說明', nav_faq: '問題',
    hero: '由 Dockerfile 去到<em>公開連結</em>，一撳搞掂。',
    hero_sub: '免費 Windows app：幫你 build container、喺 AWS 起好網絡同 load balancer、用 Fargate 行、確認健康，然後俾條連結你。',
    download: 'Windows 版下載', how_btn: '睇下點用', how_title: '三步。唔使開 console，唔使寫 YAML。',
    aws_title: '第一次部署已經係正式規格。', features_title: '真心做完件事。', screens_title: '每個狀態都畫晒，冇假嘢。',
    faq_title: '部署之前。', docs_title: '同 app 入面一樣嘅說明。', dl_title: '直接下載安裝程式', cta: '今日就出你個 container。',
    dimsum_title: '點心驚喜',
  };
  const FUNNY = [
    ['From Dockerfile to a public link.', '由 Dockerfile 到公開連結。'],
    ['From Dockerfile to a public link. One click.', '由 Dockerfile 到公開連結，一撳搞掂。'],
    ['From Dockerfile to a public link, before your tea gets cold.', '由 Dockerfile 到公開連結，杯茶都未凍。'],
    ['From Dockerfile to a public link, faster than the har gow trolley.', '由 Dockerfile 到公開連結，快過蝦餃車仔。'],
    ['From Dockerfile to a public link. The load balancer did the heavy lifting; we just pointed.', '由 Dockerfile 到公開連結。粗重嘢 load balancer 做晒，我哋只係指一指。'],
  ];
  const originals = new Map();
  function applyLanguage() {
    const P = E;
    document.documentElement.lang = P.lang === 'yue' ? 'zh-HK' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
      const en = originals.get(el), zh = YUE[el.dataset.i18n];
      el.innerHTML = !zh || P.lang === 'en' ? en : P.lang === 'yue' ? zh : `${en}<span class="both-yue" lang="zh-HK">${zh}</span>`;
    });
    const f = document.querySelector('[data-funny]');
    if (f) { f.hidden = P.school.enabled; const en = FUNNY[P.funnyEn - 1][0], zh = FUNNY[P.funnyYue - 1][1]; f.textContent = P.lang === 'yue' ? zh : P.lang === 'both' ? `${en} ${zh}` : en; }
    document.querySelectorAll('[data-school-hide]').forEach(el => { el.hidden = P.school.enabled; });
    document.querySelectorAll('[data-set-lang]').forEach(b => { b.classList.toggle('on', b.dataset.setLang === P.lang); b.setAttribute('aria-pressed', b.dataset.setLang === P.lang); });
  }

  // ---------- appearance and accessibility ----------
  function apply() {
    effective(); const P = E;
    const dark = P.theme === 'dark' || (P.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
    const reduce = P.reduce || matchMedia('(prefers-reduced-motion: reduce)').matches;
    app.classList.toggle('light', !dark); app.classList.toggle('contrast', P.contrast); app.classList.toggle('reduce', reduce);
    app.classList.toggle('focusring', P.focus); app.classList.toggle('bigtargets', P.targets); app.classList.toggle('attn-dim', P.dim); app.classList.toggle('attn-low', P.low);
    if (P.low) app.classList.add('reduce');
    drawAttention();
    document.body.style.background = dark ? '#0b0d12' : '#f4f6fa';
    if (P.accent && /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(P.accent)) app.style.setProperty('--ac', P.accent); else app.style.removeProperty('--ac');
    document.documentElement.style.fontSize = P.textSize + '%';
    app.style.zoom = P.textSize / 100;
    const t = document.querySelector('[data-act="theme"]'); if (t) { t.innerHTML = ic(dark ? 'dark_mode' : 'light_mode', 'sm'); t.setAttribute('aria-label', `Theme: ${P.theme}. Activate to change.`); }
    applyLanguage();
  }
  function setPref(k, v) { P[k] = v; save(); apply(); if (palette) drawPalette(); if (panel) drawPanel(); }
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);

  // Settings shared by the palette and the accessibility panel, each with a live control.
  const seg = (k, opts) => `<span class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${E[k] === v}" class="${E[k] === v ? 'on' : ''}" data-pref="${k}" data-v="${v}">${l}</button>`).join('')}</span>`;
  const sw = k => `<button class="toggle ${E[k] ? 'on' : ''}" role="switch" aria-checked="${!!E[k]}" data-flip="${k}" aria-label="${k}"></button>`;
  const stepper = (k, label, unit, lo, hi, step) => `<span class="row" style="gap: 6px"><span class="badge ac mono">${P[k]}${unit}</span><button class="chip" data-step="${k}" data-d="${-step}" data-lo="${lo}" data-hi="${hi}" aria-label="Less ${label}">−</button><button class="chip" data-step="${k}" data-d="${step}" data-lo="${lo}" data-hi="${hi}" aria-label="More ${label}">+</button></span>`;
  const SETTINGS = [
    { id: 'theme', label: 'Theme: system, dark or light', icon: 'dark_mode', ctl: () => seg('theme', [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]) },
    { id: 'lang', label: 'Language: English, Cantonese or both', icon: 'translate', ctl: () => seg('lang', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']]) },
    { id: 'school', get label() { return (P.school.name || 'School mode') + ': English only, no funny levels or dim sum'; }, icon: 'school', always: true, ctl: () => `<button class="toggle ${P.school.enabled ? 'on' : ''}" role="switch" aria-checked="${P.school.enabled}" data-act="school" aria-label="${esc(P.school.name)}"></button>` },
    { id: 'accent', label: 'Accent colour with opacity and contrast check', icon: 'palette', ctl: () => accentCtl() },
    { id: 'funnyEn', label: 'Funny level, English (styles every message; facts never change)', icon: 'sentiment_very_satisfied', ctl: () => stepper('funnyEn', 'English funny level', ' of 5', 1, 5, 1) },
    { id: 'funnyYue', label: 'Funny level, Cantonese 廣東話', icon: 'sentiment_very_satisfied', ctl: () => stepper('funnyYue', 'Cantonese funny level', ' of 5', 1, 5, 1) },
    { id: 'dim', label: 'Attention: Focus (dims every section except the one you are on)', icon: 'center_focus_weak', attn: true, ctl: () => sw('dim') },
    { id: 'low', label: 'Attention: Low stimulation (quieter colour, no extra motion)', icon: 'do_not_disturb_on', attn: true, ctl: () => sw('low') },
    { id: 'clock', label: 'Attention: Time awareness (time on this page)', icon: 'schedule', attn: true, ctl: () => sw('clock') },
    { id: 'one', label: 'Attention: One thing at a time (keep your next step in view)', icon: 'flag', attn: true, ctl: () => sw('one') },
    { id: 'momentum', label: 'Attention: Momentum (a gentle note after 10 quiet minutes)', icon: 'directions_run', attn: true, ctl: () => sw('momentum') },
    { id: 'textSize', label: 'Text size', icon: 'format_size', a11y: true, ctl: () => stepper('textSize', 'text size', '%', 80, 160, 10) },
    { id: 'contrast', label: 'High contrast', icon: 'contrast', a11y: true, ctl: () => sw('contrast') },
    { id: 'reduce', label: 'Reduce motion', icon: 'motion_photos_off', a11y: true, ctl: () => sw('reduce') },
    { id: 'focus', label: 'Always show focus', icon: 'center_focus_strong', a11y: true, ctl: () => sw('focus') },
    { id: 'targets', label: 'Larger targets', icon: 'touch_app', a11y: true, ctl: () => sw('targets') },
  ];


  // ---------- attention modes (each off by default; interface options only) ----------
  const opened = Date.now(); let lastInput = Date.now();
  ['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true }));
  const mins = ms => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  function drawAttention() {
    let bar = document.getElementById('attn'); if (!bar) { bar = document.createElement('div'); bar.id = 'attn'; bar.className = 'attn'; app.prepend(bar); }
    const parts = [];
    if (P.clock) parts.push(`<span class="badge mute mono" aria-live="off">${ic('schedule', 'sm')}On this page ${mins(Date.now() - opened)}</span>`);
    if (P.one) parts.push(P.next && !drawAttention.edit ? `<span class="next-bar">${ic('flag', 'sm fill')}<span>Next: ${esc(P.next)}</span><button class="chip" data-act="next-edit">Change</button><button class="chip" data-act="next-done">Done</button></span>` : `<span class="next-bar">${ic('flag', 'sm fill')}<label class="sr" for="na">Your next step</label><input id="na" maxlength="200" value="${esc(P.next)}" placeholder="Write the one next thing you want to do"><button class="chip" data-act="next-save">Keep in view</button></span>`);
    if (P.momentum && P.momentumUntil < Date.now() && Date.now() - lastInput > 600000) parts.push(`<span class="next-bar" role="status">${ic('schedule', 'sm')}Nothing has moved on this page for ${mins(Date.now() - lastInput)}.<button class="chip" data-act="momentum-snooze">Not now (1 hour)</button></span>`);
    bar.innerHTML = parts.join(''); bar.hidden = !parts.length;
  }
  setInterval(() => { if (!document.activeElement?.closest?.('#attn')) drawAttention(); }, 30000);

  // ---------- command palette (Ctrl+Shift+F) ----------
  let palette = null, docs = [];
  const SCHOOL_HIDDEN = ['lang', 'funnyEn', 'funnyYue'], SCHOOL_HIDDEN_DOCS = ['dim-sum-surprise', 'language-and-wording'];
  const visibleSetting = s => !(P.school.enabled && SCHOOL_HIDDEN.includes(s.id));
  function accentCtl() {
    const hex = E.accent || getComputedStyle(app).getPropertyValue('--ac').trim() || '#6ea8ff', base = (Lib.parseColor(hex) || '#6ea8ff');
    const a = Lib.rgba(base).a, bg = app.classList.contains('light') ? '#f4f6fa' : '#0b0d12', ratio = Lib.contrast(base, bg);
    return `<span class="row" style="gap: 6px; flex-wrap: wrap"><input type="color" value="${base.slice(0, 7)}" data-accent="rgb" aria-label="Accent colour"><input type="range" min="10" max="100" value="${Math.round(a * 100)}" data-accent="alpha" aria-label="Accent opacity" style="width: 90px"><span class="badge ${ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'warn' : 'err'} mono" title="Contrast against the page">${ratio} : 1</span><button class="chip" data-act="accent-reset" aria-label="Reset accent">↺</button></span>`;
  }
  async function pinHash(pin, salt) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, k, 256); return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], SITE_SCHED = ['theme', 'language', 'focus', 'calm', 'timeAware', 'accent'];
  function schoolBlock() {
    const sc = P.school, f = panel.schoolForm || {};
    return `<div class="set" style="flex-direction: column; align-items: stretch; gap: 8px"><span class="row"><span class="grow" style="font-weight: 650">${esc(sc.name)}</span><button class="toggle ${sc.enabled ? 'on' : ''}" role="switch" aria-checked="${sc.enabled}" data-act="school" aria-label="${esc(sc.name)}"></button></span>
      <span class="small">${sc.enabled ? 'On: English only; funny levels and dim sum are gone from this page. Turning it off needs your PIN.' : 'English only, no funny levels and no dim sum on this page. Turning it off needs a PIN you set now.'} A speed bump in this browser, not security: clearing this site's data resets it.</span>
      ${panel.schoolForm ? `<span class="row" style="gap: 6px; flex-wrap: wrap"><label class="sr" for="sc-pin">PIN</label><input id="sc-pin" type="password" inputmode="numeric" maxlength="12" placeholder="${sc.enabled ? 'Your PIN' : 'New PIN, 4 to 12 digits'}" style="width: 160px; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"><button class="chip" data-act="school-go">${sc.enabled ? 'Turn off' : 'Turn on'}</button></span>${f.error ? `<span class="badge err" role="alert">${esc(f.error)}</span>` : ''}` : ''}
      ${sc.enabled ? '' : `<span class="row" style="gap: 6px"><label class="sr" for="sc-name">Name for this mode</label><input id="sc-name" maxlength="40" value="${esc(sc.name)}" style="flex: 1; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"><button class="chip" data-act="school-rename">Rename</button></span>`}</div>`;
  }
  function schedBlock() {
    const F = panel.sched || (panel.sched = { key: 'theme', value: 'dark', at: '19:00', days: [0, 1, 2, 3, 4, 5, 6] }), d = Lib.SCHEDULABLE[F.key], active = Lib.scheduledValues(P.schedules, new Date());
    const val = d.values ? `<select data-sched="value" aria-label="Value">${d.values.filter(([v]) => !(P.school.enabled && F.key === 'language' && v !== 'en')).map(([v, l]) => `<option value='${esc(JSON.stringify(v))}' ${JSON.stringify(v) === JSON.stringify(F.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<input data-sched="value" value="${esc(F.value)}" placeholder="#4ade9a" aria-label="Value" style="width: 110px">`;
    return `<div class="set" style="flex-direction: column; align-items: stretch; gap: 8px"><span style="font-weight: 650">Scheduled settings</span>
      ${P.schedules.map((r, i) => `<span class="row" style="gap: 8px"><span class="grow small">${esc(Lib.SCHEDULABLE[r.key].label)} → ${esc(String((Lib.SCHEDULABLE[r.key].values || []).find(([v]) => v === r.value)?.[1] ?? r.value))} · ${r.days.length === 7 ? 'every day' : r.days.map(x => DAYS[x]).join(', ')} at ${esc(r.at)}</span><span class="badge ${JSON.stringify(active[r.key]) === JSON.stringify(r.value) ? 'ok' : 'mute'}">${JSON.stringify(active[r.key]) === JSON.stringify(r.value) ? 'Active' : 'Waiting'}</span><button class="chip" data-act="sched-del" data-i="${i}" aria-label="Remove rule">×</button></span>`).join('') || '<span class="small">No rules yet.</span>'}
      <span class="row sched" style="gap: 6px; flex-wrap: wrap"><select data-sched="key" aria-label="Setting">${SITE_SCHED.filter(k => !(P.school.enabled && k === 'language')).map(k => `<option value="${k}" ${F.key === k ? 'selected' : ''}>${esc(Lib.SCHEDULABLE[k].label)}</option>`).join('')}</select>${val}<input type="time" data-sched="at" value="${esc(F.at)}" aria-label="Time"><span class="row" style="gap: 2px">${DAYS.map((n, i) => `<button class="badge ${F.days.includes(i) ? 'ac' : 'mute'}" style="border: 0; cursor: pointer" aria-pressed="${F.days.includes(i)}" data-act="sched-day" data-d="${i}" aria-label="${n}">${n[0]}</button>`).join('')}</span><button class="chip" data-act="sched-add">Add</button></span></div>`;
  }
  function entries() {
    const sections = [...document.querySelectorAll('section[id], [data-teleport]')].map(s => ({ kind: 'Section', icon: 'near_me', label: 'Go to: ' + (s.querySelector('h1, h2, .h3')?.textContent.trim() || s.id), run: () => teleport(s) }));
    const controls = [...document.querySelectorAll('[data-teleport-el]')].filter(el => !el.closest('[hidden]')).map(el => ({ kind: 'Element', icon: 'ads_click', label: el.dataset.teleportEl, run: () => teleport(el) }));
    const sets = SETTINGS.filter(visibleSetting).map(s => ({ kind: 'Setting', icon: s.icon, label: s.label, ctl: s.ctl }));
    const articles = docs.filter(a => !(P.school.enabled && SCHOOL_HIDDEN_DOCS.includes(a.id))).map(a => ({ kind: 'Article', icon: 'menu_book', label: 'Docs: ' + a.title, run: () => openDoc(a.id) }));
    const actions = [
      { kind: 'Action', icon: 'download', label: 'Download the Windows installer', run: () => document.querySelector('[data-download]')?.click() },
      { kind: 'Action', icon: 'record_voice_over', label: 'Read this page aloud', run: readAloud },
      { kind: 'Action', icon: 'restart_alt', label: 'Reset page preferences', run: () => { P = { ...DEFAULTS }; save(); apply(); say('Preferences reset'); } },
      { kind: 'Action', icon: 'accessibility_new', label: 'Open accessibility tools', run: () => openPanel() },
    ];
    return [...sets, ...sections, ...controls, ...articles, ...actions];
  }
  function openPalette(q = '') { palette = { q, regex: false, sel: 0, opener: document.activeElement }; drawPalette(); document.getElementById('pq')?.focus(); }
  function closePalette() { const o = palette?.opener; palette = null; document.getElementById('palette')?.remove(); o?.focus?.(); }
  function drawPalette() {
    let host = document.getElementById('palette');
    if (!host) {
      host = document.createElement('div'); host.id = 'palette'; host.className = 'pal-back'; app.appendChild(host);
      host.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Search and settings">
        <div class="row" style="gap: 8px"><label class="sr" for="pq">Search the page, settings and docs</label><input id="pq" class="mono" placeholder="Search the page, settings and docs" role="combobox" aria-expanded="true" aria-controls="pl" autocomplete="off"><button class="badge mono" style="border: 0; cursor: pointer" data-act="regex"></button></div>
        <div id="pparts"></div><div id="pl" role="listbox" class="pl"></div>
        <span class="small">↑ ↓ to move · Enter to go · Esc to close · settings change live</span></div>`;
      host.querySelector('#pq').value = palette.q;
    }
    const r = Lib.search(entries(), palette.q, { regex: palette.regex });
    const list = r.ok ? r.items.slice(0, 40) : [];
    palette.sel = Math.min(palette.sel, Math.max(0, list.length - 1)); palette.list = list;
    const rb = host.querySelector('[data-act="regex"]'); rb.className = `badge ${palette.regex ? 'ac' : 'mute'} mono`; rb.setAttribute('aria-pressed', palette.regex); rb.textContent = '.* Regex';
    host.querySelector('#pparts').innerHTML = !r.ok ? `<span class="badge err" role="alert">${esc(r.error)}</span>` : palette.regex && palette.q ? `<div class="row small" style="gap: 6px; flex-wrap: wrap">${r.parts.map(p => `<span class="row" style="gap: 4px; white-space: nowrap"><span class="badge mute mono">${esc(p.token)}</span>${esc(p.meaning)}</span>`).join('')}</div>` : '';
    host.querySelector('#pl').innerHTML = list.map((e, i) => `<div id="pi${i}" role="option" aria-selected="${i === palette.sel}" class="pr ${i === palette.sel ? 'on' : ''}" data-i="${i}">${ic(e.icon, 'sm')}<span class="grow">${esc(e.label)}</span>${e.ctl ? e.ctl() : `<span class="k">${e.kind}</span>`}</div>`).join('') || '<span class="small" style="padding: 10px">Nothing matches</span>';
    host.querySelector('#pq').setAttribute('aria-activedescendant', 'pi' + palette.sel);
    document.getElementById('pi' + palette.sel)?.scrollIntoView({ block: 'nearest' });
  }
  function teleport(el) {
    closePalette();
    el.scrollIntoView({ behavior: app.classList.contains('reduce') ? 'auto' : 'smooth', block: 'center' });
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  // ---------- accessibility panel ----------
  let panel = null;
  function openPanel() { panel = { opener: document.activeElement }; drawPanel(); panel.host.querySelector('button')?.focus(); }
  function closePanel() { const o = panel?.opener; panel?.host.remove(); panel = null; o?.focus?.(); }
  function drawPanel() {
    if (!panel.host) { panel.host = document.createElement('section'); panel.host.className = 'a11y-panel'; panel.host.setAttribute('role', 'dialog'); panel.host.setAttribute('aria-label', 'Accessibility and settings'); app.appendChild(panel.host); }
    panel.host.innerHTML = `<div class="row"><span class="h2" style="flex: 1">Accessibility and settings</span><button class="btn text" data-act="panel-close" aria-label="Close">${ic('close')}</button></div>
      ${SETTINGS.filter(s => (s.a11y || s.attn || s.id === 'theme' || s.id === 'accent') && visibleSetting(s)).map(s => `<div class="set"><span class="grow">${esc(s.label)}</span>${s.ctl()}</div>`).join('')}
      ${schoolBlock()}${schedBlock()}
      <button class="btn tonal" data-act="read">${ic('record_voice_over')}Read this page aloud</button>
      <button class="btn text" data-act="reset-a11y">Reset accessibility tools</button>`;
  }
  function readAloud() {
    if (!('speechSynthesis' in window)) { say('No voice is available in this browser'); return; }
    const text = [...document.querySelectorAll('#app h1, #app h2, #app .h3, #app .sub, #app summary')].map(n => n.innerText.trim()).filter(Boolean).join('. ');
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.slice(0, 4000)); u.lang = P.lang === 'yue' ? 'zh-HK' : 'en'; speechSynthesis.speak(u);
  }

  // ---------- context menu ----------

  // The page's right-click menu is the app's own menu kit (kit.js): filter, regex, keyboard, and live
  // controls for values that change the real preference and keep the menu open.
  Kit.bind('site-palette', 'Ctrl+Shift+F', () => {});
  function openMenu(x, y, target) {
    const sec = target.closest('section[id]'), sel = String(getSelection() || '').trim(), text = (target.closest('p, h1, h2, .h2, .h3, summary, .card, li, span') || target).innerText?.trim();
    const items = [
      sel || text ? { label: sel ? 'Copy selected text' : 'Copy this text', icon: 'content_copy', run: () => copy(sel || text) } : null,
      sec ? { label: 'Copy link to this section', icon: 'link', run: () => copy(location.origin + location.pathname + '#' + sec.id) } : null,
      { label: 'Search and settings', icon: 'search', shortcut: 'site-palette', run: () => openPalette() },
      { label: 'Accessibility and settings', icon: 'accessibility_new', run: () => openPanel() },
      { label: 'Download the installer', icon: 'download', run: () => document.querySelector('[data-download]')?.click() },
      { kind: 'choice', label: 'Theme', icon: 'dark_mode', options: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], get: () => E.theme, set: v => setPref('theme', v) },
      { kind: 'choice', label: 'Language', icon: 'translate', options: [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']], get: () => E.lang, set: v => setPref('lang', v), disabled: P.school.enabled, reason: `English only while ${P.school.name} is on` },
      { kind: 'level', label: 'Text size', icon: 'format_size', min: 80, max: 160, step: 10, format: v => v + '%', get: () => P.textSize, set: v => setPref('textSize', v) },
      { kind: 'toggle', label: 'Reduce motion', icon: 'motion_photos_off', get: () => !!P.reduce, set: v => setPref('reduce', v) },
      { kind: 'swatch', label: 'Accent colour', icon: 'palette', get: () => E.accent || getComputedStyle(app).getPropertyValue('--ac').trim(), run: () => openPanel() },
    ].filter(Boolean);
    Kit.openMenu(items, { x, y, opener: target, title: 'Page actions' });
  }
  async function copy(t) { try { await navigator.clipboard.writeText(t); say('Copied'); } catch { say('Copy was blocked by the browser'); } }
  document.addEventListener('contextmenu', e => { if (e.target.closest('input, textarea')) return; e.preventDefault(); openMenu(e.clientX, e.clientY, e.target); });

  // ---------- docs ----------
  async function loadDocs() {
    try { const r = await fetch('docs.json'); docs = (await r.json()).articles || []; } catch { docs = []; }
    drawDocs();
    const id = location.hash.startsWith('#doc:') ? location.hash.slice(5) : null; if (id) openDoc(id);
  }
  let docQ = '', docRegex = false;
  function drawDocs() {
    const box = document.getElementById('docs-list'); if (!box) return;
    if (!docs.length) { box.innerHTML = '<span class="small">The articles could not be loaded. They also ship inside the app.</span>'; return; }
    const r = Lib.search(docs.map(d => ({ ...d, label: d.title + ' ' + d.body })), docQ, { regex: docRegex });
    box.innerHTML = r.ok ? r.items.map(d => `<button class="chip" data-doc-open="${esc(d.id)}">${esc(d.title)}</button>`).join('') || '<span class="small">No article matches</span>' : `<span class="badge err">${esc(r.error)}</span>`;
    const rb = document.querySelector('[data-act="doc-regex"]'); if (rb) { rb.className = `badge ${docRegex ? 'ac' : 'mute'} mono`; rb.setAttribute('aria-pressed', docRegex); }
  }
  function openDoc(id) {
    const a = docs.find(d => d.id === id); if (!a) return;
    const box = document.getElementById('docs-reader'); box.hidden = false;
    box.innerHTML = `<div class="row"><span class="badge ac">Article</span><span class="grow" style="flex: 1"></span><button class="btn text" data-act="doc-close">${ic('close')}Close</button></div><div class="md">${Lib.markdown(a.body)}</div>`;
    teleport(box);
  }
  document.addEventListener('input', e => { if (e.target.id === 'docq') { docQ = e.target.value; drawDocs(); } });

  // ---------- direct installer download ----------
  async function loadRelease() {
    const card = document.getElementById('dl-card');
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rel = await r.json();
      const asset = (rel.assets || []).find(a => /Setup.*\.exe$/i.test(a.name));
      if (!asset || !/^https:\/\/github\.com\//.test(asset.browser_download_url)) throw new Error('no installer in the latest release');
      const code = (rel.body || '').match(/Code name:\s*([^\n·]+(?:·\s*[^\s\n(]+)?)/);
      const sha = /^sha256:[0-9a-f]{64}$/.test(asset.digest || '') ? asset.digest.slice(7) : null;
      document.querySelectorAll('[data-download]').forEach(a => { a.href = asset.browser_download_url; a.setAttribute('download', asset.name); a.title = `${asset.name}, ${(asset.size / 1048576).toFixed(0)} MB`; });
      if (card) card.innerHTML = `<span class="label" style="color: inherit">DOWNLOAD FOR WINDOWS</span><span class="h2">${esc(rel.tag_name)}${code ? ' · ' + esc(code[1].trim()) : ''}</span>
        <span class="mono small" style="color: inherit; overflow-wrap: anywhere">${esc(asset.name)} · ${(asset.size / 1048576).toFixed(1)} MB · ${new Date(rel.published_at).toLocaleDateString()}</span>
        <span class="mono small" style="color: inherit; overflow-wrap: anywhere">${sha ? `SHA-256 ${sha}` : 'SHA-256 not published by GitHub for this file'}</span>
        <a class="btn fillb" style="align-self: flex-start" href="${esc(asset.browser_download_url)}" download="${esc(asset.name)}" data-download="1">${ic('download', 'fill')}Download installer</a>
        <span class="small" style="color: inherit">Unsigned build. Windows SmartScreen may warn before it runs. The app installs for your Windows user only and updates itself in the background.</span>`;
    } catch (err) {
      if (card) card.innerHTML = `<span class="label" style="color: inherit">DOWNLOAD FOR WINDOWS</span><span class="h2">Release details are unavailable right now</span><span class="small" style="color: inherit">${esc(String(err.message || err))}. The button below opens the releases list instead of downloading directly.</span><a class="btn fillb" style="align-self: flex-start" href="https://github.com/${REPO}/releases/latest">${ic('open_in_new')}Open the latest release</a>`;
    }
  }

  // ---------- dim sum surprise (a troll switch: it cannot be turned off) ----------
  async function loadDimSum() {
    const box = document.getElementById('dimsum-dish'); if (!box || P.school.enabled) return;
    try {
      const r = await fetch('https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases/tags/catalog-v1');
      const imgs = ((await r.json()).assets || []).filter(a => /^hk-dish-\d+-[a-z0-9-]+\.png$/.test(a.name) && /^https:\/\/github\.com\//.test(a.browser_download_url));
      if (!imgs.length) throw new Error('empty');
      const a = imgs[Math.floor(Math.random() * imgs.length)];
      const name = a.name.replace(/^hk-dish-\d+-|\.png$/g, '').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      box.innerHTML = `<img src="${esc(a.browser_download_url)}" alt="${esc(name)}" loading="lazy" width="96" height="96"><span class="stack"><span class="small">Today's dim sum</span><span style="font-weight: 650">${esc(name)}</span></span>`;
    } catch { box.innerHTML = '<span class="small">The dim sum catalog is unreachable. The surprise is still on.</span>'; }
  }
  function troll(btn) {
    btn.classList.add('wiggle'); btn.setAttribute('aria-checked', 'true');
    const msg = Lib.t('dim_sum_troll', P.lang);
    const note = document.getElementById('troll-note'); note.textContent = msg; say(msg);
    setTimeout(() => btn.classList.remove('wiggle'), 600);
  }

  // ---------- events ----------
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); palette ? closePalette() : openPalette(); return; }
    if (e.key === 'F10' && e.shiftKey) { e.preventDefault(); const t = document.activeElement || document.body, r = t.getBoundingClientRect(); openMenu(r.left + 12, r.bottom + 4, t); return; }
    if (Kit.menuOpen()) return;
    if (palette) {
      if (e.key === 'Escape') { e.preventDefault(); if (palette.q) { palette.q = ''; document.getElementById('pq').value = ''; drawPalette(); } else closePalette(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palette.sel = Math.max(0, Math.min(palette.list.length - 1, palette.sel + (e.key === 'ArrowDown' ? 1 : -1))); drawPalette(); }
      if (e.key === 'Enter' && e.target.id === 'pq') { e.preventDefault(); const it = palette.list[palette.sel]; if (it?.run) it.run(); else if (it?.ctl) document.querySelector(`#pi${palette.sel} button`)?.focus(); }
      if (e.key === 'Tab') { const f = [...document.querySelectorAll('#palette input, #palette button')]; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
      return;
    }
    if (panel && e.key === 'Escape') { e.preventDefault(); closePanel(); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.sched && panel?.sched) { const F = panel.sched; if (el.dataset.sched === 'key') { F.key = el.value; const d = Lib.SCHEDULABLE[F.key]; F.value = d.values ? d.values[0][0] : ''; drawPanel(); } else if (el.dataset.sched === 'value') F.value = el.tagName === 'SELECT' ? JSON.parse(el.value) : el.value; else F.at = el.value; }
    if (el.dataset.accent) { const box = el.closest('.row'), rgb = box.querySelector('[data-accent="rgb"]').value, a = +box.querySelector('[data-accent="alpha"]').value / 100; setPref('accent', a >= 1 ? rgb : rgb + Math.round(a * 255).toString(16).padStart(2, '0')); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'pq') { palette.q = e.target.value; palette.sel = 0; drawPalette(); } });
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a, [data-i]'); if (!t) { if (e.target.id === 'palette') closePalette(); return; }
    if (t.dataset.pref) return setPref(t.dataset.pref, isNaN(+t.dataset.v) ? t.dataset.v : +t.dataset.v);
    if (t.dataset.setLang) return setPref('lang', t.dataset.setLang);
    if (t.dataset.flip) return setPref(t.dataset.flip, !P[t.dataset.flip]);
    if (t.dataset.step) { const k = t.dataset.step; return setPref(k, Math.max(+t.dataset.lo, Math.min(+t.dataset.hi, P[k] + +t.dataset.d))); }
    if (t.dataset.docOpen || t.dataset.doc) { e.preventDefault(); return openDoc(t.dataset.docOpen || t.dataset.doc); }
    if (t.dataset.i !== undefined && palette && !e.target.closest('button')) { const it = palette.list[+t.dataset.i]; if (it?.run) it.run(); return; }
    switch (t.dataset.act) {
      case 'palette': return openPalette();
      case 'regex': palette.regex = !palette.regex; drawPalette(); return document.getElementById('pq').focus();
      case 'a11y': return panel ? closePanel() : openPanel();
      case 'panel-close': return closePanel();
      case 'read': return readAloud();
      case 'reset-a11y': ['textSize', 'contrast', 'reduce', 'focus', 'targets'].forEach(k => (P[k] = DEFAULTS[k])); save(); apply(); drawPanel(); return;
      case 'theme': return setPref('theme', { system: 'dark', dark: 'light', light: 'system' }[P.theme]);
      case 'doc-regex': docRegex = !docRegex; return drawDocs();
      case 'doc-close': document.getElementById('docs-reader').hidden = true; return;
      case 'troll': return troll(t);
      case 'school': if (!panel) openPanel(); panel.schoolForm = {}; drawPanel(); return document.getElementById('sc-pin')?.focus();
      case 'school-go': return (async () => {
        const pin = document.getElementById('sc-pin').value, sc = P.school;
        if (!/^\d{4,12}$/.test(pin)) { panel.schoolForm.error = 'A PIN is 4 to 12 digits.'; return drawPanel(); }
        if (!sc.enabled) { const salt = crypto.getRandomValues(new Uint32Array(4)).join('-'); P.school = { ...sc, enabled: true, salt, hash: await pinHash(pin, salt) }; panel.schoolForm = null; save(); apply(); drawPanel(); return say(`${sc.name} is on`); }
        if (await pinHash(pin, sc.salt) !== sc.hash) { panel.schoolForm.error = 'That PIN did not match. Forgot it? Clear this site\'s data in the browser.'; return drawPanel(); }
        P.school = { ...sc, enabled: false }; panel.schoolForm = null; save(); apply(); drawPanel(); loadDimSum(); say(`${sc.name} is off`);
      })();
      case 'school-rename': { const n = document.getElementById('sc-name').value.trim(); if (!n || n.length > 40 || /[<>]/.test(n)) return say('Use 1 to 40 characters, no angle brackets'); P.school = { ...P.school, name: n }; save(); apply(); drawPanel(); return say('Renamed to ' + n); }
      case 'accent-reset': return setPref('accent', '');
      case 'sched-day': { const F = panel.sched, d = +t.dataset.d; F.days = F.days.includes(d) ? F.days.filter(x => x !== d) : [...F.days, d].sort(); return drawPanel(); }
      case 'sched-add': { const F = panel.sched, rule = { key: F.key, value: Lib.SCHEDULABLE[F.key].colour ? Lib.parseColor(String(F.value)) : F.value, at: F.at, days: F.days }; if (!Lib.validRule(rule)) return say('Pick a value, a time and at least one day'); return setPref('schedules', [...P.schedules, rule]); }
      case 'sched-del': { const l = [...P.schedules]; l.splice(+t.dataset.i, 1); return setPref('schedules', l); }
      case 'next-save': { const v = document.getElementById('na')?.value.trim(); if (!v) return say('Write the next step first'); drawAttention.edit = false; return setPref('next', v.slice(0, 200)); }
      case 'next-edit': drawAttention.edit = true; drawAttention(); return document.getElementById('na')?.focus();
      case 'next-done': drawAttention.edit = false; return setPref('next', '');
      case 'momentum-snooze': return setPref('momentumUntil', Date.now() + 3600000);
    }
  });

  apply(); loadDocs(); loadRelease(); loadDimSum();
  window.__site = { openPalette, openPanel, openDoc, troll: () => troll(document.querySelector('[data-act="troll"]')) };
})();
