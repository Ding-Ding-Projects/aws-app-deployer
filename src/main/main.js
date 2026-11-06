'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, autoUpdater } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createBackend, createRunner, createDeployer } = require('../backend');
const { createInstaller } = require('./installer');
const { createStore } = require('./store');
const { createBridge } = require('./bridge');
const { createUpdater, handleSquirrelEvent } = require('./updater');

const squirrelEvent = handleSquirrelEvent(app);
function provenance() {
  try { const p = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build-info.json'), 'utf8')); return { ok: true, ...p, version: app.getVersion() }; }
  catch { return { ok: false, version: app.getVersion(), reason: 'NO_BUILD_STAMP' }; }
}
const isSquirrel = process.platform === 'win32' && app.isPackaged && fs.existsSync(path.resolve(path.dirname(process.execPath), '..', 'Update.exe'));

const screenshotDir = (process.argv.find(a => a.startsWith('--screenshots=')) || '').split('=')[1];
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 560, frame: false, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0d12' : '#f4f6fa',
    title: 'AWS App Deployer',
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('maximize', () => win.webContents.send('window', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('window', { maximized: false }));
  if (screenshotDir) {
    win.webContents.on('console-message', (_e, level, message) => console.log('[renderer]', message));
    win.webContents.once('did-finish-load', () => captureScreenshots(screenshotDir).catch(err => { console.error(err); app.exit(1); }));
  }
}

async function captureScreenshots(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const routes = ['setup', 'deploys', 'accounts', 'wizard', 'settings', 'help', 'palette', 'a11y', 'info', 'menu', 'confirm'];
  for (let i = 0; i < 90 && !(await win.webContents.executeJavaScript('!!(window.__ready && window.__ready())')); i++) await new Promise(res => setTimeout(res, 1000));
  for (const [w, tag] of [[1320, 'desktop'], [420, 'narrow']]) {
    win.setSize(w, 860);
    for (const r of routes) {
      await win.webContents.executeJavaScript(`window.__go && window.__go(${JSON.stringify(r)})`);
      await new Promise(res => setTimeout(res, 1800));
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(dir, `${r}-${tag}.png`), image.toPNG());
    }
  }
  app.quit();
}

if (!squirrelEvent) app.whenReady().then(() => {
  const run = createRunner();
  const backend = createBackend({ run });
  const store = createStore(app.getPath('userData'));
  store.bumpLaunch();
  const bridge = createBridge({
    cacheDir: app.getPath('userData'), backend, store, deployer: createDeployer({ run, backend }), installer: createInstaller({ run }),
    emit: event => win && !win.isDestroyed() && win.webContents.send('op-event', event),
  });
  const handle = (name, fn) => ipcMain.handle(name, (event, ...args) => {
    if (!win || event.sender !== win.webContents) return { ok: false, error: 'FORBIDDEN' };
    return fn(...args);
  });
  handle('prerequisites', () => bridge.prerequisites());
  handle('profiles', () => bridge.profiles());
  handle('identity', s => bridge.identity(s));
  handle('login', async s => {
    const r = bridge.login(s);
    return r;
  });
  handle('install', tools => bridge.install(tools));
  handle('inspect-source', file => bridge.inspectSource(file));
  handle('deploy', input => bridge.deploy(input));
  handle('cancel', id => bridge.cancel(id));
  handle('settings', () => bridge.settings());
  handle('set-setting', (k, v) => bridge.setSetting(k, v));
  handle('reset-setting', k => bridge.resetSetting(k));
  handle('history', () => bridge.history());
  handle('remove-deployments', ats => bridge.removeDeployments(ats));
  handle('dim-sum', () => bridge.dimSum());
  handle('version', () => app.getVersion());
  handle('provenance', () => provenance());
  const updater = createUpdater({ app, autoUpdater, isSquirrel, send: s => win && !win.isDestroyed() && win.webContents.send('update', s) });
  handle('update-state', () => updater.state());
  handle('update-check', () => updater.check());
  handle('update-install', () => updater.install());
  updater.start();
  handle('pick-source', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a Dockerfile or Compose file', properties: ['openFile'], filters: [{ name: 'Dockerfile or Compose', extensions: ['yaml', 'yml', 'dockerfile', '*'] }] });
    return r.canceled ? { ok: false, error: 'CANCELLED' } : { ok: true, path: r.filePaths[0] };
  });
  handle('export-history', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Export history', defaultPath: 'aws-app-deployer-history.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return { ok: false, error: 'CANCELLED' };
    fs.writeFileSync(r.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), ...bridge.history() }, null, 2));
    return { ok: true };
  });
  handle('open-external', url => (bridge.canOpen(url) ? shell.openExternal(url).then(() => ({ ok: true })) : { ok: false, error: 'BLOCKED_URL' }));
  handle('window', action => {
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
    else if (action === 'close') win.close();
    else if (action === 'focus') { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    return { ok: true, maximized: win.isMaximized() };
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
