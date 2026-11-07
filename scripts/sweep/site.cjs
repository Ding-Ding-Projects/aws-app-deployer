'use strict';
// Every-surface sweep for the landing page. Serve site/ first (for example: python3 -m http.server 8765 -d site),
// then run: node scripts/sweep/site.cjs <out-folder> [http://127.0.0.1:8765/]
// Needs Playwright with Chromium (npm i -D playwright, or a machine that already has it).
// Opens the page and each overlay (command palette, accessibility panel, right-click menu, Sections menu on
// narrow screens, the docs reader) at phone, tablet, 960 x 540 and desktop sizes, in both themes and all three
// language modes, and records the same findings as the app sweep, plus blocked or failed requests.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { writeReport } = require('./report');

const SIZES = [['phone', 390, 844], ['tablet', 820, 1180], ['laptop-200', 960, 540], ['desktop', 1440, 900]];
const THEMES = ['light', 'dark'], LANGS = ['en', 'yue', 'both'];
const out = path.resolve(process.argv[2] || 'sweep-out'), url = process.argv[3] || 'http://127.0.0.1:8765/';
// Sample answers for the page's GitHub lookups (shape only; the values are made up).
const SAMPLE_RELEASE = { tag_name: 'v0.0.0', published_at: '2026-01-01T00:00:00Z', body: 'Code name: Har Gow · 蝦餃', assets: [{ name: 'AWS-App-Deployer-Setup-0.0.0.exe', size: 150000000, digest: 'sha256:' + '0'.repeat(64), browser_download_url: 'https://github.com/Ding-Ding-Projects/aws-app-deployer/releases/download/v0.0.0/AWS-App-Deployer-Setup-0.0.0.exe' }] };
const SAMPLE_CATALOG = { assets: [{ name: 'hk-dish-001-har-gow.png', browser_download_url: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-001-har-gow.png' }] };
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const SURFACES = {
  page: async () => {},
  palette: async p => { await p.click('[data-act="palette"]'); },
  a11y: async p => { await p.click('[data-act="a11y"]'); },
  menu: async (p, w) => { await p.mouse.click(Math.min(500, w / 2), 300, { button: 'right' }); },
  sections: async p => { const b = await p.$('[data-act="sections"]'); if (!b || !(await b.isVisible())) return 'skip'; await b.click(); },
  docs: async p => { const b = await p.$('[data-doc-open], [data-doc]'); if (!b) return 'skip'; await b.scrollIntoViewIfNeeded(); await b.click(); },
};

async function walk(p) {
  const found = [], seen = new Set(); let first = null;
  await p.evaluate(() => document.activeElement?.blur?.());
  for (let k = 0; k < 120; k++) {
    await p.keyboard.press('Tab');
    const f = await p.evaluate(() => window.__sweepFocus());
    if (f.at === 'body') continue;
    if (f.at === first) break;
    if (!first) first = f.at;
    for (const i of f.issues || []) { const key = i.rule + '|' + f.at; if (seen.has(key)) continue; seen.add(key); found.push({ rule: 'keyboard:' + i.rule, impact: i.impact, target: f.at, detail: `reached after ${k + 1} Tab presses` }); }
  }
  return found;
}

(async () => {
  const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'), checks = fs.readFileSync(path.join(__dirname, 'checks.js'), 'utf8');
  const only = process.env.SWEEP_SURFACES ? process.env.SWEEP_SURFACES.split(',') : Object.keys(SURFACES);
  const sizes = process.env.SWEEP_SIZES ? SIZES.filter(s => process.env.SWEEP_SIZES.split(',').includes(s[0])) : SIZES;
  const browser = await chromium.launch(), surfaces = [];
  const langs = process.env.SWEEP_LANGS ? process.env.SWEEP_LANGS.split(',') : LANGS;
  for (const [size, w, h] of sizes) for (const theme of THEMES) for (const lang of langs) for (const name of only) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: 'reduce' });
    const problems = [];
    p.on('console', m => { if (m.type() === 'error') problems.push({ rule: 'console-error', impact: 'serious', target: 'console', detail: m.text().slice(0, 300) }); });
    p.on('pageerror', e => problems.push({ rule: 'page-error', impact: 'critical', target: 'page', detail: String(e.message).slice(0, 300) }));
    p.on('requestfailed', r => problems.push({ rule: 'blocked-content', impact: 'serious', target: r.url().slice(0, 160), detail: r.failure()?.errorText || 'failed' }));
    // The page's two GitHub lookups are answered from fixed sample data, so the sweep never depends on rate limits.
    await p.route('https://api.github.com/**', r => r.fulfill({ json: /dim-sum-photos/.test(r.request().url()) ? SAMPLE_CATALOG : SAMPLE_RELEASE }));
    await p.route('https://github.com/**', r => r.fulfill({ contentType: 'image/png', body: PIXEL }));
    await p.goto(url, { waitUntil: 'networkidle' }).catch(() => p.goto(url));
    await p.evaluate(l => document.querySelector(`[data-set-lang="${l}"]`)?.click(), lang);
    await p.waitForTimeout(250);
    const skipped = await SURFACES[name](p, w).catch(e => problems.push({ rule: 'sweep:surface-failed', impact: 'serious', target: name, detail: String(e.message).slice(0, 200) }));
    if (skipped === 'skip') { await p.close(); continue; }
    await p.waitForTimeout(300);
    await p.addScriptTag({ content: axe }); await p.addScriptTag({ content: checks });
    const findings = await p.evaluate(() => window.__sweepCheck());
    if (lang === langs[0]) findings.push(...await walk(p));
    surfaces.push({ surface: `${name} · ${size} · ${theme} · ${lang}`, route: name, size, theme, lang, findings: findings.concat(problems) });
    if (process.env.SWEEP_SHOTS && lang === 'en') await p.screenshot({ path: path.join(out, `site-${name}-${size}-${theme}.png`) });
    await p.close();
  }
  await browser.close();
  const sum = writeReport(out, 'site', surfaces);
  console.log(`sweep: ${sum.surfaces} surfaces, ${sum.clean} clean, ${sum.total} findings`);
  process.exit(sum.total ? 2 : 0);
})().catch(e => { console.error(e); process.exit(1); });
