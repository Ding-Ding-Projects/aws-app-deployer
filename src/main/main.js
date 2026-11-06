'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, autoUpdater, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createBackend, createRunner, createDeployer } = require('../backend');
const { createInstaller } = require('./installer');
const { createStore } = require('./store');
const { createBridge } = require('./bridge');
const { createUpdater, handleSquirrelEvent } = require('./updater');
const { createLocks } = require('./locks');
const { createSchool } = require('./school');
const { createMedia } = require('./media');

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
  const routes = ['setup', 'deploys', 'accounts', 'wizard', 'settings', 'help', 'palette', 'a11y', 'info', 'menu', 'confirm', 'history', 'docs', 'changelog', 'tabs', 'export', 'lockwiz', 'unlock', 'support', 'appearance', 'tools', 'party', 'school', 'colour', 'schedules'];
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
  handle('restore', i => bridge.restore(i));
  // Screenshot runs on Linux CI have no keyring; allow the test-only plain store there and nowhere else.
  if (screenshotDir && process.platform === 'linux') safeStorage.setUsePlainTextEncryption?.(true);
  const locks = createLocks({ dir: app.getPath('userData'), safeStorage, catalog: async () => { try { return (await (await fetch('https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json', { signal: AbortSignal.timeout(6000) })).json()).dishes || []; } catch { return []; } } });
  handle('lock-status', () => locks.status());
  // Shared School mode record for every app from this publisher on this Windows user.
  const school = createSchool({ dir: path.join(app.getPath('appData'), 'Ding-Ding-Projects Shared') });
  handle('school-state', () => school.state());
  handle('school-rename', n => school.rename(n));
  handle('school-enable', c => school.enable(c));
  handle('school-disable', v => school.disable(v));
  handle('school-credential', (o, c) => school.changeCredential(o, c));
  // External settings source (for example a Home Assistant entity). The token is kept encrypted
  // with the operating system's protected storage, never in settings, history or exports.
  const tokenFile = path.join(app.getPath('userData'), 'external-source.token');
  handle('external-token', t => {
    if (t === null) { try { fs.unlinkSync(tokenFile); } catch { } return { ok: true, hasToken: false }; }
    if (typeof t !== 'string' || t.length > 4096 || !safeStorage.isEncryptionAvailable()) return { ok: false, error: safeStorage.isEncryptionAvailable() ? 'INVALID_INPUT' : 'VAULT_UNAVAILABLE' };
    fs.writeFileSync(tokenFile, safeStorage.encryptString(t)); return { ok: true, hasToken: true };
  });
  handle('external-fetch', async url => {
    let u; try { u = new URL(url); } catch { return { ok: false, error: 'URL_INVALID' }; }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return { ok: false, error: 'URL_INVALID' };
    const headers = { Accept: 'application/json' };
    try { if (fs.existsSync(tokenFile)) headers.Authorization = 'Bearer ' + safeStorage.decryptString(fs.readFileSync(tokenFile)); } catch { return { ok: false, error: 'TOKEN_UNREADABLE' }; }
    try {
      const r = await fetch(u, { headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!r.ok) return { ok: false, error: 'HTTP_' + r.status };
      const text = await r.text(); if (text.length > 65536) return { ok: false, error: 'TOO_LARGE' };
      return { ok: true, text, hasToken: !!headers.Authorization };
    } catch (e) { return { ok: false, error: e.name === 'TimeoutError' ? 'TIMEOUT' : 'UNREACHABLE' }; }
  });
  handle('lock-totp', async label => { const t = locks.newTotp(label); return { ...t, qr: await require('qrcode').toString(t.uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) }; });
  handle('lock-create', (id, opts) => locks.create(id, opts));
  handle('lock-verify', (id, creds) => locks.verify(id, creds));
  handle('lock-remove', (id, creds) => locks.remove(id, creds));
  handle('ladder-start', (id, rung) => locks.ladderStart(id, rung, { school: store.get().school }));
  handle('ladder-answer', (nonce, answer) => locks.ladderAnswer(nonce, answer));
  handle('appdata', () => ({ ok: true, path: app.getPath('userData') }));
  handle('open-appdata', async () => { const err = await shell.openPath(app.getPath('userData')); return err ? { ok: false, error: 'FILE_MANAGER_FAILED', detail: err, path: app.getPath('userData') } : { ok: true, path: app.getPath('userData') }; });
  handle('label', (i, t) => bridge.label(i, t));
  handle('docs', () => bridge.docs());
  handle('changelog', () => bridge.changelog());
  handle('save-file', async (name, data) => {
    if (typeof name !== 'string' || !/^[\w.-]{1,80}$/.test(name) || !(typeof data === 'string' || data instanceof Uint8Array)) return { ok: false, error: 'INVALID_INPUT' };
    const r = await dialog.showSaveDialog(win, { defaultPath: name });
    if (r.canceled) return { ok: false, error: 'CANCELLED' };
    fs.writeFileSync(r.filePath, data); return { ok: true, path: r.filePath };
  });
  // Hand a file to an external editor. The file is written to a private hand-off folder first;
  // VS Code is used only when its link handler is registered on this computer.
  const handoffDir = path.join(app.getPath('userData'), 'handoff');
  handle('editors', () => ({ ok: true, vscode: !!app.getApplicationNameForProtocol('vscode://') }));
  handle('open-in-editor', async (name, data, editor) => {
    if (typeof name !== 'string' || !/^[\w.-]{1,80}$/.test(name) || /^\.+$/.test(name) || typeof data !== 'string' || data.length > 25 * 1024 * 1024 || !['vscode', 'default'].includes(editor)) return { ok: false, error: 'INVALID_INPUT' };
    fs.mkdirSync(handoffDir, { recursive: true });
    const file = path.join(handoffDir, name); fs.writeFileSync(file, data);
    if (editor === 'vscode') {
      if (!app.getApplicationNameForProtocol('vscode://')) return { ok: false, error: 'VSCODE_NOT_FOUND', path: file };
      await shell.openExternal('vscode://file/' + encodeURI(file.replace(/\\/g, '/'))); return { ok: true, path: file };
    }
    const err = await shell.openPath(file); return err ? { ok: false, error: 'NO_DEFAULT_EDITOR', detail: err, path: file } : { ok: true, path: file };
  });
  // Video, audio and archive conversions. Inputs are chosen in a system dialog here, never typed.
  let bundled7za = null; try { bundled7za = require('7zip-bin').path7za.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); } catch { }
  const media = createMedia({ sevenZipBundled: bundled7za });
  handle('media-status', () => media.status());
  handle('media-pick', async kind => {
    const filters = { media: [{ name: 'Video and audio', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'wma'] }], archive: [{ name: 'Archives', extensions: ['7z', 'zip', 'rar', 'tar', 'gz', 'tgz', 'xz', 'bz2'] }], any: [] }[kind];
    if (!filters) return { ok: false, error: 'INVALID_INPUT' };
    const r = await dialog.showOpenDialog(win, { properties: kind === 'any' ? ['openFile', 'multiSelections'] : ['openFile'], filters });
    return r.canceled || !r.filePaths.length ? { ok: false, error: 'CANCELLED' } : { ok: true, paths: r.filePaths };
  });
  handle('media-convert', (input, preset) => bridge.start('convert', null, ({ signal, progress }) => media.convertMedia(input, preset, { signal, onProgress: progress })));
  handle('archive-create', files => bridge.start('archive', null, ({ signal, progress }) => media.archive(files, { signal, onProgress: progress })));
  handle('archive-extract', file => bridge.start('extract', null, ({ signal, progress }) => media.extract(file, { signal, onProgress: progress })));
  handle('yaml-to-json', text => media.yamlToJson(text));
  handle('show-file', p => { if (typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p)) { shell.showItemInFolder(p); return { ok: true }; } return { ok: false, error: 'INVALID_INPUT' }; });
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
