'use strict';
// Every-surface sweep for the desktop app. Run with: electron . --sweep=<folder>
// Opens every capture route at phone, tablet, 960 x 540 (a 1080p screen at 200 percent) and desktop sizes, in
// both themes and all three language modes. On each surface it records axe-core WCAG 2.2 AA and best-practice
// violations, console errors, clipped, off-screen and overlapping text, and (in English) a keyboard walk that
// flags focus on hidden or unnamed controls, focus without a visible ring, and focus escaping a modal dialog.
// SWEEP_ROUTES=a,b limits the routes; SWEEP_SIZES=phone,desktop limits the sizes; SWEEP_SHOTS=1 saves captures.
const fs = require('node:fs');
const path = require('node:path');
const { writeReport } = require('./report');

const SIZES = [['phone', 390, 844], ['tablet', 820, 1180], ['laptop-200', 960, 540], ['desktop', 1440, 900]];
const THEMES = ['light', 'dark'];
const LANGS = ['en', 'yue', 'both'];
const sleep = ms => new Promise(res => setTimeout(res, ms));

async function walk(wc) {
  const out = [], seen = new Map();
  await wc.executeJavaScript('document.activeElement?.blur?.(); 0');
  let first = null;
  for (let k = 0; k < 80; k++) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await sleep(30);
    const f = await wc.executeJavaScript('window.__sweepFocus()');
    if (f.at === 'body') continue;
    if (f.at === first) break;
    if (!first) first = f.at;
    for (const i of f.issues || []) {
      const key = i.rule + '|' + f.at; if (seen.has(key)) continue; seen.set(key, true);
      out.push({ rule: 'keyboard:' + i.rule, impact: i.impact, target: f.at, detail: `reached after ${k + 1} Tab presses` });
    }
  }
  return out;
}

module.exports = async function runSweep(win, dir, routes) {
  const wc = win.webContents, surfaces = [];
  let errors = [];
  wc.on('console-message', (e, level, message) => {
    const lv = typeof e?.level === 'string' ? e.level : level, msg = e?.message ?? message;
    if (lv === 'error' || lv === 3) errors.push(String(msg).slice(0, 300));
  });
  wc.on('did-fail-load', (_e, code, desc, url) => errors.push(`load failed ${code} ${desc} ${url}`));
  for (let i = 0; i < 90 && !(await wc.executeJavaScript('!!(window.__ready && window.__ready())')); i++) await sleep(1000);
  await wc.executeJavaScript(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') + '\n;0');
  await wc.executeJavaScript(fs.readFileSync(path.join(__dirname, 'checks.js'), 'utf8') + '\n;0');
  const only = process.env.SWEEP_ROUTES ? process.env.SWEEP_ROUTES.split(',') : routes;
  const sizes = process.env.SWEEP_SIZES ? SIZES.filter(s => process.env.SWEEP_SIZES.split(',').includes(s[0])) : SIZES;
  const langs = process.env.SWEEP_LANGS ? process.env.SWEEP_LANGS.split(',') : LANGS;
  for (const [size, w, h] of sizes) {
    win.setContentSize(w, h); await sleep(300);
    for (const theme of THEMES) for (const lang of langs) {
      await wc.executeJavaScript(`window.__sweepPrep(${JSON.stringify({ theme, language: lang })})`);
      for (const route of only) {
        errors = [];
        await wc.executeJavaScript(`window.__go && window.__go(${JSON.stringify(route)})`);
        await sleep(450);
        const findings = await wc.executeJavaScript('window.__sweepCheck()');
        if (lang === langs[0]) findings.push(...await walk(wc));
        for (const m of errors) findings.push({ rule: 'console-error', impact: 'serious', target: 'console', detail: m });
        surfaces.push({ surface: `${route} · ${size} · ${theme} · ${lang}`, route, size, theme, lang, findings });
        if (process.env.SWEEP_SHOTS && lang === langs[0]) fs.writeFileSync(path.join(dir, `${route}-${size}-${theme}.png`), (await wc.capturePage()).toPNG());
      }
    }
  }
  return writeReport(dir, 'app', surfaces);
};
