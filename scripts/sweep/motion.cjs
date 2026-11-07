#!/usr/bin/env node
/* Motion check for the desktop app. Entrance animations (fade, rise, dialog and panel entrances) must play
   when something appears and must not play again when a key press re-renders the screen. The every-surface
   sweep cannot see this, because it settles animations before it measures.

   Launches the app from source with a throwaway profile through Playwright's Electron support, then presses
   keys in the command palette, the settings search and a settings panel. An animation that restarted within
   the last 50 ms of a key press counts as a replay. As a control, opening the palette must play its entrance.
   Exits with code 2 when anything replays or the control fails. Needs Playwright (`npm i -g playwright`). */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aad-motion-'));
  const app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..', '..'), '--no-sandbox', '--user-data-dir=' + profile] });
  const w = await app.firstWindow();
  await w.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 60000 });
  const fresh = () => w.evaluate(() => document.getAnimations()
    .filter(a => a.animationName && a.currentTime != null && a.currentTime < 50 && a.effect?.getTiming().iterations !== Infinity)
    .map(a => `${a.animationName} on ${a.effect.target.className || a.effect.target.tagName}`));
  const problems = [];
  async function press(label, act) {
    await w.waitForTimeout(1500);
    await act();
    const replayed = [...new Set(await fresh())];
    if (replayed.length) problems.push(`${label}: ${replayed.join(', ')}`);
  }

  await w.keyboard.press('Control+Shift+F');
  await press('arrow key in the command palette', () => w.keyboard.press('ArrowDown'));
  await press('typing in the command palette', () => w.keyboard.type('s'));
  await w.keyboard.press('Escape');
  await w.waitForTimeout(500);
  await w.keyboard.press('Control+Shift+F');
  const opened = await fresh();
  if (!opened.some(n => /^(dialogIn|fade) /.test(n))) problems.push('control: opening the command palette did not play its entrance');
  await w.keyboard.press('Escape');

  await w.evaluate(() => window.__go('settings'));
  await press('typing in the settings search', async () => { await w.focus('#sq'); await w.keyboard.type('a'); });
  await w.fill('#sq', '');
  await w.evaluate(() => window.__go('lockwiz'));
  await press('typing a PIN in a panel', async () => { const pin = await w.$('.panel input'); if (pin) { await pin.focus(); await w.keyboard.type('1'); } });

  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
  if (problems.length) {
    console.log('Motion check: ' + problems.length + ' problem(s)\n- ' + problems.join('\n- '));
    process.exit(2);
  }
  console.log('Motion check: entrances play on open and never replay on a key press.');
})().catch(error => { console.error(error.message); process.exit(1); });
