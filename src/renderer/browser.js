/* Browser transport. Electron's preload remains the authority on desktop. */
'use strict';
(() => {
  if (window.deployer) return;
  const listeners = new Set();
  let cursor = 0, authenticated = false;
  const MAX_FILES = 500, MAX_BYTES = 16 * 1024 * 1024;
  async function request(path, body, method) {
    try {
      const response = await fetch(path, { method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.status === 401 || response.status === 403) { if (authenticated) locked(); return { ok: false, error: 'AUTH_REQUIRED' }; }
      return await response.json();
    } catch { return { ok: false, error: 'NETWORK_ERROR' }; }
  }
  const rpc = (method, ...args) => request('/api/rpc', { method, args });
  function locked(error = 'AUTH_REQUIRED') {
    authenticated = false;
    const root = document.getElementById('app');
    root.replaceChildren();
    const panel = document.createElement('main'); panel.className = 'card'; panel.style.cssText = 'margin:10vh auto;max-width:560px;padding:32px';
    const heading = document.createElement('h1'); heading.textContent = 'Protected browser companion';
    const detail = document.createElement('p'); detail.className = 'sub'; detail.textContent = error === 'NETWORK_ERROR' ? 'The companion server is unavailable. Reload to try again.' : 'Enter the companion access key or open your protected access link to connect. This key is separate from your AWS credentials.';
    const form = document.createElement('form'); form.className = 'stack'; form.style.gap = '16px'; form.autocomplete = 'off';
    const field = document.createElement('div'); field.className = 'field';
    const label = document.createElement('label'); label.htmlFor = 'companion-key'; label.textContent = 'Companion access key';
    const input = document.createElement('input'); input.id = 'companion-key'; input.type = 'password'; input.autocomplete = 'off'; input.required = true; input.spellcheck = false;
    const button = document.createElement('button'); button.className = 'btn fillb'; button.type = 'submit'; button.textContent = 'Connect';
    const status = document.createElement('p'); status.className = 'small'; status.setAttribute('role', 'status');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      let token = input.value.trim(); input.value = '';
      if (!token) { input.focus(); return; }
      button.disabled = true; status.textContent = 'Connecting…';
      const result = await request('/api/session', { token }); token = null;
      if (result.ok) { location.reload(); return; }
      button.disabled = false; status.textContent = result.error === 'NETWORK_ERROR' ? 'The companion server is unavailable. Try again.' : 'Access key not accepted. Check your key and try again.'; input.focus();
    });
    field.append(label, input); form.append(field, button, status);
    panel.append(heading, detail, form); root.append(panel);
  }
  let readyPromise;
  function ready() {
    return readyPromise ||= (async () => {
      const fragment = new URLSearchParams(location.hash.slice(1));
      let token = fragment.get('token');
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      const result = token ? await request('/api/session', { token }) : await rpc('settings');
      token = null;
      if (!result.ok) { locked(result.error); return result; }
      authenticated = true; setTimeout(poll, 250); return { ok: true };
    })();
  }
  async function poll() {
    if (!authenticated) return;
    const result = await request('/api/events?after=' + cursor);
    if (!authenticated) return;
    if (result.ok) {
      for (const event of result.events || []) {
        cursor = Math.max(cursor, event.seq || 0);
        for (const listener of listeners) listener(event);
      }
      cursor = Math.max(cursor, result.cursor || 0);
    }
    if (authenticated) setTimeout(poll, result.ok ? 750 : 2500);
  }
  function validPath(path) {
    return typeof path === 'string' && path.length <= 512 && !/[\\\x00-\x1f\x7f:]/.test(path) && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..');
  }
  async function uploadFiles(files) {
    const list = Array.from(files);
    if (!list.length) return { ok: false, error: 'CANCELLED' };
    if (list.length > MAX_FILES || list.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return { ok: false, error: 'UPLOAD_TOO_LARGE' };
    const paths = list.map(file => file.webkitRelativePath || file.name);
    if (paths.some(path => !validPath(path)) || new Set(paths).size !== paths.length) return { ok: false, error: 'UPLOAD_INVALID' };
    // File inputs expose regular file bytes, never server filesystem links or paths.
    const payload = [];
    for (let i = 0; i < list.length; i++) {
      const bytes = new Uint8Array(await list[i].arrayBuffer());
      let binary = '';
      for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      payload.push({ path: paths[i], content: btoa(binary) });
    }
    const result = await request('/api/upload', { files: payload });
    if (!result.ok) return result;
    const candidates = (result.files || []).filter(path => /(?:^|\/)Dockerfile$/i.test(path));
    candidates.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    return candidates.length ? { ok: true, path: candidates[0] } : { ok: false, error: 'DOCKERFILE_REQUIRED' };
  }
  function pickSource() {
    return new Promise(resolve => {
      const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.setAttribute('webkitdirectory', ''); input.hidden = true;
      const finish = result => { input.remove(); resolve(result); };
      input.addEventListener('change', async () => { try { finish(await uploadFiles(input.files)); } catch { finish({ ok: false, error: 'UPLOAD_INVALID' }); } }, { once: true });
      input.addEventListener('cancel', () => finish({ ok: false, error: 'CANCELLED' }), { once: true });
      document.body.append(input); input.click();
    });
  }
  const api = { browser: true, get authenticated() { return authenticated; }, ready, pickSource, uploadFiles,
    sampleProject: () => rpc('sampleSource'),
    signOut: async () => { authenticated = false; listeners.clear(); cursor = 0; locked(); const result = await request('/api/session', undefined, 'DELETE'); if (result.ok || result.error === 'AUTH_REQUIRED') location.reload(); return result; },
    version: async () => { const r = await rpc('version'); return r.version || ''; },
    provenance: async () => ({ ok: false, version: await api.version() }),
    updateState: async () => ({ status: 'not-installed' }),
    checkUpdates: async () => ({ status: 'not-installed' }),
    installUpdate: async () => ({ ok: false, error: 'UNSUPPORTED_OPERATION' }),
    onUpdate: () => () => {},
    window: async () => ({ ok: true }), onWindow: () => () => {},
    onOperation: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    openExternal: async url => { try { const u = new URL(url); if (!['https:', 'http:'].includes(u.protocol)) throw new Error(); window.open(u.href, '_blank', 'noopener,noreferrer'); return { ok: true }; } catch { return { ok: false, error: 'URL_BLOCKED' }; } },
    exportHistory: async () => { const result = await rpc('history'); if (!result.ok) return result; const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'deployment-history.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return { ok: true }; },
  };
  for (const method of ['prerequisites', 'profiles', 'identity', 'login', 'submitLoginCode', 'install', 'inspectSource', 'deploy', 'cancel', 'settings', 'setSetting', 'resetSetting', 'history', 'removeDeployments', 'dimSum']) api[method] = (...args) => rpc(method, ...args);
  window.deployer = Object.freeze(api);
})();
