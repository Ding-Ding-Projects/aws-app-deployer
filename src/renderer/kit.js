/* global Lib */
// Interaction kit: shortcut registry, context menus with filter and regex, two-key super
// confirmation, and anchored panels that can be dragged, resized and reset.
'use strict';
window.Kit = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, c = '') => `<i class="ms ${c}" aria-hidden="true">${n}</i>`;

  // Floating layers live outside the app root, so they carry its theme classes.
  const themeOf = () => (document.getElementById('app')?.className || 'app');

  // ---- Shortcuts: one source for the binding and the label shown in menus ----
  const shortcuts = new Map();
  const norm = e => [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join('+');
  function bind(id, keys, run, when = () => true) { shortcuts.set(id, { keys, run, when }); }
  const keysFor = id => shortcuts.get(id)?.keys || '';
  function dispatch(e) {
    const combo = norm(e);
    for (const s of shortcuts.values()) if (s.keys === combo && s.when(e)) { e.preventDefault(); s.run(e); return true; }
    return false;
  }

  // ---- Context menu ----
  // A filterable menu is a combobox: focus stays in the filter, which drives a listbox of options through
  // aria-activedescendant. A value (switch, choice, stepper or swatch) is drawn inside its option as a picture
  // of the control, never as a nested control: the keyboard changes it through the option and the pointer
  // through the picture. Each change goes through the item's own set(), and the menu stays open.
  let menu = null, menus = 0;
  function openMenu(items, { x, y, opener, title }) {
    closeMenu(false);
    const host = document.createElement('div');
    host.className = 'ctx ' + themeOf(); host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', title || 'Actions');
    document.body.appendChild(host);
    menu = { host, items, opener, title: title || 'Actions', id: ++menus, q: '', regex: false, sel: 0 };
    draw(); place(host, x, y);
    host.querySelector('input')?.focus();
  }
  function visible() {
    const r = Lib.search(menu.items, menu.q, { regex: menu.regex });
    return { ok: r.ok, list: r.ok ? r.items : [], parts: r.parts || [], error: r.error };
  }
  const optId = n => `ctx-o-${menu.id}-${n}`;
  function draw() {
    const v = visible(), hiddenDestructive = menu.items.filter(i => i.danger && !v.list.includes(i) && menu.q);
    menu.sel = Math.min(menu.sel, Math.max(0, v.list.length - 1));
    const list = `ctx-l-${menu.id}`, hint = `ctx-h-${menu.id}`, active = v.list.length ? optId(menu.sel) : `ctx-o-${menu.id}-none`;
    menu.host.innerHTML = `<div class="row ctx-f"><label class="sr" for="ctxq">Filter actions</label>${ic('filter_list', 'sm')}<input id="ctxq" class="mono" role="combobox" aria-expanded="true" aria-controls="${list}" aria-autocomplete="list" aria-activedescendant="${active}" aria-describedby="${hint}" autocomplete="off" spellcheck="false" placeholder="Filter" value="${esc(menu.q)}"><button class="badge ${menu.regex ? 'ac' : 'mute'} mono" data-ctx="regex" aria-pressed="${menu.regex}" aria-label="Regular expression filter" title="Regex">.*</button></div>
      ${menu.regex && menu.q ? `<div class="row small ctx-x">${v.ok ? v.parts.map(p => `<span class="row" style="gap: 4px; white-space: nowrap"><span class="badge mute mono">${esc(p.token)}</span>${esc(p.meaning)}</span>`).join('') : `<span class="badge err">${esc(v.error)}</span>`}</div>` : ''}
      <div class="divider"></div>
      <div class="ctx-list" id="${list}" role="listbox" aria-label="${esc(menu.title)}">${v.list.map(option).join('') || `<div class="mi dis" role="option" id="${active}" aria-selected="true" aria-disabled="true"><span class="lbl">No matching actions</span></div>`}</div>
      <span class="sr" id="${hint}">Up and Down choose. Enter runs an action or flips a switch. Left and Right change a value. Escape clears the filter, then closes.</span>
      ${menu.q ? `<span class="small" style="padding: 6px 10px" aria-live="polite">${v.list.length} of ${menu.items.length} match${hiddenDestructive.length ? ' · hidden items keep their shortcuts' : ''}</span>` : ''}`;
    menu.host.querySelector('#' + active)?.scrollIntoView?.({ block: 'nearest' });
  }
  function option(i, n) {
    const idx = menu.items.indexOf(i), on = n === menu.sel, why = i.disabled && i.reason ? `<span class="why">${esc(i.reason)}</span>` : '';
    const base = (name = '') => `class="mi ${i.kind ? 'mi-ctl' : ''} ${on ? 'on' : ''} ${i.danger ? 'danger' : ''} ${i.disabled ? 'dis' : ''}" role="option" id="${optId(n)}" aria-selected="${on}" data-n="${n}" data-ctx-i="${idx}"${i.disabled ? ' aria-disabled="true"' : ''}${name ? ` aria-label="${esc(name)}${i.disabled && i.reason ? '. ' + esc(i.reason) : ''}"` : ''}`;
    const lbl = extra => `${ic(i.icon || (i.kind ? 'tune' : 'chevron_right'), 'sm')}<span class="lbl">${esc(i.label)}${extra || ''}${why}</span>`;
    if (!i.kind) { const k = i.shortcut ? keysFor(i.shortcut) : ''; return `<div ${base()}${k ? ` aria-keyshortcuts="${esc(k)}"` : ''}>${lbl()}${k ? `<span class="k" aria-hidden="true">${esc(k)}</span>` : ''}</div>`; }
    if (i.kind === 'toggle') { const v = !!i.get(); return `<div ${base()} aria-checked="${v}">${lbl()}<span class="toggle sm ${v ? 'on' : ''}" aria-hidden="true" data-ctl="toggle"></span></div>`; }
    if (i.kind === 'choice') { const v = i.get(), cur = (i.options.find(o => o[0] === v) || [])[1] ?? ''; return `<div ${base(`${i.label}: ${cur}`)}>${lbl()}<span class="seg sm" aria-hidden="true">${i.options.map(([ov, ol]) => `<span class="opt ${ov === v ? 'on' : ''}" data-ctl="choice" data-v="${esc(JSON.stringify(ov))}">${esc(ol)}</span>`).join('')}</span></div>`; }
    if (i.kind === 'level') { const v = i.get(), f = i.format ? i.format(v) : String(v); return `<div ${base(`${i.label}: ${f}`)}>${lbl()}<span class="stepper" aria-hidden="true"><span class="sb ${v <= i.min ? 'off' : ''}" data-ctl="dec">−</span><span class="v">${esc(f)}</span><span class="sb ${v >= i.max ? 'off' : ''}" data-ctl="inc">+</span></span></div>`; }
    if (i.kind === 'swatch') { const c = i.get(); return `<div ${base(`${i.label}: ${c}`)}>${lbl(`<span class="why mono">${esc(c)}</span>`)}<span class="swatch" aria-hidden="true" style="background: ${esc(c)}"></span></div>`; }
    return '';
  }
  const refocus = () => menu?.host.querySelector('input')?.focus();
  async function change(i, value) {
    if (!i || i.disabled) return;
    await i.set(value);
    if (!menu) return;
    draw(); refocus();
  }
  function step(i, dir) {
    if (i.kind === 'choice') { const vals = i.options.map(o => o[0]), at = vals.indexOf(i.get()); return change(i, vals[Math.max(0, Math.min(vals.length - 1, at + dir))]); }
    if (i.kind === 'level') return change(i, Math.max(i.min, Math.min(i.max, i.get() + dir * (i.step || 1))));
  }
  // Enter on an option: run an action, flip a switch, open a swatch's picker. Choices and levels use Left and Right.
  function activate(i) {
    if (!i || i.disabled) return;
    if (i.kind === 'toggle') return change(i, !i.get());
    if (!i.kind || (i.kind === 'swatch' && i.run)) return run(menu.items.indexOf(i));
  }
  // Text size zooms the page, so positions in screen pixels are divided by the zoom before they are written.
  const zoomOf = () => { if (typeof getComputedStyle !== 'function') return 1; const z = parseFloat(getComputedStyle(document.body).zoom); return z > 0 ? z : 1; };
  function place(el, x, y) {
    const w = innerWidth, h = innerHeight, z = zoomOf();
    el.style.maxHeight = (h - 16) / z + 'px';
    // Layout size, not the on-screen box: the entrance animation starts scaled down, which made menus land partly off-screen.
    const r = el.getBoundingClientRect(), mw = (el.offsetWidth || r.width) * z, mh = (el.offsetHeight || r.height) * z;
    el.style.left = Math.max(8, Math.min(x, w - mw - 8)) / z + 'px';
    el.style.top = Math.max(8, Math.min(y, h - mh - 8)) / z + 'px';
  }
  function run(i) { const item = menu.items[i]; const opener = menu.opener; closeMenu(true); item?.run?.(opener); }
  function closeMenu(returnFocus = true) {
    if (!menu) return;
    const { host, opener } = menu; host.remove(); menu = null;
    if (returnFocus && opener?.isConnected) opener.focus?.();
  }
  document.addEventListener('click', e => {
    if (!menu) return;
    const c = e.target.closest('[data-ctl]');
    if (c?.dataset?.ctl && menu.host.contains(c)) {
      e.preventDefault(); const row = c.closest('[data-ctx-i]'), i = menu.items[+row?.dataset?.ctxI]; if (!i) return;
      menu.sel = visible().list.indexOf(i);
      if (c.dataset.ctl === 'toggle') return change(i, !i.get());
      if (c.dataset.ctl === 'choice') return change(i, JSON.parse(c.dataset.v));
      return step(i, c.dataset.ctl === 'inc' ? 1 : -1);
    }
    const b = e.target.closest('[data-ctx-i]');
    if (b && menu.host.contains(b)) { const i = menu.items[+b.dataset.ctxI]; menu.sel = visible().list.indexOf(i); if (i?.kind === 'choice' || i?.kind === 'level') { draw(); refocus(); return; } return activate(i); }
    if (e.target.closest('[data-ctx="regex"]')) { menu.regex = !menu.regex; draw(); refocus(); return; }
    if (!menu.host.contains(e.target)) closeMenu(false);
  }, true);
  document.addEventListener('input', e => { if (menu && e.target.id === 'ctxq') { menu.q = e.target.value; menu.sel = 0; const pos = e.target.selectionStart; draw(); const i = menu.host.querySelector('input'); i.focus(); i.setSelectionRange(pos, pos); } });
  document.addEventListener('keydown', e => {
    if (!menu) return;
    const v = visible().list, it = v[menu.sel], typing = menu.q.length > 0;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (menu.q) { menu.q = ''; draw(); refocus(); } else closeMenu(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (v.length) menu.sel = (menu.sel + (e.key === 'ArrowDown' ? 1 : v.length - 1)) % v.length; draw(); refocus(); return; }
    if ((e.key === 'Home' || e.key === 'End') && !typing) { e.preventDefault(); menu.sel = e.key === 'Home' ? 0 : Math.max(0, v.length - 1); draw(); refocus(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (it?.kind === 'choice' || it?.kind === 'level')) { e.preventDefault(); step(it, e.key === 'ArrowRight' ? 1 : -1); return; }
    // Focus never leaves the menu by Tab: it moves between the filter and the regex switch.
    if (e.key === 'Tab') { e.preventDefault(); (e.target.id === 'ctxq' ? menu.host.querySelector('[data-ctx="regex"]') : menu.host.querySelector('input'))?.focus(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (e.target.closest?.('[data-ctx="regex"]')) { menu.regex = !menu.regex; draw(); refocus(); return; } activate(it); return; }
    if (e.key === ' ' && !typing && e.target.id === 'ctxq') { e.preventDefault(); activate(it); return; }
  }, true);

  // ---- Super confirmation: two independent keys, then a full-range slider ----
  let sc = null;
  function superConfirm({ title, detail, confirmLabel = 'Confirm', opener, onConfirm }) {
    closeConfirm(false);
    const host = document.createElement('div');
    host.className = 'sc ' + themeOf(); host.setAttribute('role', 'alertdialog'); host.setAttribute('aria-modal', 'false'); host.setAttribute('aria-label', title);
    document.body.appendChild(host);
    sc = { host, opener, keys: [false, false], value: 0, onConfirm, title, detail, confirmLabel, done: false };
    drawConfirm();
    const r = opener?.getBoundingClientRect?.();
    place(host, r ? r.left : innerWidth / 2 - 200, r ? r.bottom + 8 : innerHeight / 3);
    host.querySelector('[data-sc="exit"]').focus();
  }
  function drawConfirm() {
    const both = sc.keys[0] && sc.keys[1];
    sc.host.innerHTML = `<div class="row"><span class="tile err">${ic('delete_forever', 'fill')}</span><span class="stack grow"><span class="h2">${esc(sc.title)}</span><span class="small">${esc(sc.detail)}</span></span></div>
      <div class="row" style="gap: 12px"><button class="key ${sc.keys[0] ? 'on' : ''}" data-sc="k0" aria-pressed="${sc.keys[0]}" aria-label="First key, or press R">${sc.keys[0] ? ic('key', 'fill') : 'R'}</button><button class="key ${sc.keys[1] ? 'on' : ''}" data-sc="k1" aria-pressed="${sc.keys[1]}" aria-label="Second key, or press M">${sc.keys[1] ? ic('key', 'fill') : 'M'}</button><span class="small grow">${both ? 'Now slide all the way to confirm.' : 'Turn both keys: click each, or press R and M.'}</span></div>
      <label class="sr" for="scs">Slide to ${esc(sc.confirmLabel)}</label><input id="scs" class="slide-in" type="range" min="0" max="100" value="${sc.value}" ${both && !sc.done ? '' : 'disabled'} style="--v: ${sc.value}%">
      <div class="row"><button class="btn out" data-sc="exit">${ic('logout')}Emergency exit</button><span class="small grow" style="text-align: right">${sc.done ? 'Done' : 'Escape also cancels. Nothing happens until both keys and the slider are complete.'}</span></div>`;
  }
  function closeConfirm(returnFocus = true) { if (!sc) return; const o = sc.opener; sc.host.remove(); sc = null; if (returnFocus && o?.isConnected) o.focus?.(); }
  document.addEventListener('click', e => {
    if (!sc || !sc.host.contains(e.target)) return;
    const t = e.target.closest('[data-sc]'); if (!t) return;
    if (t.dataset.sc === 'exit') return closeConfirm(true);
    const k = t.dataset.sc === 'k0' ? 0 : 1; sc.keys[k] = true; drawConfirm(); sc.host.querySelector(`[data-sc="k${1 - k}"]`)?.focus();
  });
  document.addEventListener('keydown', e => {
    if (!sc) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeConfirm(true); return; }
    if (document.activeElement?.id === 'scs') return;
    const k = { r: 0, m: 1 }[e.key.toLowerCase()];
    if (k !== undefined && !e.ctrlKey && !e.altKey) { e.preventDefault(); sc.keys[k] = true; drawConfirm(); if (sc.keys[0] && sc.keys[1]) sc.host.querySelector('#scs').focus(); }
  }, true);
  document.addEventListener('input', async e => {
    if (!sc || e.target.id !== 'scs' || !sc.host.contains(e.target)) return;
    sc.value = +e.target.value; e.target.style.setProperty('--v', sc.value + '%');
    if (sc.keys[0] && sc.keys[1] && sc.value >= 100 && !sc.done) { sc.done = true; const fn = sc.onConfirm; drawConfirm(); sc.host.classList.add('sc-done'); setTimeout(() => closeConfirm(true), 700); await fn(); }
  });

  // ---- Anchored panels: drag by header, resize from edges, persisted per surface ----
  function panelStyle(id, saved, anchor) {
    const p = saved?.[id];
    // A saved spot can sit off-screen after the window shrinks, so keep at least the panel's corner reachable.
    if (p) return `left:clamp(8px, ${p.x}px, calc(100vw / var(--zoom, 1) - ${Math.min(p.w, 260)}px - 8px));top:clamp(46px, ${p.y}px, calc(100vh / var(--zoom, 1) - 120px));width:${p.w}px;height:${p.h}px`;
    return anchor || '';
  }
  let drag = null, sizing = null;
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest?.('[data-panel]'); if (!el) return;
    const r = el.getBoundingClientRect();
    const head = e.target.closest('[data-drag]');
    if (head && !e.target.closest('button,input,select,label')) { drag = { el, dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); }
    else sizing = { el, w: r.width, h: r.height };
  });
  document.addEventListener('pointermove', e => { if (!drag) return; const z = zoomOf(); drag.el.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - drag.dx)) / z + 'px'; drag.el.style.top = Math.max(38, Math.min(innerHeight - 40, e.clientY - drag.dy)) / z + 'px'; drag.el.style.right = 'auto'; });
  document.addEventListener('pointerup', () => {
    if (drag) { savePanel(drag.el); drag = null; }
    if (sizing) { const r = sizing.el.getBoundingClientRect(); if (Math.abs(r.width - sizing.w) > 2 || Math.abs(r.height - sizing.h) > 2) savePanel(sizing.el); sizing = null; }
  });
  let saver = () => {};
  function savePanel(el) { const r = el.getBoundingClientRect(), z = zoomOf(); saver(el.dataset.panel, { x: Math.round(r.left / z), y: Math.round(r.top / z), w: Math.round(r.width / z), h: Math.round(r.height / z) }); }
  function watchPanels(_root, onSave) { saver = onSave; }
  function nudgePanel(e) {
    const el = e.target.closest?.('[data-panel]'); if (!el || !e.altKey || !e.key.startsWith('Arrow')) return false;
    e.preventDefault(); const r = el.getBoundingClientRect(), step = 16;
    const z = zoomOf();
    if (e.shiftKey) { el.style.width = (r.width + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)) / z + 'px'; el.style.height = (r.height + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)) / z + 'px'; }
    else { el.style.left = (r.left + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)) / z + 'px'; el.style.top = (r.top + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)) / z + 'px'; el.style.right = 'auto'; }
    savePanel(el); return true;
  }

  return { bind, keysFor, dispatch, openMenu, closeMenu, menuOpen: () => !!menu, superConfirm, confirmOpen: () => !!sc, panelStyle, watchPanels, nudgePanel };
})();
