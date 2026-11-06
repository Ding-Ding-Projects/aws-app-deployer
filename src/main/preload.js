'use strict';
// Narrow, named bridge. No raw IPC, no Node, no arbitrary dispatch reaches the page.
const { contextBridge, ipcRenderer } = require('electron');
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('deployer', {
  prerequisites: () => call('prerequisites'),
  profiles: () => call('profiles'),
  identity: s => call('identity', s),
  login: s => call('login', s),
  install: tools => call('install', tools),
  pickSource: () => call('pick-source'),
  inspectSource: file => call('inspect-source', file),
  deploy: input => call('deploy', input),
  cancel: op => call('cancel', op),
  settings: () => call('settings'),
  setSetting: (k, v) => call('set-setting', k, v),
  resetSetting: k => call('reset-setting', k),
  history: () => call('history'),
  exportHistory: () => call('export-history'),
  dimSum: () => call('dim-sum'),
  version: () => call('version'),
  provenance: () => call('provenance'),
  updateState: () => call('update-state'),
  checkUpdates: () => call('update-check'),
  installUpdate: () => call('update-install'),
  onUpdate: fn => { const l = (_e, ev) => fn(ev); ipcRenderer.on('update', l); return () => ipcRenderer.removeListener('update', l); },
  openExternal: url => call('open-external', url),
  window: action => call('window', action),
  onOperation: fn => { const l = (_e, ev) => fn(ev); ipcRenderer.on('op-event', l); return () => ipcRenderer.removeListener('op-event', l); },
  onWindow: fn => { const l = (_e, ev) => fn(ev); ipcRenderer.on('window', l); return () => ipcRenderer.removeListener('window', l); },
});
