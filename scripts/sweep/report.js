'use strict';
// Shared report writer for the every-surface sweep: sweep-<name>.json with every finding, and a short
// Markdown summary grouped by rule with the worst examples, so a fix can go to the root token or component.
const fs = require('node:fs');
const path = require('node:path');

const RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function summarize(surfaces) {
  const byRule = new Map();
  let total = 0;
  for (const s of surfaces) for (const f of s.findings) {
    total++;
    const r = byRule.get(f.rule) || { rule: f.rule, impact: f.impact, count: 0, surfaces: new Set(), examples: [] };
    r.count++; r.surfaces.add(s.surface);
    if (RANK[f.impact] < RANK[r.impact]) r.impact = f.impact;
    if (r.examples.length < 6 && !r.examples.some(e => e.target === f.target)) r.examples.push({ surface: s.surface, target: f.target, detail: f.detail });
    byRule.set(f.rule, r);
  }
  const rules = [...byRule.values()].sort((a, b) => RANK[a.impact] - RANK[b.impact] || b.count - a.count).map(r => ({ ...r, surfaces: r.surfaces.size }));
  return { total, surfaces: surfaces.length, clean: surfaces.filter(s => !s.findings.length).length, rules };
}

function writeReport(dir, name, surfaces) {
  fs.mkdirSync(dir, { recursive: true });
  const sum = summarize(surfaces), at = new Date().toISOString();
  fs.writeFileSync(path.join(dir, `sweep-${name}.json`), JSON.stringify({ at, summary: sum, surfaces }, null, 1));
  const md = [`# Sweep: ${name}`, '', `${at} · ${sum.surfaces} surfaces · ${sum.clean} clean · ${sum.total} findings`, ''];
  if (!sum.rules.length) md.push('No findings.');
  for (const r of sum.rules) {
    md.push(`## ${r.rule} (${r.impact}) · ${r.count} on ${r.surfaces} surfaces`, '');
    for (const e of r.examples) md.push(`- ${e.surface}: \`${String(e.target).replace(/`/g, "'")}\` ${e.detail ? '· ' + String(e.detail).replace(/\s+/g, ' ').slice(0, 220) : ''}`);
    md.push('');
  }
  fs.writeFileSync(path.join(dir, `sweep-${name}.md`), md.join('\n'));
  return sum;
}

module.exports = { summarize, writeReport };
