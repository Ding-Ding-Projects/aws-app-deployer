// Landing page features: command palette, language, funny level, accessibility tools,
// context menu, offline docs, direct installer download and the dim sum surprise.
// Uses the same lib.js as the app. Preferences stay in this browser only.
(() => {
  'use strict';
  const Lib = window.Lib;
  const app = document.getElementById('app');
  const REPO = 'Ding-Ding-Projects/aws-app-deployer';
  const KEY = 'aws-app-deployer.site/1';
  const DEFAULTS = { theme: 'system', lang: 'en', funny: 3, textSize: 100, contrast: false, reduce: false, focus: false, targets: false };
  let P = { ...DEFAULTS };
  try { P = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage blocked: defaults only */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* not saved, still applied */ } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, cls = '') => `<i class="ms ${cls}" aria-hidden="true">${n}</i>`;
  const live = document.getElementById('live');
  const say = t => { live.textContent = ''; setTimeout(() => (live.textContent = t), 30); };

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
    document.documentElement.lang = P.lang === 'yue' ? 'zh-HK' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
      const en = originals.get(el), zh = YUE[el.dataset.i18n];
      el.innerHTML = !zh || P.lang === 'en' ? en : P.lang === 'yue' ? zh : `${en}<span class="both-yue" lang="zh-HK">${zh}</span>`;
    });
    const f = document.querySelector('[data-funny]');
    if (f) { const [en, zh] = FUNNY[P.funny - 1]; f.textContent = P.lang === 'yue' ? zh : P.lang === 'both' ? `${en} ${zh}` : en; }
    document.querySelectorAll('[data-set-lang]').forEach(b => { b.classList.toggle('on', b.dataset.setLang === P.lang); b.setAttribute('aria-pressed', b.dataset.setLang === P.lang); });
  }

  // ---------- appearance and accessibility ----------
  function apply() {
    const dark = P.theme === 'dark' || (P.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
    const reduce = P.reduce || matchMedia('(prefers-reduced-motion: reduce)').matches;
    app.classList.toggle('light', !dark); app.classList.toggle('contrast', P.contrast); app.classList.toggle('reduce', reduce);
    app.classList.toggle('focusring', P.focus); app.classList.toggle('bigtargets', P.targets);
    document.body.style.background = dark ? '#0b0d12' : '#f4f6fa';
    document.documentElement.style.fontSize = P.textSize + '%';
    app.style.zoom = P.textSize / 100;
    const t = document.querySelector('[data-act="theme"]'); if (t) { t.innerHTML = ic(dark ? 'dark_mode' : 'light_mode', 'sm'); t.setAttribute('aria-label', `Theme: ${P.theme}. Activate to change.`); }
    applyLanguage();
  }
  function setPref(k, v) { P[k] = v; save(); apply(); if (palette) drawPalette(); if (panel) drawPanel(); }
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);

  // Settings shared by the palette and the accessibility panel, each with a live control.
  const seg = (k, opts) => `<span class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${P[k] === v}" class="${P[k] === v ? 'on' : ''}" data-pref="${k}" data-v="${v}">${l}</button>`).join('')}</span>`;
  const sw = k => `<button class="toggle ${P[k] ? 'on' : ''}" role="switch" aria-checked="${P[k]}" data-flip="${k}" aria-label="${k}"></button>`;
  const stepper = (k, label, unit, lo, hi, step) => `<span class="row" style="gap: 6px"><span class="badge ac mono">${P[k]}${unit}</span><button class="chip" data-step="${k}" data-d="${-step}" data-lo="${lo}" data-hi="${hi}" aria-label="Less ${label}">−</button><button class="chip" data-step="${k}" data-d="${step}" data-lo="${lo}" data-hi="${hi}" aria-label="More ${label}">+</button></span>`;
  const SETTINGS = [
    { id: 'theme', label: 'Theme: system, dark or light', icon: 'dark_mode', ctl: () => seg('theme', [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]) },
    { id: 'lang', label: 'Language: English, Cantonese or both', icon: 'translate', ctl: () => seg('lang', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']]) },
    { id: 'funny', label: 'Funny level', icon: 'sentiment_very_satisfied', ctl: () => stepper('funny', 'funny', ' of 5', 1, 5, 1) },
    { id: 'textSize', label: 'Text size', icon: 'format_size', a11y: true, ctl: () => stepper('textSize', 'text size', '%', 80, 160, 10) },
    { id: 'contrast', label: 'High contrast', icon: 'contrast', a11y: true, ctl: () => sw('contrast') },
    { id: 'reduce', label: 'Reduce motion', icon: 'motion_photos_off', a11y: true, ctl: () => sw('reduce') },
    { id: 'focus', label: 'Always show focus', icon: 'center_focus_strong', a11y: true, ctl: () => sw('focus') },
    { id: 'targets', label: 'Larger targets', icon: 'touch_app', a11y: true, ctl: () => sw('targets') },
  ];

  // ---------- command palette (Ctrl+Shift+F) ----------
  let palette = null, docs = [];
  function entries() {
    const sections = [...document.querySelectorAll('section[id], [data-teleport]')].map(s => ({ kind: 'Section', icon: 'near_me', label: 'Go to: ' + (s.querySelector('h1, h2, .h3')?.textContent.trim() || s.id), run: () => teleport(s) }));
    const controls = [...document.querySelectorAll('[data-teleport-el]')].map(el => ({ kind: 'Element', icon: 'ads_click', label: el.dataset.teleportEl, run: () => teleport(el) }));
    const sets = SETTINGS.map(s => ({ kind: 'Setting', icon: s.icon, label: s.label, ctl: s.ctl }));
    const articles = docs.map(a => ({ kind: 'Article', icon: 'menu_book', label: 'Docs: ' + a.title, run: () => openDoc(a.id) }));
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
    if (!panel.host) { panel.host = document.createElement('section'); panel.host.className = 'a11y-panel'; panel.host.setAttribute('role', 'dialog'); panel.host.setAttribute('aria-label', 'Accessibility tools'); app.appendChild(panel.host); }
    panel.host.innerHTML = `<div class="row"><span class="h2" style="flex: 1">Accessibility tools</span><button class="btn text" data-act="panel-close" aria-label="Close">${ic('close')}</button></div>
      ${SETTINGS.filter(s => s.a11y || s.id === 'theme').map(s => `<div class="set"><span class="grow">${esc(s.label)}</span>${s.ctl()}</div>`).join('')}
      <button class="btn tonal" data-act="read">${ic('record_voice_over')}Read this page aloud</button>
      <button class="btn text" data-act="reset-a11y">Reset accessibility tools</button>`;
  }
  function readAloud() {
    if (!('speechSynthesis' in window)) { say('No voice is available in this browser'); return; }
    const text = [...document.querySelectorAll('#app h1, #app h2, #app .h3, #app .sub, #app summary')].map(n => n.innerText.trim()).filter(Boolean).join('. ');
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.slice(0, 4000)); u.lang = P.lang === 'yue' ? 'zh-HK' : 'en'; speechSynthesis.speak(u);
  }

  // ---------- context menu ----------
  let menu = null;
  function openMenu(x, y, target) {
    closeMenu();
    const sec = target.closest('section[id]'), sel = String(getSelection() || '').trim(), text = (target.closest('p, h1, h2, .h2, .h3, summary, .card, li, span') || target).innerText?.trim();
    const items = [
      sel || text ? { label: sel ? 'Copy selected text' : 'Copy this text', icon: 'content_copy', run: () => copy(sel || text) } : null,
      sec ? { label: 'Copy link to this section', icon: 'link', run: () => copy(location.origin + location.pathname + '#' + sec.id) } : null,
      { label: 'Search and settings', icon: 'search', k: 'Ctrl+Shift+F', run: () => openPalette() },
      { label: 'Accessibility tools', icon: 'accessibility_new', run: () => openPanel() },
      { label: 'Download the installer', icon: 'download', run: () => document.querySelector('[data-download]')?.click() },
    ].filter(Boolean);
    menu = { items, opener: target, host: document.createElement('div') };
    menu.host.className = 'ctx'; menu.host.setAttribute('role', 'menu');
    menu.host.innerHTML = items.map((it, i) => `<button class="mi" role="menuitem" data-mi="${i}">${ic(it.icon, 'sm')}${esc(it.label)}${it.k ? `<span class="k">${it.k}</span>` : ''}</button>`).join('');
    app.appendChild(menu.host);
    const r = menu.host.getBoundingClientRect();
    menu.host.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; menu.host.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    menu.host.querySelector('button').focus();
  }
  function closeMenu(refocus) { if (!menu) return; const o = menu.opener; menu.host.remove(); menu = null; if (refocus) o?.focus?.(); }
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
    const box = document.getElementById('dimsum-dish'); if (!box) return;
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
    if (menu) {
      const btns = [...menu.host.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
      return;
    }
    if (palette) {
      if (e.key === 'Escape') { e.preventDefault(); if (palette.q) { palette.q = ''; document.getElementById('pq').value = ''; drawPalette(); } else closePalette(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palette.sel = Math.max(0, Math.min(palette.list.length - 1, palette.sel + (e.key === 'ArrowDown' ? 1 : -1))); drawPalette(); }
      if (e.key === 'Enter' && e.target.id === 'pq') { e.preventDefault(); const it = palette.list[palette.sel]; if (it?.run) it.run(); else if (it?.ctl) document.querySelector(`#pi${palette.sel} button`)?.focus(); }
      if (e.key === 'Tab') { const f = [...document.querySelectorAll('#palette input, #palette button')]; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
      return;
    }
    if (panel && e.key === 'Escape') { e.preventDefault(); closePanel(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'pq') { palette.q = e.target.value; palette.sel = 0; drawPalette(); } });
  document.addEventListener('click', e => {
    if (menu && !e.target.closest('.ctx')) closeMenu(false);
    const t = e.target.closest('button, a, [data-i]'); if (!t) { if (e.target.id === 'palette') closePalette(); return; }
    if (t.dataset.mi !== undefined) { const it = menu.items[+t.dataset.mi]; closeMenu(false); it.run(); return; }
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
    }
  });

  apply(); loadDocs(); loadRelease(); loadDimSum();
  window.__site = { openPalette, openPanel, openDoc, troll: () => troll(document.querySelector('[data-act="troll"]')) };
})();
