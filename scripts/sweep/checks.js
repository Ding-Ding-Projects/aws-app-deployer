/* In-page checks for the every-surface sweep. Loaded into the app window and into the landing page after
   axe-core. Each function returns plain data so a driver can collect it.
   - window.__sweepCheck(): axe-core WCAG 2.2 AA and best-practice violations, clipped text, text pushed off
     screen, and overlapping text.
   - window.__sweepFocus(): what the keyboard focus is on right now, and whether that is a problem. */
(() => {
  'use strict';
  const vis = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || +cs.opacity === 0) return false;
      if (n.hidden || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert')) return false;
      // The body of a closed <details> is not drawn, whatever its box says.
      if (n.parentElement?.tagName === 'DETAILS' && !n.parentElement.open && n.tagName !== 'SUMMARY') return false;
    }
    return true;
  };
  // The part of an element that can actually be seen: its box cut by every ancestor that clips (scroll areas,
  // collapsed accordions), up to the nearest fixed layer.
  const seen = el => {
    const r = el.getBoundingClientRect(); const b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const p = n.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { b.l = Math.max(b.l, p.left); b.r = Math.min(b.r, p.right); }
        if (cs.overflowY !== 'visible') { b.t = Math.max(b.t, p.top); b.b = Math.min(b.b, p.bottom); }
      }
      if (cs.position === 'fixed') break;
    }
    return b;
  };
  const shown = el => { const b = seen(el); return b.r - b.l >= 1 && b.b - b.t >= 1; };
  const srOnly = el => { const cs = getComputedStyle(el); return el.classList.contains('sr') || (cs.position === 'absolute' && (cs.clip === 'rect(0px, 0px, 0px, 0px)' || (parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1))); };
  const describe = el => {
    if (!el || el.nodeType !== 1) return String(el);
    const id = el.id ? '#' + el.id : '', cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`;
  };
  // Text-bearing elements: those with a non-empty direct text node.
  const textEls = () => [...document.querySelectorAll('body *')].filter(el => !['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'OPTION'].includes(el.tagName) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && vis(el) && !srOnly(el) && shown(el));
  const scrollsX = el => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth) return true; } return false; };
  // A layer is the nearest fixed or absolutely positioned ancestor; text in different layers may overlap by design.
  const layer = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'absolute' || p === 'sticky') return n; } return document.body; };

  function geometry() {
    const out = [], W = document.documentElement.clientWidth, els = textEls();
    for (const el of els) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      // Clipped text: text that does not fit its box and is cut instead of wrapping or showing an ellipsis.
      const cutX = el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis';
      const cutY = el.scrollHeight > el.clientHeight + 2 && /hidden|clip/.test(cs.overflowY) && !(cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
      if ((cutX || cutY) && el.clientWidth > 0) out.push({ rule: 'clipped-text', impact: 'serious', target: describe(el), detail: `${cutX ? 'width' : 'height'} needs ${cutX ? el.scrollWidth : el.scrollHeight}px, has ${cutX ? el.clientWidth : el.clientHeight}px` });
      // Text pushed past the window edge (and not inside something that scrolls sideways on purpose).
      if ((r.right > W + 1 || r.left < -1) && !scrollsX(el) && cs.position !== 'fixed') out.push({ rule: 'off-screen-text', impact: 'serious', target: describe(el), detail: `spans ${Math.round(r.left)} to ${Math.round(r.right)} in a ${W}px window` });
    }
    // Overlapping text within one layer: two text boxes that are not nested and share real area.
    const boxes = els.filter(el => !scrollsX(el)).map(el => { const b = seen(el); return { el, r: { left: b.l, top: b.t, right: b.r, bottom: b.b }, l: layer(el) }; });
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b]; if (A.l !== B.l || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w > 3 && h > 3) out.push({ rule: 'overlapping-text', impact: 'serious', target: `${describe(A.el)} / ${describe(B.el)}`, detail: `${Math.round(w)} x ${Math.round(h)}px overlap` });
    }
    return out;
  }

  // The sweep judges the settled screen, so entrance animations and transitions finish at once.
  window.__sweepStill = () => { if (document.getElementById('sweep-still')) return; const st = document.createElement('style'); st.id = 'sweep-still'; st.textContent = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }'; document.head.appendChild(st); };
  window.__sweepCheck = async () => {
    window.__sweepStill(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const findings = [];
    if (window.axe) {
      const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] });
      for (const v of res.violations) for (const n of v.nodes) findings.push({ rule: 'axe:' + v.id, impact: v.impact || n.impact || 'moderate', target: n.target.join(' '), detail: (n.failureSummary || v.help).replace(/\s+/g, ' ').slice(0, 300) });
    } else findings.push({ rule: 'sweep:no-axe', impact: 'critical', target: 'document', detail: 'axe-core did not load' });
    return findings.concat(geometry());
  };

  const nameOf = el => {
    const by = el.getAttribute('aria-labelledby');
    const t = el.getAttribute('aria-label') || (by && by.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')) || [...(el.labels || [])].map(l => l.textContent).join(' ') || el.getAttribute('title') || el.getAttribute('alt') || (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ? '' : el.textContent) || el.getAttribute('placeholder') || '';
    return t.trim().replace(/\s+/g, ' ');
  };
  window.__sweepFocus = () => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { at: 'body' };
    const cs = getComputedStyle(el), issues = [];
    if (!vis(el)) issues.push({ rule: 'focus-on-hidden', impact: 'serious' });
    if (!nameOf(el)) issues.push({ rule: 'focus-unnamed', impact: 'serious' });
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    if (!ring) issues.push({ rule: 'focus-no-ring', impact: 'serious' });
    const modal = [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].filter(d => vis(d) && (d.getAttribute('aria-modal') === 'true' || d.matches(':modal'))).pop();
    if (modal && !modal.contains(el)) issues.push({ rule: 'focus-escaped-modal', impact: 'critical' });
    return { at: describe(el), issues };
  };
})();
