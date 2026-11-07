'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { summarize, writeReport } = require('../../scripts/sweep/report');

test('sweep summary counts findings per rule, worst impact first, and clean surfaces', () => {
  const surfaces = [
    { surface: 'a', findings: [{ rule: 'axe:region', impact: 'moderate', target: 'x' }, { rule: 'clipped-text', impact: 'serious', target: 'y' }] },
    { surface: 'b', findings: [{ rule: 'axe:region', impact: 'moderate', target: 'x' }] },
    { surface: 'c', findings: [] },
  ];
  const s = summarize(surfaces);
  assert.equal(s.total, 3);
  assert.equal(s.surfaces, 3);
  assert.equal(s.clean, 1);
  assert.deepEqual(s.rules.map(r => r.rule), ['clipped-text', 'axe:region'], 'serious before moderate');
  assert.equal(s.rules[1].count, 2);
  assert.equal(s.rules[1].surfaces, 2);
  assert.equal(s.rules[1].examples.length, 1, 'one example per distinct target');
});

test('sweep report writes JSON and Markdown and says when there is nothing to fix', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  const sum = writeReport(dir, 'app', [{ surface: 'deploys · phone · light · en', findings: [] }]);
  assert.equal(sum.total, 0);
  assert.match(fs.readFileSync(path.join(dir, 'sweep-app.md'), 'utf8'), /No findings\./);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'sweep-app.json'), 'utf8')).summary.clean, 1);
});
