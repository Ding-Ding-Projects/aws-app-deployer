// Picks the next unused dim sum code name for a release, from the public catalog, using only
// dishes whose photo is published as a catalog-v1* release asset. Never blocks a release: on
// any failure it writes {"available": false, "reason": "..."} and exits 0.
//   GH_TOKEN=... node scripts/code-name.mjs <owner/repo> <out.json>
import fs from 'node:fs';

const [repo, out] = process.argv.slice(2);
const CATALOG = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
const PHOTOS = 'https://api.github.com/repos/Ding-Ding-Projects/dim-sum-photos/releases?per_page=100';
const headers = { Accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) };
const write = v => { fs.writeFileSync(out, JSON.stringify(v, null, 2)); console.log(JSON.stringify(v)); };

async function pages(url) {
  const all = [];
  for (let next = url, n = 0; next && n < 20; n++) {
    const r = await fetch(next, { headers });
    if (!r.ok) throw new Error(`${r.status} ${next}`);
    all.push(...(await r.json()));
    next = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get('link') || '')?.[1];
  }
  return all;
}

try {
  const catalog = await (await fetch(CATALOG)).json();
  const published = new Map();
  for (const rel of await pages(PHOTOS)) {
    if (!/^catalog-v1/.test(rel.tag_name)) continue;
    for (const a of rel.assets || []) if (/\.png$/.test(a.name)) published.set(a.name, a.browser_download_url);
  }
  const used = new Set();
  for (const rel of await pages(`https://api.github.com/repos/${repo}/releases?per_page=100`)) {
    const m = /Code name: (.+?) · /.exec(rel.body || '');
    if (m) used.add(m[1].trim());
  }
  const dish = (catalog.dishes || []).find(d => d?.name?.en && d?.name?.zhHant && published.has(String(d.image?.path || '').split('/').pop()) && !used.has(d.name.en));
  if (!dish) write({ available: false, reason: published.size ? 'every published dish is already used' : 'no published catalog-v1 photos found' });
  else write({ available: true, id: dish.id, en: dish.name.en, zh: dish.name.zhHant, photo: published.get(dish.image.path.split('/').pop()), alt: dish.image.alt?.en || dish.name.en });
} catch (error) {
  write({ available: false, reason: String(error.message || error) });
}
