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
  let menu = null;
  function openMenu(items, { x, y, opener, title }) {
    closeMenu(false);
    const host = document.createElement('div');
    host.className = 'ctx ' + themeOf(); host.setAttribute('role', 'menu'); host.setAttribute('aria-label', title || 'Actions');
    document.body.appendChild(host);
    menu = { host, items, opener, q: '', regex: false, sel: 0 };
    draw(); place(host, x, y);
    host.querySelector('input')?.focus();
  }
  function visible() {
    const r = Lib.search(menu.items.map(i => ({ ...i, label: i.label })), menu.q, { regex: menu.regex });
    return { ok: r.ok, list: r.ok ? r.items : [], parts: r.parts || [], error: r.error };
  }
  function draw() {
    const v = visible(), hiddenDestructive = menu.items.filter(i => i.danger && !v.list.includes(i) && menu.q);
    menu.sel = Math.min(menu.sel, Math.max(0, v.list.length - 1));
    menu.host.innerHTML = `<div class="row ctx-f"><label class="sr" for="ctxq">Filter actions</label>${ic('filter_list', 'sm')}<input id="ctxq" class="mono" autocomplete="off" placeholder="Filter" value="${esc(menu.q)}"><button class="badge ${menu.regex ? 'ac' : 'mute'} mono" data-ctx="regex" aria-pressed="${menu.regex}" title="Regex">.*</button></div>
      ${menu.regex && menu.q ? `<div class="row small ctx-x">${v.ok ? v.parts.map(p => `<span class="row" style="gap: 4px; white-space: nowrap"><span class="badge mute mono">${esc(p.token)}</span>${esc(p.meaning)}</span>`).join('') : `<span class="badge err">${esc(v.error)}</span>`}</div>` : ''}
      <div class="divider"></div>
      ${v.list.map((i, n) => `<button class="mi ${n === menu.sel ? 'on' : ''} ${i.danger ? 'danger' : ''}" role="menuitem" data-ctx-i="${menu.items.indexOf(i)}" ${i.disabled ? 'disabled' : ''}>${ic(i.icon || 'chevron_right', 'sm')}<span>${esc(i.label)}</span>${i.shortcut ? `<span class="k" aria-keyshortcuts="${esc(keysFor(i.shortcut))}">${esc(keysFor(i.shortcut))}</span>` : ''}</button>`).join('') || '<span class="small" style="padding: 8px 10px">No matching actions</span>'}
      ${menu.q ? `<span class="small" style="padding: 6px 10px" aria-live="polite">${v.list.length} of ${menu.items.length} match${hiddenDestructive.length ? ' · hidden items keep their shortcuts' : ''}</span>` : ''}`;
  }
  function place(el, x, y) {
    const r = el.getBoundingClientRect(), w = innerWidth, h = innerHeight;
    el.style.left = Math.max(8, Math.min(x, w - r.width - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(y, h - r.height - 8)) + 'px';
    el.style.maxHeight = (h - 16) + 'px';
  }
  function run(i) { const item = menu.items[i]; const opener = menu.opener; closeMenu(true); item?.run?.(opener); }
  function closeMenu(returnFocus = true) {
    if (!menu) return;
    const { host, opener } = menu; host.remove(); menu = null;
    if (returnFocus && opener?.isConnected) opener.focus?.();
  }
  document.addEventListener('click', e => {
    if (!menu) return;
    const b = e.target.closest('[data-ctx-i]'); if (b && menu.host.contains(b)) return run(+b.dataset.ctxI);
    if (e.target.closest('[data-ctx="regex"]')) { menu.regex = !menu.regex; draw(); menu.host.querySelector('input').focus(); return; }
    if (!menu.host.contains(e.target)) closeMenu(false);
  }, true);
  document.addEventListener('input', e => { if (menu && e.target.id === 'ctxq') { menu.q = e.target.value; menu.sel = 0; const pos = e.target.selectionStart; draw(); const i = menu.host.querySelector('input'); i.focus(); i.setSelectionRange(pos, pos); } });
  document.addEventListener('keydown', e => {
    if (!menu) return;
    const v = visible().list;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (menu.q) { menu.q = ''; draw(); menu.host.querySelector('input').focus(); } else closeMenu(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); menu.sel = (menu.sel + (e.key === 'ArrowDown' ? 1 : v.length - 1)) % Math.max(1, v.length); draw(); menu.host.querySelector('input').focus(); return; }
    if (e.key === 'Enter') { e.preventDefault(); const it = v[menu.sel]; if (it && !it.disabled) run(menu.items.indexOf(it)); }
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
    if (!sc || e.target.id !== 'scs') return;
    sc.value = +e.target.value; e.target.style.setProperty('--v', sc.value + '%');
    if (sc.value >= 100 && !sc.done) { sc.done = true; const fn = sc.onConfirm; drawConfirm(); sc.host.classList.add('sc-done'); setTimeout(() => closeConfirm(true), 700); await fn(); }
  });

  // ---- Anchored panels: drag by header, resize from edges, persisted per surface ----
  function panelStyle(id, saved, anchor) {
    const p = saved?.[id];
    if (p) return `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px`;
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
  document.addEventListener('pointermove', e => { if (!drag) return; drag.el.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - drag.dx)) + 'px'; drag.el.style.top = Math.max(38, Math.min(innerHeight - 40, e.clientY - drag.dy)) + 'px'; drag.el.style.right = 'auto'; });
  document.addEventListener('pointerup', () => {
    if (drag) { savePanel(drag.el); drag = null; }
    if (sizing) { const r = sizing.el.getBoundingClientRect(); if (Math.abs(r.width - sizing.w) > 2 || Math.abs(r.height - sizing.h) > 2) savePanel(sizing.el); sizing = null; }
  });
  let saver = () => {};
  function savePanel(el) { const r = el.getBoundingClientRect(); saver(el.dataset.panel, { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); }
  function watchPanels(_root, onSave) { saver = onSave; }
  function nudgePanel(e) {
    const el = e.target.closest?.('[data-panel]'); if (!el || !e.altKey || !e.key.startsWith('Arrow')) return false;
    e.preventDefault(); const r = el.getBoundingClientRect(), step = 16;
    if (e.shiftKey) { el.style.width = r.width + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0) + 'px'; el.style.height = r.height + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) + 'px'; }
    else { el.style.left = r.left + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0) + 'px'; el.style.top = r.top + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) + 'px'; el.style.right = 'auto'; }
    savePanel(el); return true;
  }

  return { bind, keysFor, dispatch, openMenu, closeMenu, menuOpen: () => !!menu, superConfirm, confirmOpen: () => !!sc, panelStyle, watchPanels, nudgePanel };
})();
