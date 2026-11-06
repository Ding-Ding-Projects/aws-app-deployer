'use strict';
// Chrome-style updates for the installed Squirrel.Windows build. The feed is the unsigned
// GitHub release (RELEASES plus .nupkg); Squirrel checks the package hashes listed in RELEASES.
const path = require('node:path');
const { spawn } = require('node:child_process');

const FEED = 'https://github.com/Ding-Ding-Projects/aws-app-deployer/releases/latest/download';
const INTERVAL = 4 * 60 * 60 * 1000;

// Squirrel install/update/uninstall hooks: create or remove shortcuts, then quit.
function handleSquirrelEvent(app) {
  if (process.platform !== 'win32') return false;
  const cmd = process.argv[1];
  if (!cmd || !cmd.startsWith('--squirrel-')) return false;
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const exe = path.basename(process.execPath);
  const run = args => { try { spawn(updateExe, args, { detached: true }).on('close', () => app.quit()); } catch { app.quit(); } };
  if (cmd === '--squirrel-install' || cmd === '--squirrel-updated') { run(['--createShortcut', exe]); return true; }
  if (cmd === '--squirrel-uninstall') { run(['--removeShortcut', exe]); return true; }
  if (cmd === '--squirrel-obsolete') { app.quit(); return true; }
  return false;
}

function createUpdater({ app, autoUpdater, send, isSquirrel }) {
  let state = { status: isSquirrel ? 'idle' : 'not-installed', version: app.getVersion(), next: null, error: null, checkedAt: null };
  const set = patch => { state = { ...state, ...patch }; send(state); };
  if (isSquirrel) {
    autoUpdater.setFeedURL({ url: FEED });
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
    autoUpdater.on('update-not-available', () => set({ status: 'up-to-date', checkedAt: new Date().toISOString() }));
    autoUpdater.on('update-available', () => set({ status: 'downloading', checkedAt: new Date().toISOString() }));
    autoUpdater.on('update-downloaded', (_e, notes, name) => set({ status: 'ready', next: String(name || '').replace(/^v/, '') || 'new version' }));
    autoUpdater.on('error', err => set({ status: 'failed', error: String(err?.message || err).slice(0, 300) }));
  }
  function check() { if (!isSquirrel) return state; if (['checking', 'downloading'].includes(state.status)) return state; try { autoUpdater.checkForUpdates(); } catch (e) { set({ status: 'failed', error: String(e.message) }); } return state; }
  function start() { if (!isSquirrel) return; setTimeout(check, 15000); setInterval(check, INTERVAL).unref?.(); }
  function install() { if (state.status !== 'ready') return { ok: false, error: 'NOT_READY' }; autoUpdater.quitAndInstall(); return { ok: true }; }
  return { check, start, install, state: () => state };
}

module.exports = { createUpdater, handleSquirrelEvent, FEED };
