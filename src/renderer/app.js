/* global Lib */
'use strict';
(() => {
  const api = window.deployer;
  const browser = !!api.browser;
  const root = document.getElementById('app');
  const live = document.getElementById('live');
  let VERSION = '';
  const S = {
    view: 'setup', settings: null, prereq: null, profiles: null, profilesError: null,
    selection: null, identity: null, login: null, install: null,
    wizard: { step: 1, file: null, inspect: null, name: '', port: '', health: '/', env: [] },
    run: null, result: null, history: { history: [], deployments: [] },
    prov: null, update: null, updateLater: false,
    lockState: null, unlocked: {}, unlock: null, lockWiz: null, appdata: '', ticketQ: '', ticketRegex: false, ticketDraft: '',
    tabs: [{ id: 'ws' }], active: 'ws', tabQ: '', tabRegex: false, hist: { q: '', regex: false, cat: 'All', from: '', to: '', sel: null }, clog: { q: '', regex: false, from: '', to: '' }, docF: { q: '', regex: false, id: null }, changelog: null, docs: null, exportFmt: 'json',
    palette: null, panel: null, practice: {}, infoStep: 0, noteQ: '', noteRegex: false, noteSel: new Set(), depQ: '', depRegex: false, depStatus: 'all', depSel: new Set(), sources: {}, defaults: {},
    drawer: false, notes: [], toasts: [], dimsum: null, troll: false, maximized: false,
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = k => esc(Lib.t(k, S.settings?.language || 'en'));
  const ic = (name, cls = '') => `<i class="ms ${cls}" aria-hidden="true">${name}</i>`;
  const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const stamp = iso => { try { const d = new Date(iso); const p = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' }).formatToParts(d); const g = t => p.find(x => x.type === t)?.value || ''; return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')} ${g('timeZoneName')}`; } catch { return 'unavailable'; } };
  const provLine = () => { const p = S.prov; if (!p) return 'v' + VERSION; const cn = p.codeName?.available ? ` · ${p.codeName.en} · ${p.codeName.zh}` : ''; return p.ok ? `v${p.version}${cn} · built ${stamp(p.builtAt)}` : `v${p.version} · build time unavailable (not a release build)`; };
  const emojiOn = () => S.settings?.emoji && !S.settings?.school;

  // ---------- feedback: live region, narration, sounds, toasts, notifications ----------
  let audio;
  function cue(kind) {
    if (!S.settings?.sounds) return;
    try {
      audio ||= new AudioContext();
      const notes = { tap: [660], ok: [523, 784], err: [392, 262], start: [440, 587], tada: [523, 659, 784, 1047] }[kind] || [660];
      notes.forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.09;
        o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 0.2);
      });
    } catch { /* audio unavailable: silent */ }
  }
  function say(text) {
    live.textContent = text;
    if (!S.settings?.narration || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const lang = S.settings.language === 'yue' ? 'yue' : 'en', want = S.settings.voices?.[lang] || S.settings.voice;
    const v = speechSynthesis.getVoices().find(x => x.name === want); if (v) u.voice = v;
    u.rate = S.settings.rate || 1; u.pitch = S.settings.pitch || 1; speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function toast(text, kind = 'ok') {
    const id = Math.random().toString(36).slice(2);
    if (!(S.settings?.calm && kind !== 'err')) S.toasts.push({ id, text, kind });
    S.notes.unshift({ id, text, kind, at: time() }); S.notes = S.notes.slice(0, 200);
    say(text); renderToasts();
    if (kind !== 'err') setTimeout(() => dismissToast(id), 4200);
  }

  // ---------- appearance ----------
  let rainbowTimer;
  function applyAppearance() {
    const s = S.settings; if (!s) return;
    const sched = Lib.scheduledTheme(s.schedule, new Date());
    const theme = sched || (s.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme);
    const reduce = s.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const a = s.a11y || {};
    root.className = ['app', theme === 'light' ? 'light' : '', reduce ? 'reduce' : '', s.calm ? 'calm' : '', s.focus ? 'focus' : '', a.contrast ? 'contrast' : '', a.focus ? 'focusring' : '', a.targets ? 'bigtargets' : ''].join(' ');
    document.body.style.zoom = (a.textSize || 100) / 100;
    document.body.style.background = theme === 'light' ? '#f4f6fa' : '#0b0d12';
    clearInterval(rainbowTimer);
    if (s.rainbow && !reduce) { let h = 210; rainbowTimer = setInterval(() => { h = (h + 2) % 360; root.style.setProperty('--ac', `hsl(${h} 90% 70%)`); }, 120); }
    else root.style.setProperty('--ac', s.rainbow ? 'hsl(210 90% 70%)' : s.accent);
    document.title = s.displayName || 'AWS App Deployer';
    applyElementStyles();
  }
  async function set(key, value) {
    const r = await api.setSetting(key, value);
    if (r.ok) { S.settings[key] = r.value; S.sources[key] = 'file'; S.lastChange = Date.now(); applyAppearance(); render(); cue('tap'); }
    return r;
  }

  // ---------- data loading ----------
  async function loadPrereq() { S.prereq = null; render(); S.prereq = await api.prerequisites(); render(); }
  async function loadProfiles() {
    S.profiles = null; S.profilesError = null; render();
    const r = await api.profiles();
    if (r.ok) S.profiles = browser && !r.profiles.length ? [{ name: 'default', region: 'us-east-1' }] : r.profiles; else { S.profiles = []; S.profilesError = r.error; }
    if (!S.selection && S.settings.selection) S.selection = S.settings.selection;
    if (browser && !S.selection && S.profiles?.length) S.selection = { profile: S.profiles[0].name, region: S.profiles[0].region || 'us-east-1' };
    render();
  }
  async function verify() {
    if (!S.selection?.region) return;
    const r = await api.identity(S.selection);
    S.identity = r.ok ? r.identity : null;
    if (!r.ok && r.error === 'AWS_LOGIN_REQUIRED') S.loginExpired = true;
    render();
  }
  async function loadHistory() { const r = await api.history(); if (r.ok) S.history = r; }

  // ---------- operations ----------
  api.onOperation(ev => {
    if (ev.kind === 'login' && S.login?.op === ev.op) {
      if (browser && ev.type === 'progress' && (ev.authorizationUrl || ev.url)) { S.login.authorizationUrl = safeAwsUrl(ev.authorizationUrl || ev.url); }
      if (ev.type === 'succeeded') { S.identity = ev.result.identity; S.login = null; S.loginExpired = false; api.window('focus'); toast('Connected to ' + ev.result.identity.accountId + ' as ' + roleOf(ev.result.identity.arn)); cue('ok'); }
      else if (ev.type === 'failed' || ev.type === 'cancelled') { S.login = { ...S.login, done: true, error: ev.result?.error || 'CANCELLED' }; cue('err'); }
      render();
    }
    if (ev.kind === 'install' && S.install?.op === ev.op) {
      if (ev.type === 'progress') { const p = ev; S.install.tools[p.tool] = { ...(S.install.tools[p.tool] || {}), ...p }; if (p.step === 'repair') S.install.log.push([time(), repairText(p)]); if (p.step === 'done') S.install.log.push([time(), toolName(p.tool) + ' installed and checked']); }
      else if (ev.type !== 'started') { S.install.done = true; S.install.result = ev.result; cue(ev.result?.ok ? 'ok' : 'err'); if (ev.result?.ok) toast('Tools installed'); loadPrereq(); }
      render();
    }
    if (ev.kind === 'deploy' && S.run?.op === ev.op) {
      if (ev.type === 'progress' && ev.stage) { S.run.stage = ev.stage; S.run.log.push([time(), stageLabel(ev.stage)]); }
      else if (ev.type !== 'started') { S.result = { ...ev.result, name: S.run.name, scope: ev.scope }; S.run = null; S.view = 'result'; loadHistory();
        const ok = S.result.ok; cue(ok ? 'ok' : 'err'); toast(Lib.funny(ok ? 'success' : 'failure', S.settings.school ? 1 : S.settings.funnyLevels, S.settings.language) + (ok && emojiOn() ? ' 🎉' : ''), ok ? 'ok' : 'err'); }
      render();
    }
  });
  const roleOf = arn => (/assumed-role\/(?:AWSReservedSSO_)?([^/_]+)/.exec(arn || '') || [])[1] || 'signed-in role';
  const toolName = k => ({ aws: 'AWS CLI v2', docker: 'Docker Desktop' }[k] || k);
  const stageLabel = st => (Lib.STAGES.find(s => s.id === st || (s.from || []).includes(st)) || { label: st === 'complete' ? 'Complete' : st }).label;
  function repairText(p) {
    return ({ 'download-retry': `Download interrupted, retry ${p.attempt} of 3`, 'wsl-enable': 'WSL not ready for Docker, enabling and updating it', 'winget-retry': 'Package manager install failed, trying again', 'publisher-installer': 'Switched to the publisher\'s signed installer', 'path-refresh': 'Refreshed PATH so new tools are found', 'docker-start': 'Starting Docker Desktop and waiting for its engine' })[p.repair] || p.repair;
  }

  // ---------- shell ----------
  function shell(content, { rail = true } = {}) {
    const nav = (v, icon, key) => `<button class="navi ${S.view === v || (v === 'deploys' && ['wizard', 'run', 'result'].includes(S.view)) ? 'on' : ''}" data-go="${v}" data-menu="nav" ${S.view === v ? 'aria-current="page"' : ''}><span class="pill">${ic(icon)}</span>${T(key)}</button>`;
    return `
    <div class="titlebar">${logoHtml(20)}<span class="name">${esc(S.settings?.displayName || 'AWS App Deployer')}</span><span class="small mono" title="Running version and build time">${esc(provLine())}</span>${S.settings?.timeAware ? `<span class="small mono" id="time-aware" aria-live="off">${esc(timeLine())}</span>` : ''}<span class="grow"></span>
      <button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-act="palette" aria-label="${T('palette')}">${ic('search', 'sm')}<span class="kbd">Ctrl+Shift+F</span></button>
      ${S.settings?.a11y?.hidden ? '' : `<button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-panel-open="a11y" aria-label="Accessibility tools" data-menu="a11y">${ic('accessibility_new', 'sm')}</button>`}
      <button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-panel-open="notes" aria-label="${T('notifications')}">${ic('notifications', 'sm')}${S.notes.length ? `<span class="badge ac" style="height: 18px">${S.notes.length}</span>` : ''}</button>
      ${browser ? '<span class="badge ac">Browser companion</span><button class="chip" data-act="sign-out">Sign out</button>' : `<div class="caption"><button data-win="minimize" aria-label="Minimize">${ic('remove')}</button><button data-win="maximize" aria-label="${S.maximized ? 'Restore' : 'Maximize'}">${ic(S.maximized ? 'filter_none' : 'crop_square')}</button><button class="x" data-win="close" aria-label="Close">${ic('close')}</button></div>`}</div>
    ${S.update?.status === 'ready' && !S.updateLater ? `<div class="banner" role="status">${ic('system_update', 'fill')}<span class="stack grow" style="flex: 1 1 320px"><span style="font-weight: 650">Version ${esc(S.update.next)} is ready to install</span><span class="small" style="color: inherit; opacity: .85">Unsigned build: Windows may show an unknown-publisher or SmartScreen warning. Your settings and drafts are kept.</span></span><button class="btn text" style="color: inherit" data-act="open-url" data-url="https://github.com/Ding-Ding-Projects/aws-app-deployer/releases/latest">Release notes</button><button class="btn out" style="color: inherit; border-color: currentColor" data-act="update-later">Later</button><button class="btn fillb" data-act="update-install">${ic('restart_alt')}Restart to install update</button></div>` : ''}
    ${S.view !== 'setup' || S.active !== 'ws' ? tabStrip() : ''}
    <div class="body">
      ${rail ? `<nav class="rail" aria-label="Main">
        <button class="fab" data-go="wizard" aria-label="${T('new_deployment')}">${ic('add', 'lg')}</button>
        ${nav('deploys', 'rocket_launch', 'nav_deploys')}${nav('accounts', 'key', 'nav_accounts')}${nav('settings', 'tune', 'nav_settings')}
        <span class="gap"></span>${nav('help', 'help', 'nav_help')}</nav>` : ''}
      <main class="main ${rail ? "" : "bare"}" id="main" tabindex="-1">${content}</main>
    </div>`;
  }
  const page = (title, actions, body) => `<header class="topbar"><h1 class="rise">${title}</h1><span class="grow"></span>${actions || ''}</header><div class="content">${nextActionBar()}${body}</div>`;

  // ---------- views ----------
  function reason(code, cmd) {
    return ({ UNAVAILABLE: `Not on PATH: ${cmd} could not be started`, TIMEOUT: 'Check timed out after 30 s; it may still be starting', AWS_CLI_UPDATE_REQUIRED: 'Installed, but older than 2.22, which browser sign-in needs', COMMAND_FAILED: `${cmd} ran but reported an error`, CANCELLED: 'Check was cancelled', OUTPUT_LIMIT: `${cmd} printed more than expected` })[code] || (code ? 'Not usable: ' + code : 'Not found');
  }
  function prereqCard() {
    const p = S.prereq;
    if (!p) return `<div class="card"><span class="h2">${T('checking')}</span><div class="sk" style="height: 18px; width: 70%"></div><div class="sk" style="height: 18px; width: 55%"></div></div>`;
    const row = (ok, title, sub) => `<div class="step ${ok ? 'done' : 'bad'}"><span class="n">${ic(ok ? 'check' : 'close', 'sm')}</span><span class="stack"><span class="t">${title}</span><span class="m">${sub}</span></span></div>`;
    const missing = [!p.aws?.available && 'aws', !(p.docker?.available && p.docker?.running) && 'docker'].filter(Boolean);
    const installing = S.install && !S.install.done;
    return `<div class="card rise" style="--i:3; flex: 1">
      <span class="h2">${T('checking')}</span>
      <div class="steps">${row(p.aws?.available, browser ? 'AWS CLI with console sign-in support' : 'AWS CLI v2.22 or later', p.aws?.available ? 'Found' : reason(p.aws?.error, 'aws'))}
      ${row(p.docker?.available && p.docker?.running, 'Docker Engine and Compose', p.docker?.available ? (p.docker.running ? 'Running' : 'Installed, but the engine is not running (' + reason(p.docker?.error, 'docker').toLowerCase() + ')') : reason(p.docker?.error, 'docker'))}</div>
      ${missing.length ? `<button class="btn fillb" data-act="install" data-tools="${missing.join(',')}" ${installing || p.platform !== 'win32' ? 'disabled' : ''}>${ic('download', 'fill')}${T('install_missing')}</button>
        <span class="small">${p.platform === 'win32' ? T('install_note') : esc(Lib.errorText('UNSUPPORTED_PLATFORM'))}</span>` : `<span class="badge ok" style="align-self: flex-start">${ic('check', 'sm')}${T('all_ready')}</span>`}
      <button class="btn text" data-act="recheck" style="align-self: flex-start">${ic('refresh')}${T('refresh')}</button>
    </div>`;
  }
  function installPanel() {
    const I = S.install; if (!I) return '';
    const tools = Object.keys(I.requested).map(k => {
      const st = I.tools[k] || {}; const res = I.result?.results?.find(r => r.tool === k);
      const pct = st.step === 'download' && st.total ? Math.round(100 * st.done / st.total) : null;
      const state = res ? (res.ok ? `<span class="badge ok">${ic('check', 'sm')}Installed${res.rebootRequired ? ' · restart needed' : ''}</span>` : `<span class="badge err">${esc(Lib.errorText(res.error))}</span>`) : `<span class="badge ac">${pct !== null ? pct + '%' : esc(st.step || 'waiting')}</span>`;
      return `<div class="li static" style="padding: 16px"><span class="tile ${res?.ok ? 'ok' : res ? 'err' : 'ac'}">${res ? ic(res.ok ? 'check' : 'error', 'fill') : '<span class="spin"></span>'}</span><span class="stack grow"><span class="t">${toolName(k)}</span>${pct !== null ? `<span class="bar" style="margin-top: 6px"><i style="width: ${pct}%"></i></span>` : `<span class="m">${st.via === 'winget' ? 'Windows Package Manager' : st.via === 'publisher' ? 'Publisher installer' : st.step === 'verify' ? 'Checking the publisher signature' : 'Queued'}</span>`}</span>${state}</div>`;
    }).join('<div class="divider" style="margin: 0 16px"></div>');
    return `<div class="card raise rise" style="padding: 8px; gap: 0; border: 1px solid var(--line)">${tools}</div>
      ${I.log.length ? `<div class="log mono" role="log">${I.log.map(([t, l], i) => `<div class="ln" style="--i:${i % 4}"><time>${t}</time>${esc(l)}</div>`).join('')}</div>` : ''}
      ${!I.done ? `<button class="btn out" data-act="cancel-op" data-op="${I.op}" style="align-self: flex-start">${T('cancel')}</button>` : ''}`;
  }
  function viewSetup() {
    const pr = S.profiles;
    const list = pr === null ? '<div class="sk" style="height: 56px"></div>' : !pr.length ? `<div class="empty" style="padding: 24px"><span class="h2">${T('no_profiles')}</span><span class="sub">${T('no_profiles_sub')}</span></div>`
      : `<div class="list" style="background: var(--s1)">${pr.map(p => `<button class="li ${S.selection?.profile === p.name ? 'sel' : ''}" data-act="pick-profile" data-profile="${esc(p.name)}" data-region="${esc(p.region || '')}">${ic(S.selection?.profile === p.name ? 'radio_button_checked' : 'radio_button_unchecked')}<span class="stack grow"><span class="t mono">${esc(p.name)}</span><span class="m">${p.region ? esc(p.region) : 'No region set'}</span></span></button>`).join('')}</div>`;
    return `<div style="padding: 32px; display: flex; flex-direction: column; gap: 24px; max-width: 1120px; margin: 0 auto; width: 100%">
      <div class="row rise"><span class="badge ac">${T('setup')}</span><span class="grow"></span><button class="btn text" data-act="skip-setup">Skip for now</button></div>
      <div class="stack rise" style="--i:1; gap: 10px; max-width: 720px"><h1 class="h1" style="font-size: 38px; letter-spacing: -.035em">Deploy a container to your own AWS account.</h1><p class="sub" style="margin: 0; font-size: 16px">${browser ? 'Upload a Dockerfile project' : 'Pick a Dockerfile or Compose project'}, press Deploy, and get a public link anyone can open. ${browser ? 'Builds and deployments run on the companion server using your AWS session.' : 'Everything runs on this computer with your own AWS credentials.'}</p></div>
      <div class="card rise" style="--i:2; flex-direction: row; gap: 14px; background: var(--warn-c)">${ic('payments', 'fill')}<span class="stack"><span style="font-weight: 650">${T('charges')}</span><span class="sub">${T('charges_sub')}</span></span></div>
      <div class="cols" style="align-items: stretch">
        <div class="wide"><div class="card rise" style="--i:3"><div class="row"><span class="tile ac">${ic('badge', 'fill')}</span><span class="stack grow"><span class="h2">Use an AWS CLI profile</span><span class="small">${T('profiles')}</span></span><button class="btn text" data-act="reload-profiles">${ic('refresh')}</button></div>${list}
          <button class="btn fillb" data-act="go-connect" ${S.selection ? '' : 'disabled'} style="align-self: flex-start">${T('continue')}${ic('arrow_forward')}</button></div>
          ${installPanel()}</div>
        <div class="side">${prereqCard()}</div>
      </div></div>`;
  }
  function safeAwsUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && /(^|\.)signin\.aws\.amazon\.com$/.test(url.hostname) && url.pathname === '/v1/authorize' ? url.href : null; } catch { return null; }
  }
  function browserError(code) {
    return ({ TIMEOUT: 'AWS sign-in expired. Start sign-in again.', AWS_LOGIN_FAILED: 'AWS did not authorize this session. The request may have been denied or the code expired. Start sign-in again.', UNAVAILABLE: 'AWS CLI is unavailable on the companion server.', LOGIN_IN_PROGRESS: 'A sign-in is already running. Cancel it before starting again.', BROWSER_COMPOSE_UNSUPPORTED: 'Compose uploads are not supported yet. Choose a Dockerfile project.', DOCKERFILE_REQUIRED: 'Choose a project folder containing a Dockerfile. Compose uploads are not supported yet.', AUTH_REQUIRED: 'Companion access expired. Reopen your protected access link.', NETWORK_ERROR: 'The companion server is unavailable. Try again.', AWS_LOGIN_EXPIRED: 'AWS authorization expired. Start sign-in again.', AWS_LOGIN_DENIED: 'AWS authorization was denied. Start sign-in again when ready.', CANCELLED: 'Sign-in cancelled. You can start again.', INVALID_UPLOAD: 'Choose a valid project folder without unsafe paths.', UPLOAD_INVALID: 'Choose a valid project folder without unsafe paths.', UPLOAD_TOO_LARGE: 'The folder exceeds 500 files or 16 MiB.' })[code] || Lib.errorText(code);
  }
  function browserLoginPanel(L) {
    return `<div class="card raise" style="padding: 28px; gap: 20px; border: 1px solid var(--line)"><span class="h2">Sign in with AWS console</span><p class="sub">Open AWS, choose your account and approve access. Copy the authorization code from AWS and paste it below. Your AWS password stays on AWS.</p>
      ${L.authorizationUrl ? `<a class="btn fillb" style="align-self:flex-start" href="${esc(L.authorizationUrl)}" target="_blank" rel="noopener noreferrer">${ic('open_in_new')}Open AWS sign-in</a>` : '<span class="small" role="status">Preparing the AWS authorization link…</span>'}
      <form id="aws-code-form" class="stack" style="gap:16px" autocomplete="off"><div class="field"><label for="aws-code">AWS authorization code</label><input id="aws-code" type="password" autocomplete="off" spellcheck="false" placeholder="Paste code from AWS" ${L.submitting ? 'disabled' : ''}><span class="help">The code is sent once to the companion server and is not saved.</span></div>
      <div class="row" style="gap:8px"><button class="btn fillb" type="submit" data-act="submit-code" ${!L.authorizationUrl || L.submitting ? 'disabled' : ''}>${L.submitting ? 'Verifying…' : 'Verify account'}</button><button class="btn out" data-act="cancel-op" type="button" data-op="${esc(L.op)}">Cancel sign-in</button></div></form><span class="small">If the code expires or access is denied, start sign-in again.</span></div>`;
  }
  function viewAccounts() {
    const s = S.selection, L = S.login, id = S.identity;
    let main;
    if (!s) main = `<div class="empty"><span class="tile">${ic('key_off')}</span><span class="h2">Choose a profile first</span><button class="btn fillb" data-go="setup">${T('setup')}</button></div>`;
    else if (browser && L && !L.done) main = browserLoginPanel(L);
    else if (L && !L.done) main = `<div class="card raise" style="padding: 32px; gap: 24px; border: 1px solid var(--line)"><div class="row" style="gap: 18px"><span class="tile ac" style="width: 56px; height: 56px; border-radius: 18px">${ic('open_in_browser', 'lg fill')}</span><span class="stack"><span style="font-size: 20px; font-weight: 650">${T('waiting_browser')}</span><span class="sub">Approve the request in your browser. AWS CLI handles the sign-in; this window comes back by itself.</span></span></div>
      <div class="steps" aria-live="polite"><div class="step done"><span class="n">${ic('check', 'sm')}</span><span class="t">Browser opened</span></div><div class="step now"><span class="n">2</span><span class="stack"><span class="t">Waiting for approval</span><span class="m">Times out after 5 minutes</span></span></div><div class="step off"><span class="n">3</span><span class="t">Verify account</span></div></div>
      <button class="btn out" data-act="cancel-op" data-op="${L.op}" style="align-self: flex-start">Cancel sign-in</button></div>`;
    else if (id) main = `<div class="card raise rise" style="padding: 28px; gap: 20px; border: 1px solid var(--line)"><div class="row" style="gap: 16px"><span class="tile ok pop" style="width: 56px; height: 56px; border-radius: 18px"><svg class="check" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg></span><span class="stack"><span style="font-size: 20px; font-weight: 650">${T('verified')}</span><span class="sub">Deployments from this profile go to this account only.</span></span></div>
      <dl class="kv" style="margin: 0; grid-template-columns: 140px minmax(0, 1fr)"><dt>Account ID</dt><dd class="mono">${esc(id.accountId.replace(/(\d{4})(?=\d)/g, '$1 '))}</dd><dt>Role</dt><dd>${esc(roleOf(id.arn))}</dd><dt>Signed-in ARN</dt><dd class="mono" style="overflow-wrap: anywhere; color: var(--tx2)">${esc(id.arn)}</dd><dt>Profile</dt><dd class="mono">${esc(id.profile)}</dd><dt>Region</dt><dd class="mono">${esc(id.region)}</dd></dl>
      <div class="row" style="flex-wrap: wrap"><button class="btn fillb" data-go="wizard">${ic('rocket_launch')}Start a deployment</button><button class="btn out" data-act="verify">Re-verify</button></div></div>`;
    else main = `<div class="card raise" style="padding: 28px; gap: 18px; border: 1px solid var(--line)"><div class="row" style="gap: 16px"><span class="tile ${S.loginExpired ? 'warn' : 'ac'}" style="width: 56px; height: 56px; border-radius: 18px">${ic(S.loginExpired ? 'lock_clock' : 'login', 'lg fill')}</span><span class="stack"><span style="font-size: 20px; font-weight: 650">${S.loginExpired ? 'Your AWS sign-in expired' : 'Sign in to ' + esc(s.profile)}</span><span class="sub">${S.loginExpired ? 'Nothing was changed in AWS. Sign in again to read status or deploy.' : browser ? 'Sign in with your AWS console account in a separate AWS tab, then paste the authorization code here.' : 'Your browser opens the AWS access portal. This is not your AWS console password.'}</span></span></div>
      ${browser || !s.region ? `<div class="field"><label for="reg">AWS region</label><input id="reg" class="mono" placeholder="us-east-1" value="${esc(s.region)}" data-input="region"></div>` : ''}
      ${L?.error ? `<div class="card" style="background: var(--err-c); flex-direction: row; gap: 10px">${ic('error', 'fill')}<span>${esc(browser ? browserError(L.error) : Lib.errorText(L.error))}</span></div>` : ''}
      <button class="btn fillb" data-act="login" style="align-self: flex-start">${ic('open_in_browser')}${T('sign_in')}</button></div>`;
    const list = (S.profiles || []).map(p => `<button class="li ${s?.profile === p.name ? 'sel' : ''}" data-act="pick-profile" data-profile="${esc(p.name)}" data-region="${esc(p.region || '')}"><span class="tile ${s?.profile === p.name && id ? 'ok' : ''}">${ic(s?.profile === p.name && id ? 'verified_user' : 'key', 'fill')}</span><span class="stack grow"><span class="t mono">${esc(p.name)}</span><span class="m">${esc(p.region || 'region needed')}</span></span></button>`).join('');
    return page(T('nav_accounts'), `<button class="btn out" data-act="reload-profiles">${ic('refresh')}${T('refresh')}</button>`, `<div class="cols"><div class="side extra" style="flex: 1 1 340px"><span class="label">${browser ? 'Profiles in this browser session' : T('profiles').toUpperCase()}</span><div class="list">${list || `<span class="small" style="padding: 12px">${T('no_profiles')}</span>`}</div>
      <div class="card outline" style="flex-direction: row; gap: 12px">${ic('group')}<span class="small">${browser ? 'Your AWS session is isolated on the companion server and expires with this browser access session.' : 'Each Windows user keeps their own profiles and AWS credentials.'} Signing in to AWS gives this app permission to deploy; it never adds a sign-in to your deployed site.</span></div></div><div class="wide">${main}</div></div>`);
  }
  function viewDeploys() {
    const d = [...S.history.deployments].reverse();
    const chip = S.identity ? `<button class="chip" data-go="accounts"><span class="dot"></span>${esc(S.identity.profile)} <span class="mono" style="color: var(--tx3)">${esc(S.identity.accountId)}</span></button><span class="chip">${ic('public', 'sm')}${esc(S.identity.region)}</span>` : `<button class="chip" data-go="accounts">${ic('key_off', 'sm')}Not signed in</button>`;
    const running = S.run ? `<button class="li" data-go="run"><span class="tile ac"><span class="spin"></span></span><span class="stack grow"><span class="t">${esc(S.run.name)}</span><span class="m">${esc(stageLabel(S.run.stage || 'validation'))}</span><span class="bar" style="margin-top: 6px; max-width: 320px"><i style="width: ${Math.max(4, 100 * Lib.stageIndex(S.run.stage || 'validation') / Lib.STAGES.length)}%"></i></span></span><span class="badge ac">Deploying</span></button>` : '';
    const F = filteredDeployments(); const shown = F.list; const fOpen = !!S.settings.ui?.filtersOpen?.deploys || !!S.depQ || S.depStatus !== 'all';
    const bar = d.length ? `<button class="collapser" data-act="filters" data-id="deploys" aria-expanded="${fOpen}">${ic(fOpen ? 'expand_less' : 'expand_more', 'sm')}Filter${S.depQ || S.depStatus !== 'all' ? ` <span class="badge ac">active: ${shown.length} of ${d.length}</span>` : ''}</button>
      ${fOpen ? `<div class="row" style="flex-wrap: wrap; gap: 8px"><label class="sr" for="dq">Search deployments</label><input id="dq" class="mono" data-input="depQ" value="${esc(S.depQ)}" placeholder="Search name, region or error" style="flex: 1 1 240px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 12px"><button class="badge ${S.depRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="dep-regex" aria-pressed="${S.depRegex}">.* Regex</button><span class="seg">${[['all', 'All'], ['ok', 'Healthy'], ['bad', 'Stopped']].map(([v, l]) => `<button class="${S.depStatus === v ? 'on' : ''}" data-act="dep-status" data-v="${v}" aria-pressed="${S.depStatus === v}">${l}</button>`).join('')}</span></div>${F.error ? `<span class="badge err">${esc(F.error)}</span>` : ''}` : ''}
      <div class="row" style="flex-wrap: wrap; gap: 6px"><button class="btn text" data-act="dep-all">Select all ${shown.length} shown</button><button class="btn text" data-act="dep-invert">Invert</button><span class="grow"></span>${S.depSel.size ? `<span class="badge ac">${S.depSel.size} selected</span><button class="btn text" data-act="dep-export">${ic('download')}Export</button><button class="btn text" style="color: var(--err)" data-act="dep-remove">${ic('delete')}Remove…</button>` : ''}</div>` : '';
    const rows = shown.map(x => `<div class="li static" data-menu="deploy" data-at="${esc(x.id || x.at)}" tabindex="0"><input type="checkbox" class="check" aria-label="Select ${esc(x.name)}" data-dep="${esc(x.id || x.at)}" ${S.depSel.has(x.id || x.at) ? 'checked' : ''}><span class="tile ${x.ok ? 'ok' : 'warn'}">${ic(x.ok ? 'deployed_code' : 'history', 'fill')}</span><span class="stack grow"><span class="t">${esc(x.name)}</span><span class="m">${esc(x.region)} · ${new Date(x.at).toLocaleString()}${x.ok ? '' : ' · ' + esc(Lib.errorText(x.error))}</span></span>${x.ok ? `<button class="btn text" data-act="open-url" data-url="${esc(x.url)}">${T('open')}</button><span class="badge ok">${ic('check', 'sm')}Healthy at deploy</span>` : `<span class="badge warn">Stopped</span>`}</div>`).join('');
    const body = !d.length && !S.run ? `<div class="empty rise"><span class="tile ac">${ic('rocket_launch', 'lg fill')}</span><span class="h2" style="font-size: 20px">${T('no_deployments')}</span><span class="sub" style="max-width: 480px">${T('no_deployments_sub')}</span><button class="btn fillb" data-go="wizard">${ic('add')}${T('new_deployment')}</button></div>`
      : `${momentumCard()}${chartsCard()}${bar}<div class="list rise">${running}${rows || '<span class="small" style="padding: 12px">No records match the filter</span>'}</div><div class="row"><span class="small grow">Status shown is the result recorded when each deployment finished on this computer.</span><button class="btn text" data-panel-open="export:deploys">${T('export_history')}</button></div>`;
    return page(T('deployments'), chip, body);
  }
  function viewWizard() {
    const W = S.wizard;
    const steps = [['Account', S.identity ? `${S.identity.profile} · ${S.identity.region}` : 'Sign in first'], [T('source'), W.inspect?.ok ? (W.inspect.source.service || 'ready') : 'Dockerfile or Compose'], [T('configure'), W.name ? W.name : 'Name, port, health'], [T('review'), '']];
    const stepper = `<nav class="side" style="flex: 0 1 260px" aria-label="Wizard steps"><div class="steps">${steps.map(([t, m], i) => `<div class="step ${i + 1 < W.step ? 'done' : i + 1 === W.step ? 'now' : 'off'}"><span class="n">${i + 1 < W.step ? ic('check', 'sm') : i + 1}</span><span class="stack"><span class="t">${t}</span><span class="m">${esc(m)}</span></span></div>`).join('')}</div></nav>`;
    let body;
    if (W.step === 1) body = S.identity ? `<div class="card"><span class="h2">Deploy into</span><dl class="kv" style="margin: 0"><dt>Account</dt><dd class="mono">${esc(S.identity.accountId)}</dd><dt>Role</dt><dd>${esc(roleOf(S.identity.arn))}</dd><dt>Region</dt><dd class="mono">${esc(S.identity.region)}</dd></dl></div><div class="row" style="justify-content: flex-end"><button class="btn fillb" data-act="wiz" data-step="2">${T('next')}${ic('arrow_forward')}</button></div>`
      : `<div class="empty"><span class="tile warn">${ic('key_off', 'lg')}</span><span class="h2">Sign in to AWS first</span><span class="sub">The account is verified before anything is built.</span><button class="btn fillb" data-go="accounts">${T('connect')}</button></div>`;
    if (W.step === 2) {
      const I = W.inspect;
      const reasons = I && !I.ok && I.reasons ? `<div class="list">${I.reasons.map(r => `<div class="li static"><span class="stack grow"><span class="t">${esc(r.service || 'project')}</span><span class="m mono">${esc(r.feature)}</span></span><span class="badge warn">${ic('block', 'sm')}Not supported yet</span></div>`).join('')}</div>` : '';
      body = `<div class="drop ${W.file ? 'idle' : ''}" style="flex-wrap: wrap"><span class="tile ac" style="width: 56px; height: 56px; border-radius: 18px">${ic('folder_open', 'lg fill')}</span><span class="stack grow" style="flex: 1"><span style="font-weight: 650; overflow-wrap: anywhere">${W.file ? esc(W.file) : T('choose_file')}</span><span class="sub">${W.inspecting ? 'Inspecting…' : I?.ok ? 'Inspected: ' + esc(I.source.kind) + (I.source.containerPort ? ' · port ' + I.source.containerPort : ' · no single exposed port') : I ? esc(Lib.errorText(I.error)) : 'Nothing is created in AWS until you press Deploy.'}</span></span><button class="btn out" data-act="pick">${W.file ? 'Choose another' : browser ? 'Upload project folder' : 'Choose file'}</button>${browser ? '<button class="btn tonal" data-act="sample">Use sample project</button><span class="small" style="flex-basis:100%">Upload a folder containing a Dockerfile. Maximum 500 files and 16 MiB. Review files first; exclude credentials and secrets.</span>' : ''}</div>${reasons}
        ${I?.ok && I.source.kind === 'image' ? `<div class="card" style="background: var(--warn-c)">This Compose service uses a prebuilt image. Choose a Compose service with a build context, or a Dockerfile.</div>` : ''}
        <div class="row" style="justify-content: flex-end; gap: 8px"><button class="btn out" data-act="wiz" data-step="1">${T('back')}</button><button class="btn fillb" data-act="wiz" data-step="3" ${I?.ok && I.source.kind !== 'image' ? '' : 'disabled'}>${T('next')}${ic('arrow_forward')}</button></div>`;
    }
    if (W.step === 3) body = `<div class="card"><span class="h2">${T('configure')}</span><div class="row" style="flex-wrap: wrap; gap: 16px; align-items: flex-start">
      <div class="field" style="flex: 2 1 220px"><label for="w-n">${T('app_name')}</label><input id="w-n" data-input="name" value="${esc(W.name)}"><span class="help">3 to 32 lowercase letters, numbers and hyphens</span></div>
      <div class="field" style="flex: 1 1 120px"><label for="w-p">${T('port')}</label><input id="w-p" class="mono" data-input="port" inputmode="numeric" value="${esc(W.port)}"></div>
      <div class="field" style="flex: 1 1 160px"><label for="w-h">${T('health')}</label><input id="w-h" class="mono" data-input="health" value="${esc(W.health)}"></div></div>
      <span class="stack" style="gap: 6px"><span class="label">TASK SIZE</span><span class="row" style="gap: 8px"><span class="badge mute">0.25 vCPU · 512 MiB per task</span><span class="small">Fixed in this version</span></span></span>
      <span class="label">ENVIRONMENT (plain values; secrets are not supported yet)</span>
      ${W.env.map((e, i) => `<div class="envrow"><input class="mono" aria-label="Variable name" data-env="${i}" data-k="k" value="${esc(e.k)}"><input class="mono" aria-label="Value" data-env="${i}" data-k="v" value="${esc(e.v)}"><button class="btn text" data-act="env-del" data-i="${i}" aria-label="Remove variable">${ic('delete')}</button></div>`).join('')}
      <button class="btn text" data-act="env-add" style="align-self: flex-start">${ic('add')}Add variable</button></div>
      <div class="row" style="justify-content: flex-end; gap: 8px"><button class="btn out" data-act="wiz" data-step="2">${T('back')}</button><button class="btn fillb" data-act="wiz" data-step="4" ${/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(W.name) && (!W.port || /^\d{1,5}$/.test(W.port)) ? '' : 'disabled'}>${T('next')}${ic('arrow_forward')}</button></div>`;
    if (W.step === 4) body = `<div class="card raise" style="border: 1px solid var(--line)"><div class="row"><span class="h2">${T('review')}</span></div>
      <dl class="kv" style="margin: 0; grid-template-columns: 160px minmax(0, 1fr)"><dt>Deploys into</dt><dd><span class="mono">${esc(S.identity.accountId)}</span> · ${esc(roleOf(S.identity.arn))} · ${esc(S.identity.region)}</dd><dt>Builds from</dt><dd class="mono" style="overflow-wrap: anywhere">${esc(W.file)}</dd><dt>Name</dt><dd class="mono">${esc(W.name)}</dd><dt>Port and health</dt><dd class="mono">${esc(W.port || 'from Dockerfile')} · ${esc(W.health)}</dd>
      <dt>Public link</dt><dd>AWS-generated HTTP address, open to anyone.</dd><dt>Creates</dt><dd>VPC across two availability zones, one Application Load Balancer, one NAT gateway, two Fargate tasks, an ECR repository, CloudWatch logs</dd><dt>Ongoing charges</dt><dd>Load balancer hours, NAT gateway hours and data, Fargate vCPU and memory, image and log storage, data transfer. Check AWS pricing for ${esc(S.identity.region)}.</dd></dl>
      <div class="divider"></div><div class="row" style="flex-wrap: wrap"><button class="btn text" data-act="wiz" data-step="3">${T('back')}</button><span class="grow"></span><button class="btn fillb big" data-act="deploy" ${S.run ? 'disabled' : ''}>${ic('rocket_launch', 'fill')}${T('deploy')}</button></div></div>`;
    return page(T('new_deployment'), '<span class="small">Draft saved · no secrets stored</span>', `<div class="cols">${stepper}<div class="wide">${body}</div></div>`);
  }
  function viewRun() {
    const R = S.run;
    if (!R) return page(T('deployments'), '', `<div class="empty"><span class="h2">Nothing is running</span><button class="btn fillb" data-go="deploys">${T('nav_deploys')}</button></div>`);
    const at = Lib.stageIndex(R.stage || 'validation');
    const steps = Lib.STAGES.map((s, i) => `<div class="step ${i < at ? 'done' : i === at ? 'now' : 'off'}"><span class="n">${i < at ? ic('check', 'sm') : i + 1}</span><span class="t">${esc(s.label)}</span></div>`).join('');
    return page(esc(R.name), `<span class="badge ac"><span class="spin" style="width: 12px; height: 12px; border-width: 2px"></span>Deploying</span><button class="btn out" data-act="cancel-op" data-op="${R.op}">${T('cancel')}</button>`,
      `<span class="small mono">operation ${esc(R.op)} · ${esc(R.scope.accountId)} · ${esc(R.scope.region)}</span>
      <div class="card"><span class="h2">Stage ${Math.min(at + 1, 9)} of 9 · ${esc(stageLabel(R.stage || 'validation'))}</span><div class="row" style="gap: 6px" aria-hidden="true">${Lib.STAGES.map((s, i) => `<span class="bar ${i < at ? 'ok' : i === at ? 'indet' : ''}" style="flex: 1"><i style="width: ${i < at ? 100 : i === at ? '' : 0}%"></i></span>`).join('')}</div><span class="small">From backend progress events</span></div>
      <div class="cols"><div class="side" style="flex: 1 1 320px"><div class="steps card" style="padding: 10px; gap: 0" aria-live="polite">${steps}</div></div>
      <div class="wide"><div class="log mono" role="log">${R.log.map(([t, l]) => `<div class="ln"><time>${t}</time>${esc(l)}</div>`).join('')}<div class="ln caret"><time>${time()}</time>Working</div></div>
      <div class="card outline" style="flex-direction: row; gap: 12px">${ic('info')}<span class="small">Cancel stops waiting on this computer. AWS may keep finishing what it already accepted. Closing the app never deletes infrastructure.</span></div></div></div>`);
  }
  function viewResult() {
    const r = S.result;
    if (!r) return viewDeploys();
    if (r.ok) return page(esc(r.name), '', `<div class="card raise" style="padding: 32px; gap: 22px; border: 1px solid var(--line)"><div class="row" style="gap: 18px"><span class="tile ok pop" style="width: 64px; height: 64px; border-radius: 20px"><svg class="check" width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg></span><span class="stack"><span style="font-size: 28px; font-weight: 650; letter-spacing: -.03em">${T('live')}</span><span class="sub">AWS finished, targets passed health checks, and the link answered.</span></span></div>
      <div class="urlbox" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 16px 16px 20px; border-radius: 16px; background: var(--bg); border: 1px solid var(--line2)">${ic('public', 'fill')}<span class="mono" style="flex: 1 1 320px; min-width: 0; font-size: 15px; overflow-wrap: anywhere; color: var(--ac)">${esc(r.url)}</span><button class="btn tonal" data-act="copy" data-url="${esc(r.url)}">${ic('content_copy')}${T('copy_link')}</button><button class="btn fillb" data-act="open-url" data-url="${esc(r.url)}">${ic('open_in_new')}${T('open')}</button></div>
      <dl class="kv" style="margin: 0"><dt>Image</dt><dd class="mono" style="overflow-wrap: anywhere">${esc(r.image)}</dd><dt>Stack</dt><dd class="mono">${esc(r.stackName)}</dd><dt>Account</dt><dd class="mono">${esc(r.identity?.accountId)} · ${esc(r.identity?.region)}</dd></dl></div>`);
    return page(esc(r.name), `<span class="badge err">${T('failed')}</span>`, `<div class="card" style="flex-direction: row; flex-wrap: wrap; gap: 18px; padding: 24px; background: ${r.error === 'TARGETS_NOT_HEALTHY' ? 'var(--warn-c)' : 'var(--err-c)'}"><span class="tile ${r.error === 'TARGETS_NOT_HEALTHY' ? 'warn' : 'err'}" style="width: 52px; height: 52px; background: var(--s1)">${ic(r.error === 'TARGETS_NOT_HEALTHY' ? 'history' : 'error', 'lg fill')}</span>
      <span class="stack grow" style="flex: 1 1 300px; gap: 6px"><span style="font-size: 20px; font-weight: 650">${esc(Lib.errorText(r.error))}</span><span class="sub">Stopped during: ${esc(stageLabel(r.stage))}.${r.remediation ? ' ' + esc(r.remediation) : ''}</span></span>
      <button class="btn fillb" data-act="wiz-restart">${ic('replay')}Fix and redeploy</button></div>
      <div class="card outline"><span class="label">${T('still_running').toUpperCase()}</span><span class="small">${r.resourcesMayExist ? 'Some AWS resources may already exist for this deployment. Nothing was deleted; check the CloudFormation stack in AWS or redeploy with the same name.' : 'Nothing was created in AWS.'}</span>
      ${(r.reasons || []).map(x => `<span class="badge warn" style="align-self: flex-start">${esc(x.service || 'project')} · ${esc(x.feature)}</span>`).join('')}</div>`);
  }
  function viewSettings() {
    const s = S.settings;
    const info = (key, label) => Lib.EXPLAIN[key] ? `<button class="info" data-info="${key}" aria-label="About ${esc(label)}: explanation and guided steps">${ic('info', 'sm')}</button>` : '';
    const ctl = (key, label, control) => `<span class="stack" style="align-items: flex-end; gap: 4px">${info(key, label)}${control}</span>`;
    const tog = (key, label, sub, extra = '') => `<div class="set" data-menu="setting" data-key="${key}" data-search="${esc(label + ' ' + sub)}"><span class="stack grow"><span class="t" style="font-weight: 600">${label}</span><span class="small">${sub} · ${S.sources[key] === 'file' ? 'set by you' : 'default'}</span></span>${ctl(key, label, `<button class="toggle ${s[key] ? 'on' : ''}" role="switch" aria-checked="${!!s[key]}" aria-label="${label}" data-toggle="${key}"></button>`)}${extra}</div>`;
    const seg = (key, opts) => `<span class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${s[key] === v}" class="${s[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${l}</button>`).join('')}</span>`;
    const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    const q = S.settingsQuery || '';
    return page(T('nav_settings'), `<div class="field" style="flex: 0 1 380px; position: relative"><label for="sq" class="sr">${T('search_settings')}</label><input id="sq" data-input="settingsQuery" placeholder="${T('search_settings')}" value="${esc(q)}" style="padding-left: 42px; border-radius: 22px"><i class="ms" style="position: absolute; left: 14px; top: 12px; color: var(--tx3)" aria-hidden="true">search</i></div>`,
    `<div class="cols"><div class="wide" style="flex-direction: row; flex-wrap: wrap; align-items: flex-start">
      <div class="card" style="flex: 1 1 360px; gap: 0"><span class="h2" style="padding-bottom: 6px">Appearance</span>
        <div class="set" data-menu="setting" data-key="theme" data-search="theme light dark system"><span class="stack grow"><span class="t" style="font-weight: 600">${T('theme')}</span><span class="small">Follows Windows unless you pick one</span></span>${ctl('theme', T('theme'), seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]))}</div>
        <div class="set" data-menu="setting" data-key="accent" data-search="accent colour color"><span class="stack grow"><span class="t" style="font-weight: 600">${T('accent')}</span><span class="small">Type a hex, rgb(), hsl() or colour name</span></span><span class="row" style="gap: 8px">${info('accent', T('accent'))}${['#6ea8ff', '#4ade9a', '#f5b451', '#ff8a8a'].map(c => `<button class="sw ${!s.rainbow && s.accent === c ? 'on' : ''}" style="background: ${c}" data-act="accent" data-c="${c}" aria-label="Accent ${c}"></button>`).join('')}<button class="sw rainbow ${s.rainbow ? 'on' : ''}" data-act="rainbow" aria-label="Rainbow accent"></button></span></div>
        <div class="set" data-search="accent custom colour"><span class="stack grow"><label class="t" for="acc" style="font-weight: 600">Custom colour</label><span class="small mono">${esc(s.accent)} · ${esc(Lib.toRgb(s.accent))}</span></span><input id="acc" class="mono" style="width: 150px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px" data-input="accentText" placeholder="#6ea8ff"></div>
        ${tog('reduceMotion', T('reduce_motion'), 'Replaces movement with simple fades')}
        <div class="set" data-menu="setting" data-key="displayName" data-search="app name rename display"><span class="stack grow"><label class="t" for="dn" style="font-weight: 600">${T('app_title')}</label><span class="small">Shown in the title bar and taskbar</span></span>${info('displayName', T('app_title'))}<input id="dn" style="width: 180px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px" data-input="displayName" value="${esc(s.displayName)}" placeholder="AWS App Deployer"><button class="btn text" data-act="reset" data-key="displayName">${T('reset')}</button></div>
        <div class="set" data-menu="setting" data-key="schedule" data-search="schedule light dark time"><span class="stack grow"><span class="t" style="font-weight: 600">${T('schedule')}</span><span class="small">Light from ${esc(s.schedule.lightAt)}, dark from ${esc(s.schedule.darkAt)}, every day</span></span>${ctl('schedule', T('schedule'), `<button class="toggle ${s.schedule.enabled ? 'on' : ''}" role="switch" aria-checked="${s.schedule.enabled}" aria-label="${T('schedule')}" data-act="schedule"></button>`)}</div>
      </div>
      <div class="card" style="flex: 1 1 360px; gap: 0"><span class="h2" style="padding-bottom: 6px">Language and voice</span>
        <div class="set" data-menu="setting" data-key="language" data-search="language english cantonese both"><span class="stack grow"><span class="t" style="font-weight: 600">${T('language')}</span></span>${ctl('language', T('language'), seg('language', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']]))}</div>
        ${s.school ? '' : `<div class="set" style="flex-wrap: wrap" data-menu="setting" data-key="funnyLevels" data-search="funny level humour english cantonese"><span class="stack grow" style="flex: 1 1 170px"><span class="t" style="font-weight: 600">${T('funny')}</span><span class="small">Styles every message, errors included. Both start at 5. Facts never change.</span></span>${info('funnyLevels', T('funny'))}
          ${[['en', 'English'], ['yue', '廣東話']].map(([k, l]) => `<span class="row" style="flex: 1 1 100%; gap: 10px"><label for="fl-${k}" style="width: 70px">${l}</label><input id="fl-${k}" type="range" min="1" max="5" value="${s.funnyLevels[k]}" data-funny="${k}" style="flex: 1; min-width: 0" aria-valuetext="${s.funnyLevels[k]} of 5"><span class="badge ac" style="width: 28px; justify-content: center; padding: 0">${s.funnyLevels[k]}</span></span>`).join('')}
          <span class="card" style="flex: 1 1 100%; background: var(--s1); padding: 12px 14px; margin-top: 10px; gap: 2px"><span class="small">Preview</span><span>${esc(Lib.funny('success', s.funnyLevels, s.language))}</span></span></div>`}
        ${s.school ? '' : tog('emoji', T('emoji'), 'Adds emoji to some messages')}
        ${tog('narration', T('narration'), voices.length ? 'Uses a voice installed on this computer' : 'No voices found on this computer')}
        ${s.narration && voices.length ? [['en', 'English voice', /^en/i], ['yue', 'Cantonese voice', /^(yue|zh-HK)/i]].map(([k, l, re]) => { const list = voices.filter(v => re.test(v.lang)); return `<div class="set" data-search="voice ${l}"><label class="grow" for="vc-${k}">${l}</label>${list.length ? `<select id="vc-${k}" data-voice="${k}" style="max-width: 220px"><option value="">System default</option>${list.map(v => `<option ${v.name === s.voices?.[k] ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : `<span class="badge mute">No ${k === 'yue' ? 'Cantonese' : 'English'} voice installed</span>`}</div>`; }).join('') + `<div class="set" data-search="voice pitch speed rate"><label class="grow" for="vp">Pitch</label><input id="vp" type="range" min="0.5" max="2" step="0.1" value="${s.pitch}" data-range="pitch" style="width: 130px"><span class="badge ac mono">${s.pitch}</span></div><div class="set" data-search="voice speed rate"><label class="grow" for="vr">Speed</label><input id="vr" type="range" min="0.5" max="2" step="0.1" value="${s.rate}" data-range="rate" style="width: 130px"><span class="badge ac mono">${s.rate}</span></div><button class="btn text" data-act="voice-try" style="align-self: flex-start">${ic('play_arrow')}Try this voice</button>` : ''}
        ${tog('sounds', T('sounds'), 'Soft cues for deploy, success and errors')}
      </div></div>
      <div class="side">
        <div class="drop idle" style="flex-direction: column; align-items: flex-start; gap: 12px; padding: 22px" data-menu="setting" data-key="vocabulary" data-search="personal wording vocabulary json">${info('vocabulary', T('vocabulary'))}<div class="row"><span class="tile ac">${ic('dictionary', 'fill')}</span><span class="stack"><span style="font-weight: 650">${T('vocabulary')}</span><span class="small">${s.vocabulary ? Object.keys(s.vocabulary.entries).length + ' words active' : 'Drop a vocabulary JSON anywhere in the app'}</span></span></div><span class="small">Format: {"version": 1, "entries": {"Deploy": "Ship"}}. Stays on this computer. Applied all at once or not at all.</span><span class="row" style="gap: 8px"><label class="btn tonal" for="vf">Choose file</label><input id="vf" type="file" accept="application/json,.json" class="sr" data-file="vocab"><button class="btn text" data-act="vocab-clear" ${s.vocabulary ? '' : 'disabled'}>Clear</button></span></div>
        <div class="card" style="gap: 0"><span class="h2" style="padding-bottom: 6px">Focus and comfort</span>
          <span class="small" style="padding: 4px 0 6px">Attention modes: each is separate and off until you turn it on. Interface options only, not medical advice.</span>
          ${tog('focus', 'Focus', 'Dims everything except the row or card you are on')}${tog('calm', 'Low stimulation', 'Quieter colour, no extra motion, only notifications that need you')}${tog('timeAware', 'Time awareness', 'Time open and since the last change, in the title bar')}${tog('oneThing', 'One thing at a time', 'Keeps the next action you chose in view')}${tog('momentum', 'Momentum', 'A gentle note when a draft sits untouched')}${tog('school', T('school'), 'Hides playful extras everywhere')}
          ${s.school ? '' : `<div class="set" style="flex-wrap: wrap" data-search="dim sum surprise"><span class="stack grow"><span class="t" style="font-weight: 600">${T('dim_sum')}</span><span class="small">A rare treat at launch</span></span><button class="toggle on" role="switch" aria-checked="true" aria-label="${T('dim_sum')}" data-act="troll"></button>${S.troll ? `<span class="card pop" style="flex: 1 1 100%; flex-direction: row; gap: 10px; align-items: center; padding: 10px 14px; margin-top: 10px; background: var(--warn-c)" role="status">${ic('lock', 'fill')}<span class="small" style="color: var(--tx)">${T('dim_sum_troll')}${emojiOn() ? ' 🥟' : ''}</span></span>` : ''}</div>`}
        </div>
        ${logoCard()}
        <div class="card" data-search="toy locks lock pin password totp support tickets"><span class="h2">Toy locks</span><span class="small">Right-click anything and choose Lock this element… Just for fun, never security.</span>${(S.lockState?.locks || []).map(l => `<div class="li static" style="padding: 6px 0">${ic('lock', 'sm')}<span class="stack grow"><span class="t">${esc(l.label)}</span><span class="m">${esc(POLICY_LABEL[l.policy])}${l.waitMs ? ' · waiting' : ''}</span></span></div>`).join('') || '<span class="small">No locks yet.</span>'}<span class="small" style="color: var(--tx)">${esc(recoveryLine())}</span><button class="btn text" data-go="support" style="align-self: flex-start">${ic('support_agent')}Support Tickets</button></div>
        <div class="card" style="gap: 0" data-menu="setting" data-key="a11y" data-search="accessibility text size contrast focus targets read aloud button hidden"><div class="set">${info('a11y', 'Accessibility tools')}<span class="stack grow"><span class="t" style="font-weight: 600">Accessibility tools</span><span class="small">${s.a11y.hidden ? 'Title bar button hidden' : 'Button in the title bar'} · text ${s.a11y.textSize}%</span></span><button class="btn tonal" data-panel-open="a11y">Open</button>${s.a11y.hidden ? '<button class="btn text" data-act="a11y-show">Show button</button>' : ''}</div></div>
        <div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn text" data-panel-open="export:settings">${ic('download')}Export settings</button><button class="btn text" data-go="history">${ic('history')}Local history</button></div>
      </div></div>`);
  }
  function updatesCard() {
    const u = S.update || { status: 'idle' };
    const label = { idle: ['mute', 'Waiting for first check'], checking: ['mute', 'Checking'], 'up-to-date': ['ok', 'Up to date'], downloading: ['ac', 'Downloading'], ready: ['ac', 'Ready to install ' + (u.next || '')], failed: ['err', 'Failed'], 'not-installed': ['mute', 'Not installed'] }[u.status] || ['mute', u.status];
    const detail = u.status === 'failed' ? esc(u.error) : u.status === 'not-installed' ? (browser ? 'Updates are managed on the companion server.' : 'Running from source or an unpacked build; updates come from a new installer or your checkout.') : u.checkedAt ? 'Last checked ' + esc(stamp(u.checkedAt)) : 'Checks at start and every 4 hours';
    return `<div class="card"><div class="row"><span class="tile ac">${ic('update', 'fill')}</span><span class="stack grow"><span class="h2">Updates</span><span class="small">${detail}</span></span></div><span class="badge ${label[0]}" style="align-self: flex-start">${esc(label[1])}</span><button class="btn tonal" data-act="update-check" style="align-self: flex-start" ${u.status === 'not-installed' ? 'disabled' : ''}>${ic('refresh')}Check for updates</button></div>`;
  }
  function aboutBody() {
    const p = S.prov; if (!p) return '';
    const cn = p.codeName;
    return `${cn?.available ? `<div class="row">${cn.photo ? `<img src="${esc(cn.photo)}" alt="${esc(cn.alt || cn.en)}" style="width: 72px; height: 72px; border-radius: 16px; object-fit: cover; background: var(--s4)">` : ''}<span class="stack"><span class="label">CODE NAME</span><span style="font-weight: 650">${esc(cn.en)} · ${esc(cn.zh)}</span></span></div>` : ''}
      <dl class="kv" style="margin: 0"><dt>Version</dt><dd class="mono">${esc(p.version)}</dd><dt>Built</dt><dd class="mono">${p.ok ? esc(stamp(p.builtAt)) : 'Unavailable: not a release build'}</dd>${p.ok ? `<dt>Commit</dt><dd class="mono"><button class="btn text mono" style="padding: 0; height: auto" data-act="open-url" data-url="https://github.com/Ding-Ding-Projects/aws-app-deployer/commit/${esc(p.commit)}">${esc(p.commit.slice(0, 7))}</button></dd>` : ''}<dt>${browser ? 'Runtime' : 'Installer'}</dt><dd>${browser ? 'Browser companion' : 'Squirrel, unsigned'}</dd></dl>`;
  }
  function viewHelp() {
    return page(T('nav_help'), '', `<div class="cols"><div class="wide"><div class="card"><span class="h2">Keyboard</span><dl class="kv" style="margin: 0"><dt><span class="kbd">Ctrl+Shift+F</span></dt><dd>Command palette with regex search</dd><dt><span class="kbd">Ctrl+N</span></dt><dd>New deployment</dd><dt><span class="kbd">Ctrl+,</span></dt><dd>Settings</dd><dt><span class="kbd">Esc</span></dt><dd>Close palette or panel</dd></dl></div>
      <div class="card"><span class="h2">What a deployment creates</span><span class="sub">A VPC across two availability zones, a public Application Load Balancer, one NAT gateway, two Fargate tasks in private subnets, an ECR repository with an immutable image, and CloudWatch logs. These cost money until you delete them in AWS.</span></div>
      <div class="card"><span class="h2">Not supported yet</span><span class="sub">Multi-service Compose, volumes, Compose secrets, adjustable task size, custom-domain HTTPS from the app, automatic updates from a repository, and deleting a deployment from the app.</span></div></div>
      <div class="side">${updatesCard()}<div class="card"><span class="h2">About</span>${aboutBody()}<span class="small">Free, source on GitHub. Not affiliated with Amazon Web Services.</span><button class="btn out" data-act="open-url" data-url="https://github.com/Ding-Ding-Projects/aws-app-deployer" style="align-self: flex-start">${ic('code')}Source</button><button class="btn text" data-go="support" style="align-self: flex-start">${ic('support_agent')}Support Tickets</button><button class="btn text" data-go="changelog" style="align-self: flex-start">${ic('new_releases')}Changelog</button><button class="btn text" data-go="docs" style="align-self: flex-start">${ic('menu_book')}Docs</button><button class="btn text" data-go="setup" style="align-self: flex-start">Run setup again</button></div></div></div>`);
  }

  // ---------- overlays ----------
  const COMMANDS = [
    { id: 'new', label: 'Deploy new application', keywords: 'new wizard', run: () => go('wizard') },
    { id: 'deploys', label: 'Deployments', run: () => go('deploys') }, { id: 'accounts', label: 'Accounts and sign-in', keywords: 'aws login profile', run: () => go('accounts') },
    { id: 'settings', label: 'Settings', run: () => go('settings') }, { id: 'setup', label: 'Setup and tool check', keywords: 'install prerequisites', run: () => go('setup') },
    { id: 'help', label: 'Help and keyboard shortcuts', run: () => go('help') }, { id: 'theme', label: 'Toggle dark and light theme', run: () => set('theme', S.settings.theme === 'dark' ? 'light' : 'dark') },
    { id: 'motion', label: 'Toggle reduce motion', run: () => set('reduceMotion', !S.settings.reduceMotion) }, { id: 'export', label: 'Export history', run: () => api.exportHistory() },
    { id: 'history', label: 'Local history', keywords: 'undo restore revisions', run: () => go('history') },
    { id: 'changelog', label: 'Changelog', keywords: 'versions releases', run: () => go('changelog') },
    { id: 'docs', label: 'Docs', keywords: 'help articles offline', run: () => go('docs') },
    { id: 'export', label: 'Export settings, history or records', keywords: 'export json csv yaml markdown zip', run: () => openPanel('export:settings') },
    { id: 'support', label: 'Support Tickets', keywords: 'locked out forgot pin password', run: () => go('support') },
    { id: 'updates', label: 'Check for updates', keywords: 'update upgrade version', run: async () => { S.update = await api.checkUpdates(); go('help'); } },
    { id: 'notes', label: 'Notifications', run: () => openPanel('notes') },
    { id: 'a11y', label: 'Accessibility tools', keywords: 'text size contrast focus targets read aloud', run: () => openPanel('a11y') },
    { id: 'a11y-show', label: 'Show the accessibility button', keywords: 'accessibility hidden restore', run: () => setA11y({ hidden: false }) },
    { id: 'keys', label: 'Keyboard help', keywords: 'shortcuts', run: () => openPanel('keys') },
  ];
  function paletteHtml() {
    const P = S.palette; if (!P) return '';
    const r = Lib.search(COMMANDS, P.q, { regex: P.regex });
    const items = r.ok ? r.items : [];
    P.items = items; P.sel = Math.min(P.sel, Math.max(0, items.length - 1));
    return `<div class="overlay"><div class="scrim" data-act="close-palette" style="align-items: start; padding-top: 72px"><div class="dialog" role="dialog" aria-label="${T('palette')}" style="width: min(680px, 100%); padding: 10px; gap: 0" data-stop="1">
      <div class="row" style="padding: 8px 10px; gap: 10px; flex-wrap: wrap">${ic('search')}<label for="pq" class="sr">Command</label><input id="pq" class="mono" data-input="paletteQ" value="${esc(P.q)}" autocomplete="off" style="flex: 1 1 200px; min-width: 0; height: 40px; border: 0; background: transparent; color: var(--tx); font-size: 16px; outline: none"><button class="badge ${P.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" aria-pressed="${P.regex}" data-act="regex">.* Regex</button></div>
      ${P.regex && P.q ? `<div class="row small" style="padding: 4px 12px 10px; gap: 8px; flex-wrap: wrap">${r.ok ? (r.parts || []).map(p => `<span class="row" style="gap: 6px; white-space: nowrap"><span class="badge mute mono">${esc(p.token)}</span>${esc(p.meaning)}</span>`).join('') + `<span class="badge ok">${ic('check', 'sm')}valid · ${items.length} matches</span>` : `<span class="badge err">${esc(r.error)}</span>`}</div>` : ''}
      <div class="divider"></div><div class="list" style="background: transparent" role="listbox">${items.map((c, i) => `<button class="li ${i === P.sel ? 'sel' : ''}" role="option" aria-selected="${i === P.sel}" data-cmd="${c.id}">${esc(c.label)}${isLocked('go:' + c.id) || isLocked('panel:' + c.id) ? ` <span class="badge warn">${ic('lock', 'sm')}Locked</span>` : ''}</button>`).join('') || '<span class="small" style="padding: 12px">No matches</span>'}</div>
      <div class="row small" style="padding: 8px 12px; gap: 14px"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">Enter</span> run</span><span><span class="kbd">Esc</span> close</span></div></div></div></div>`;
  }
  function drawerHtml() {
    if (!S.drawer) return '';
    return `<div class="drawer" role="region" aria-label="${T('notifications')}"><div class="row"><span class="h2">${T('notifications')}</span><span class="grow"></span><button class="btn text" data-act="clear-notes">${T('clear_all')}</button><button class="btn text" data-act="drawer" aria-label="Close">${ic('close')}</button></div>
      ${S.notes.map(n => `<div class="li static" style="padding: 8px 0"><span class="tile ${n.kind === 'err' ? 'err' : 'ok'}">${ic(n.kind === 'err' ? 'error' : 'check_circle', 'fill')}</span><span class="stack grow"><span class="t">${esc(n.text)}</span><span class="m">${esc(n.at)}</span></span></div>`).join('') || '<span class="small">Nothing yet</span>'}</div>`;
  }
  function dimsumHtml() {
    const d = S.dimsum; if (!d) return '';
    return `<div class="dimsum" role="status">${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.alt || d.en)}">` : `<span class="tile warn" style="width: 64px; height: 64px">${ic('ramen_dining', 'lg fill')}</span>`}<span class="stack"><span class="small">Dim sum surprise</span><span style="font-weight: 650">${esc(d.en)} · ${esc(d.zh)}</span></span></div>`;
  }
  function dismissToast(id) { S.toasts = S.toasts.filter(t => t.id !== id); renderToasts(); }
  function renderToasts() {
    let el = document.getElementById('toasts'); if (!el) { el = document.createElement('div'); el.id = 'toasts'; el.className = 'toasts'; document.body.appendChild(el); }
    el.innerHTML = S.toasts.map(t => `<div class="toast" role="${t.kind === 'err' ? 'alert' : 'status'}" tabindex="-1">${ic(t.kind === 'err' ? 'error' : 'check_circle', 'fill')}<span style="flex: 1">${esc(t.text)}</span><button class="btn text" data-toast="${t.id}" aria-label="Dismiss notification">${ic('close')}</button></div>`).join('');
    el.querySelectorAll('[data-toast]').forEach(b => (b.onclick = () => dismissToast(b.dataset.toast)));
  }


  // ---------- anchored panels: accessibility, notifications, info, keyboard help ----------
  function openPanel(id, anchor) { if (!['unlock', 'lockwiz', 'appearance'].includes(id) && guard('panel:' + id.split(':')[0])) return; S.panel = { id, anchor: anchor || null }; S.infoStep = 0; render(); setTimeout(() => document.querySelector(`[data-panel="${id.split(':')[0]}"] [data-autofocus]`)?.focus(), 30); }
  function closePanel() { const a = S.panel?.anchor; S.panel = null; render(); if (a) document.querySelector(a)?.focus(); }
  async function setA11y(patch) { await set('a11y', { ...S.settings.a11y, ...patch }); }
  function panelFrame(id, title, body, anchorStyle) {
    const saved = S.settings.ui?.panels;
    return `<section class="panel" data-panel="${id}" role="dialog" aria-label="${esc(title)}" style="${Kit.panelStyle(id, saved, anchorStyle)}"><header data-drag="1"><span class="h2" style="flex: 1">${esc(title)}</span><button class="btn text" data-act="panel-reset" data-id="${id}" title="Reset size and position" aria-label="Reset panel size and position">${ic('restart_alt')}</button><button class="btn text" data-act="panel-close" aria-label="Close" data-autofocus="1">${ic('close')}</button></header><div class="pb">${body}</div></section>`;
  }
  function panelHtml() {
    const P = S.panel; if (!P) return '';
    const right = 'top: 46px; right: 12px; width: 380px;';
    if (P.id === 'a11y') {
      const a = S.settings.a11y;
      const sw = (k, label) => `<div class="set"><span class="grow">${label}</span><button class="toggle ${a[k] ? 'on' : ''}" role="switch" aria-checked="${a[k]}" aria-label="${label}" data-a11y="${k}"></button></div>`;
      return panelFrame('a11y', 'Accessibility tools', `<div class="set"><label class="grow" for="ts">Text size</label><input id="ts" type="range" min="80" max="160" step="10" value="${a.textSize}" data-a11y-size="1" style="width: 140px"><span class="badge ac">${a.textSize}%</span></div>
        ${sw('contrast', 'High contrast')}<div class="set"><span class="grow">Reduce motion</span><button class="toggle ${S.settings.reduceMotion ? 'on' : ''}" role="switch" aria-checked="${S.settings.reduceMotion}" aria-label="Reduce motion" data-toggle="reduceMotion"></button></div>${sw('focus', 'Always show focus')}${sw('targets', 'Larger targets')}
        <button class="btn tonal" data-cmd="keys">${ic('keyboard')}Keyboard help <span class="kbd">${Kit.keysFor('keys')}</span></button><button class="btn tonal" data-act="read-aloud">${ic('record_voice_over')}Read this screen aloud</button>
        <button class="btn text" data-act="a11y-reset">Reset accessibility tools</button><div class="divider"></div><button class="btn text" style="color: var(--tx3)" data-act="a11y-hide">${ic('visibility_off')}Hide this button…</button>`, right);
    }
    if (P.id === 'a11y-hide') return panelFrame('a11y-hide', 'Hide the accessibility button?', `<span class="sub">The button leaves the title bar. Your accessibility choices stay on. Bring it back from Settings search, the command palette, or Reset accessibility tools.</span><div class="row" style="justify-content: flex-end"><button class="btn fillb" data-act="panel-close" data-autofocus="1">Cancel</button><button class="btn out" data-act="a11y-hide-yes">Hide it</button></div>`, right);
    if (P.id === 'keys') return panelFrame('keys', 'Keyboard help', `<dl class="kv" style="margin: 0">${[['palette', 'Command palette with regex search'], ['new', 'New deployment'], ['settings', 'Settings'], ['keys', 'Keyboard help'], ['menu', 'Context menu for the focused element'], ['panelMove', 'Move a focused panel (add Shift to resize)']].map(([k, l]) => `<dt><span class="kbd">${esc(Kit.keysFor(k) || { menu: 'Shift+F10', panelMove: 'Alt+Arrows' }[k])}</span></dt><dd>${l}</dd>`).join('')}<dt><span class="kbd">Esc</span></dt><dd>Clear a filter, then close</dd></dl>`, 'top: 90px; left: calc(50% - 220px); width: 440px;');
    if (P.id === 'notes') {
      const r = Lib.search(S.notes.map(n => ({ ...n, label: n.text })), S.noteQ, { regex: S.noteRegex });
      const list = r.ok ? r.items : [];
      const open = !!S.settings.ui?.filtersOpen?.notes || !!S.noteQ;
      return panelFrame('notes', T('notifications'), `<button class="collapser" data-act="filters" data-id="notes" aria-expanded="${open}">${ic(open ? 'expand_less' : 'expand_more', 'sm')}Search${S.noteQ ? ` <span class="badge ac">filter active: ${list.length} of ${S.notes.length}</span>` : ''}</button>
        ${open ? `<div class="row" style="gap: 6px"><label class="sr" for="nq">Search notifications</label><input id="nq" class="mono" data-input="noteQ" value="${esc(S.noteQ)}" placeholder="Search" style="flex: 1; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"><button class="badge ${S.noteRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="note-regex" aria-pressed="${S.noteRegex}">.*</button></div>${!r.ok ? `<span class="badge err">${esc(r.error)}</span>` : ''}` : ''}
        <div class="row" style="flex-wrap: wrap; gap: 6px"><button class="btn text" data-act="note-all">Select all ${list.length} shown</button><button class="btn text" data-act="note-invert">Invert</button><span class="grow"></span><button class="btn text" data-act="note-copy" ${S.noteSel.size ? '' : 'disabled'}>Copy ${S.noteSel.size || ''}</button><button class="btn text" data-act="note-dismiss" ${S.noteSel.size ? '' : 'disabled'}>Dismiss ${S.noteSel.size || ''}</button></div>
        ${list.map(n => `<label class="li static" style="padding: 8px 0"><input type="checkbox" class="check" data-note="${n.id}" ${S.noteSel.has(n.id) ? 'checked' : ''}><span class="tile ${n.kind === 'err' ? 'err' : 'ok'}">${ic(n.kind === 'err' ? 'error' : 'check_circle', 'fill')}</span><span class="stack grow"><span class="t">${esc(n.text)}</span><span class="m">${esc(n.at)}</span></span></label>`).join('') || '<span class="small">Nothing here</span>'}`, right + ' height: 520px;');
    }
    if (P.id === 'newtab') return newTabPanel();
    if (P.id === 'lockwiz') return lockWizPanel();
    if (P.id === 'appearance') return appearancePanel();
    if (P.id === 'unlock') return unlockPanel();
    if (P.id.startsWith('export:')) return exportPanel(P.id.slice(7));
    if (P.id.startsWith('info:')) {
      const key = P.id.slice(5), ex = Lib.EXPLAIN[key];
      if (!ex) return '';
      const src = S.sources[key] === 'file' ? 'Value from your settings file.' : `Using the built-in default: ${JSON.stringify(S.defaults[key])}.`;
      const step = Math.min(S.infoStep, ex.steps.length - 1);
      return panelFrame('info', 'About this setting', `<span class="label">WHAT IT DOES</span><span>${esc(ex.what)}</span><span class="small mono">${esc(src)}</span>
        <span class="label" style="margin-top: 4px">TRY IT · STEP ${step + 1} OF ${ex.steps.length}</span><span>${esc(ex.steps[step])}</span>
        <div class="row" style="gap: 10px"><button class="toggle ${S.practice[key] ? 'on' : ''}" role="switch" aria-checked="${!!S.practice[key]}" aria-label="Practice switch" data-act="practice" data-key="${key}"></button><span class="small grow">Practice only: your real setting does not change.</span></div>
        <div class="row" style="justify-content: flex-end"><button class="btn text" data-act="info-step" data-d="-1" ${step ? '' : 'disabled'}>${T('back')}</button><button class="btn tonal" data-act="info-step" data-d="1" ${step < ex.steps.length - 1 ? '' : 'disabled'}>${T('next')}</button></div>`, 'top: 120px; left: calc(50% - 200px); width: 400px;');
    }
    return '';
  }

  // ---------- context menus ----------
  function menuFor(el) {
    const items = [];
    const m = el.closest('[data-menu]'); const kind = m?.dataset.menu;
    if (kind === 'deploy') {
      const at = m.dataset.at, d = S.history.deployments.find(x => (x.id || x.at) === at);
      if (d?.url) items.push({ label: 'Open link', icon: 'open_in_new', run: () => api.openExternal(d.url) }, { label: 'Copy link', icon: 'content_copy', shortcut: 'copyLink', run: () => copy(d.url) });
      items.push({ label: S.depSel.has(at) ? 'Deselect' : 'Select', icon: 'check_box', run: () => { S.depSel.has(at) ? S.depSel.delete(at) : S.depSel.add(at); render(); } });
      items.push({ label: 'Export this record', icon: 'download', run: () => exportRecords([d]) });
      items.push({ label: 'Remove from history…', icon: 'delete', danger: true, shortcut: 'remove', run: o => removeRecords([at], o) });
    } else if (kind === 'tab') { const id = m.dataset.tab; if (id !== 'ws') items.push({ label: 'Close tab', icon: 'close', run: () => closeTabs([id]) }); const others = S.tabs.filter(t => t.id !== 'ws' && t.id !== id).map(t => t.id); items.push({ label: `Close ${others.length} other tab${others.length === 1 ? '' : 's'}`, icon: 'tab_close', disabled: !others.length, run: () => closeTabs(others) }); }
    else if (kind === 'nav') items.push({ label: 'Open', icon: 'arrow_forward', run: () => go(m.dataset.go) });
    else if (kind === 'setting') { const k = m.dataset.key; items.push({ label: 'About this setting', icon: 'info', run: () => openPanel('info:' + k) }, { label: 'Reset to default', icon: 'restart_alt', run: async () => { const r = await api.resetSetting(k); if (r.ok) { S.settings[k] = r.value; await refreshSources(); applyAppearance(); render(); } } }); }
    else if (kind === 'a11y') items.push({ label: 'Open accessibility tools', icon: 'accessibility_new', run: () => openPanel('a11y') }, { label: 'Hide this button…', icon: 'visibility_off', run: () => openPanel('a11y-hide') });
    const field = el.closest('input, textarea');
    if (field) items.push({ label: 'Cut', icon: 'content_cut', run: () => document.execCommand('cut') }, { label: 'Copy', icon: 'content_copy', run: () => document.execCommand('copy') }, { label: 'Paste', icon: 'content_paste', run: async () => { field.focus(); document.execCommand('insertText', false, await navigator.clipboard.readText()); } }, { label: 'Select all', icon: 'select_all', run: () => field.select() });
    const sel = String(getSelection() || '').trim(), txt = (el.closest('[data-menu],.card,.li,.btn,.chip,h1,.h2,dd,dt,span,div') || el).innerText?.trim();
    items.push({ label: sel ? 'Copy selected text' : 'Copy this text', icon: 'content_copy', disabled: !(sel || txt), run: () => copy(sel || txt) });
    const k = elKey(el);
    if (k) {
      const has = lockSet().has(k.key);
      items.push({ label: 'Edit appearance…', icon: 'format_paint', run: () => openAppearance(k) });
      if (!has) items.push({ label: 'Lock this element…', icon: 'lock', run: () => openLockWizard(k) });
      else { items.push({ label: isLocked(k.key) ? 'Unlock…' : 'Lock again', icon: isLocked(k.key) ? 'lock_open' : 'lock', run: () => { if (isLocked(k.key)) openUnlock(k); else { delete S.unlocked[k.key]; render(); } } }); items.push({ label: 'Remove this lock…', icon: 'no_encryption', run: () => { S.unlock = { key: k.key, label: k.label, pin: '', password: '', totp: '', duration: 'once', remove: true }; openPanel('unlock'); } }); }
    }
    items.push({ label: 'Command palette', icon: 'search', shortcut: 'palette', run: () => togglePalette() }, { label: 'Keyboard help', icon: 'keyboard', shortcut: 'keys', run: () => openPanel('keys') });
    return items;
  }
  async function copy(text) { await navigator.clipboard.writeText(text); toast(Lib.t('copied', S.settings.language)); }
  root.addEventListener('contextmenu', e => { e.preventDefault(); Kit.openMenu(menuFor(e.target), { x: e.clientX, y: e.clientY, opener: e.target.closest('button,a,input,[tabindex]') || e.target, title: 'Actions' }); });
  function menuFromKeyboard() { const el = document.activeElement && root.contains(document.activeElement) ? document.activeElement : root; const r = el.getBoundingClientRect(); Kit.openMenu(menuFor(el), { x: r.left + 12, y: r.bottom + 4, opener: el, title: 'Actions' }); }

  // ---------- records: filter, select, export, remove ----------
  function exportRecords(list) {
    const blob = new Blob([JSON.stringify({ schema: 'aws-app-deployer.deployments/1', exportedAt: new Date().toISOString(), records: list }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `deployments-${list.length}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${list.length} record${list.length === 1 ? '' : 's'} as UTF-8 JSON`);
  }
  function removeRecords(ats, opener) {
    const names = S.history.deployments.filter(d => ats.includes(d.id || d.at)).map(d => d.name);
    Kit.superConfirm({ title: `Remove ${ats.length} record${ats.length === 1 ? '' : 's'} from history`, detail: `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''} on this computer. Nothing in AWS changes; the removal is kept in local history.`, confirmLabel: 'remove', opener,
      onConfirm: async () => { const r = await api.removeDeployments(ats); ats.forEach(a => S.depSel.delete(a)); await loadHistory(); toast(`Removed ${r.removed}${r.skipped ? `, skipped ${r.skipped} already gone` : ''}`); render(); } });
  }
  function filteredDeployments() {
    const d = [...S.history.deployments].reverse().filter(x => S.depStatus === 'all' || (S.depStatus === 'ok') === !!x.ok);
    const r = Lib.search(d.map(x => ({ ...x, label: `${x.name} ${x.region} ${x.error || ''}` })), S.depQ, { regex: S.depRegex });
    return r.ok ? { list: r.items, error: null } : { list: [], error: r.error };
  }
  async function refreshSources() { const r = await api.settings(); S.sources = r.sources || {}; S.defaults = r.defaults || {}; }


  // ---------- tabs ----------
  const CATALOG = [
    { view: 'history', label: 'Local history', icon: 'history', keywords: 'undo restore revisions' },
    { view: 'docs', label: 'Docs', icon: 'menu_book', keywords: 'help articles offline' },
    { view: 'changelog', label: 'Changelog', icon: 'new_releases', keywords: 'versions releases' },
    { view: 'tools', label: 'Tools: Base64 and file converter', icon: 'construction', keywords: 'base64 encode decode convert csv json yaml markdown image png jpeg webp editor vs code' },
    { view: 'settings', label: 'Settings', icon: 'tune' }, { view: 'help', label: 'Help and about', icon: 'help' },
    { view: 'support', label: 'Support Tickets', icon: 'support_agent', keywords: 'locked out forgot pin password' },
    { view: 'accounts', label: 'Accounts', icon: 'key' }, { view: 'deploys', label: 'Deployments', icon: 'rocket_launch' },
  ];
  function tabStrip() {
    return `<div class="tabs" role="tablist" aria-label="Open tabs">${S.tabs.map(t => { const c = t.id === 'ws' ? { label: 'Workspace', icon: 'rocket_launch' } : CATALOG.find(x => x.view === t.view); return `<span class="tab ${S.active === t.id ? 'on' : ''}" data-menu="tab" data-tab="${t.id}"><button class="tab-b" role="tab" aria-selected="${S.active === t.id}" data-tab-go="${t.id}">${ic(c.icon, 'sm')}${esc(c.label)}</button>${t.id === 'ws' ? '' : `<button class="tab-x" data-tab-close="${t.id}" aria-label="Close ${esc(c.label)} tab">${ic('close', 'sm')}</button>`}</span>`; }).join('')}<button class="chip" style="height: 30px; margin: 0 0 3px 6px; flex: none" data-panel-open="newtab">${ic('add', 'sm')}New tab</button></div>`;
  }
  function openTab(view) { const id = 't' + Math.random().toString(36).slice(2, 7); S.tabs.push({ id, view }); S.active = id; S.panel = null; render(); }
  function closeTabs(ids) { S.tabs = S.tabs.filter(t => t.id === 'ws' || !ids.includes(t.id)); if (!S.tabs.find(t => t.id === S.active)) S.active = 'ws'; render(); }
  function newTabPanel() {
    const r = Lib.search(CATALOG, S.tabQ || '', { regex: !!S.tabRegex });
    return panelFrame('newtab', 'New tab', `<div class="row" style="gap: 6px"><label class="sr" for="tq">Search the catalog</label><input id="tq" class="mono" data-input="tabQ" value="${esc(S.tabQ || '')}" placeholder="Search destinations" data-autofocus="1" style="flex: 1; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"><button class="badge ${S.tabRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="tab-regex" aria-pressed="${!!S.tabRegex}">.*</button></div>
      ${r.ok ? (S.tabRegex && S.tabQ ? `<div class="row small" style="gap: 6px; flex-wrap: wrap">${(r.parts || []).map(p => `<span class="row" style="gap: 4px; white-space: nowrap"><span class="badge mute mono">${esc(p.token)}</span>${esc(p.meaning)}</span>`).join('')}</div>` : '') + r.items.map(c => `<button class="mi" data-act="open-tab" data-view="${c.view}">${ic(c.icon, 'sm')}${esc(c.label)}</button>`).join('') : `<span class="badge err">${esc(r.error)}</span>`}`, 'top: 84px; left: 140px; width: 360px;');
  }

  // ---------- local history ----------
  function viewHistory() {
    const H = S.hist, all = (S.history.history || []).map((h, i) => ({ ...h, i, label: Lib.historyLabel(h), cat: Lib.historyCategory(h) })).reverse();
    const inRange = h => (!H.from || h.at.slice(0, 10) >= H.from) && (!H.to || h.at.slice(0, 10) <= H.to);
    const byDate = all.filter(inRange);
    const cats = ['All', ...new Set(all.map(h => h.cat))];
    const counts = Object.fromEntries(cats.map(c => [c, c === 'All' ? byDate.length : byDate.filter(h => h.cat === c).length]));
    const r = Lib.search(byDate.filter(h => H.cat === 'All' || h.cat === H.cat), H.q, { regex: H.regex });
    const list = r.ok ? r.items : [];
    const sel = all.find(h => h.i === H.sel) || list[0];
    const labels = S.history.labels || {};
    const detail = sel ? `<div class="card raise" style="border: 1px solid var(--line)"><span class="h2">Revision ${sel.i + 1}${labels[sel.i] ? ' · ' + esc(labels[sel.i]) : ''}</span><span class="small">${esc(stamp(sel.at))} · ${esc(sel.cat)}</span>
      <div class="diff"><span class="m">- ${esc(JSON.stringify(sel.before))}</span><span class="p">+ ${esc(JSON.stringify(sel.after))}</span></div>
      <span class="small">Restoring adds a new revision. History is never rewritten.</span>
      <div class="row" style="flex-wrap: wrap"><button class="btn fillb" data-act="hist-restore" data-i="${sel.i}" ${sel.key === 'vocabulary' || sel.key === 'deployments.restored' ? 'disabled' : ''}>${ic('restore')}Restore</button><label class="sr" for="hl">Label this revision</label><input id="hl" data-input="histLabel" placeholder="Label" value="${esc(labels[sel.i] || '')}" style="flex: 1 1 140px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"><button class="btn text" data-act="hist-label" data-i="${sel.i}">Save label</button></div></div>` : '';
    return page('Local history', `<button class="btn out" data-panel-open="export:history">${ic('download')}Export</button>`, `
      <div class="row" style="gap: 8px; flex-wrap: wrap"><label class="sr" for="hq">Search history</label><input id="hq" class="mono" data-input="histQ" value="${esc(H.q)}" placeholder="Search changes" style="flex: 1 1 220px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 12px"><button class="badge ${H.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="hist-regex" aria-pressed="${H.regex}">.* Regex</button>
        <label class="small" for="hf">From</label><input id="hf" type="date" data-input="histFrom" value="${esc(H.from)}" class="datein"><label class="small" for="ht">To</label><input id="ht" type="date" data-input="histTo" value="${esc(H.to)}" class="datein"></div>
      ${!r.ok ? `<span class="badge err">${esc(r.error)}</span>` : ''}
      <div class="row" style="gap: 6px; flex-wrap: wrap">${cats.map(c => `<button class="badge ${H.cat === c ? 'ac' : 'mute'}" style="border: 0; cursor: pointer" data-act="hist-cat" data-c="${esc(c)}" aria-pressed="${H.cat === c}">${esc(c)} ${counts[c]}</button>`).join('')}</div>
      <div class="cols"><div class="wide"><div class="list">${list.slice(0, 300).map(h => `<button class="li ${sel && sel.i === h.i ? 'sel' : ''}" data-act="hist-sel" data-i="${h.i}"><span class="stack grow"><span class="t">${esc(h.label)}</span><span class="m">${esc(stamp(h.at))} · revision ${h.i + 1}${labels[h.i] ? ' · ' + esc(labels[h.i]) : ''}</span></span></button>`).join('') || `<div class="empty" style="padding: 24px"><span class="h2">No changes ${H.q || H.from || H.to || H.cat !== 'All' ? 'match' : 'yet'}</span><span class="sub">Every settings change and record removal appears here.</span></div>`}</div>${list.length > 300 ? `<span class="small">Showing the newest 300 of ${list.length}. Narrow the filter to see older ones.</span>` : ''}</div><div class="side">${detail}</div></div>`);
  }

  // ---------- changelog ----------
  function viewChangelog() {
    const C = S.changelog, F = S.clog;
    if (!C) return page('Changelog', '', '<div class="sk" style="height: 120px"></div>');
    if (!C.ok) return page('Changelog', '', `<div class="empty"><span class="h2">Changelog unavailable</span><span class="sub">This is a development run; the changelog is generated when a release is built.</span></div>`);
    const blocks = [...(C.unreleased?.length ? [{ version: S.prov?.version ? `${S.prov.version} (this build)` : 'Unreleased', date: C.unreleased[0].date, changes: C.unreleased, sha: C.unreleased[0].sha }] : []), ...C.versions];
    const rx = F.q ? Lib.explainRegex(F.q) : null;
    const match = c => (!F.from || c.date.slice(0, 10) >= F.from) && (!F.to || c.date.slice(0, 10) <= F.to) && (!F.q || (F.regex ? rx.ok && rx.regex.test(c.subject) : c.subject.toLowerCase().includes(F.q.toLowerCase())));
    const shown = blocks.map(b => ({ ...b, changes: b.changes.filter(match) })).filter(b => b.changes.length);
    S.clogShown = shown;
    return page('Changelog', `<button class="btn out" data-act="clog-copy">${ic('content_copy')}Copy view</button><button class="btn out" data-act="clog-export">${ic('download')}Export</button>`, `
      <div class="row" style="gap: 8px; flex-wrap: wrap"><label class="sr" for="cq">Search changes</label><input id="cq" class="mono" data-input="clogQ" value="${esc(F.q)}" placeholder="Search changes" style="flex: 1 1 220px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 12px"><button class="badge ${F.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="clog-regex" aria-pressed="${F.regex}">.* Regex</button><label class="small" for="cf">From</label><input id="cf" type="date" class="datein" data-input="clogFrom" value="${esc(F.from)}"><label class="small" for="ct">To</label><input id="ct" type="date" class="datein" data-input="clogTo" value="${esc(F.to)}"></div>
      ${rx && !rx.ok && F.regex ? `<span class="badge err">${esc(rx.error)}</span>` : ''}
      ${shown.map(b => `<div class="card"><div class="row"><span class="h2">${esc(b.version)}</span><span class="small grow">${esc(stamp(b.date))}</span></div>${['Added', 'Changed', 'Fixed', 'Removed'].map(k => { const cs = b.changes.filter(c => c.kind === k); return cs.length ? `<span class="label">${k.toUpperCase()}</span>${cs.map(c => `<div class="row" style="gap: 10px; align-items: baseline"><button class="btn text mono" style="padding: 0; height: auto" data-act="open-url" data-url="${esc(C.repository)}/commit/${esc(c.sha)}" title="${esc(c.sha)}">${esc(c.sha.slice(0, 7))}</button><span>${esc(c.subject)}</span></div>`).join('')}` : ''; }).join('')}</div>`).join('') || '<div class="empty"><span class="h2">No changes match</span></div>'}`);
  }
  function changelogText() { return (S.clogShown || []).map(b => `## ${b.version} (${b.date.slice(0, 10)})\n` + b.changes.map(c => `- ${c.kind}: ${c.subject} (${c.sha})`).join('\n')).join('\n\n') + '\n'; }

  // ---------- offline docs ----------
  function viewDocs() {
    const D = S.docs, F = S.docF;
    if (!D) return page('Docs', '', '<div class="sk" style="height: 120px"></div>');
    if (!D.ok) return page('Docs', '', '<div class="empty"><span class="h2">Docs are missing from this build</span></div>');
    const r = Lib.search(D.docs.map(d => ({ ...d, label: d.title + ' ' + d.body })), F.q, { regex: F.regex });
    const list = r.ok ? r.items : [];
    const cur = D.docs.find(d => d.id === F.id) || list[0] || D.docs[0];
    return page('Docs', '', `<div class="cols"><div class="side" style="flex: 0 1 300px"><div class="row" style="gap: 6px"><label class="sr" for="dsq">Search docs</label><input id="dsq" class="mono" data-input="docQ" value="${esc(F.q)}" placeholder="Search titles and text" style="flex: 1; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 12px"><button class="badge ${F.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="doc-regex" aria-pressed="${F.regex}">.*</button></div>${!r.ok ? `<span class="badge err">${esc(r.error)}</span>` : ''}
      <div class="list">${list.map(d => `<button class="li ${cur && d.id === cur.id ? 'sel' : ''}" data-doc-open="${d.id}">${esc(d.title)}</button>`).join('') || '<span class="small" style="padding: 10px">No articles match</span>'}</div></div>
      <article class="wide card md" aria-label="${esc(cur?.title || '')}">${cur ? Lib.markdown(cur.body) : ''}</article></div>`);
  }

  // ---------- export panel ----------
  function exportPanel(what) {
    const fmt = S.exportFmt || 'json', F = Lib.FORMATS[fmt];
    const label = { history: 'local history', deploys: 'deployment records', settings: 'settings' }[what] || what;
    return panelFrame('export', `Export ${label}`, `<span class="seg" role="radiogroup">${[...Object.keys(Lib.FORMATS), 'zip'].map(k => `<button role="radio" aria-checked="${fmt === k}" class="${fmt === k ? 'on' : ''}" data-act="exp-fmt" data-f="${k}">${k === 'zip' ? 'ZIP (all)' : Lib.FORMATS[k].label}</button>`).join('')}</span>
      <span class="small">${fmt === 'zip' ? 'A ZIP with deployments, history and settings, each as JSON, plus CSV copies. Relative paths only.' : `UTF-8, LF line endings, schema aws-app-deployer.${what}/1. ${F.loss || 'Nothing is lost; the file can be imported back.'}`}</span>
      <div class="row" style="justify-content: flex-end"><button class="btn text" data-act="panel-close">${T('cancel')}</button><button class="btn fillb" data-act="exp-go" data-w="${what}" data-autofocus="1">${ic('download')}Save</button></div>`, 'top: 90px; right: 24px; width: 420px;');
  }
  function exportRows(what) {
    if (what === 'history') return (S.history.history || []).map((h, i) => ({ revision: i + 1, at: h.at, key: h.key, before: h.before, after: h.after, label: (S.history.labels || {})[i] || '' }));
    if (what === 'deploys') return S.history.deployments;
    return Object.entries(S.settings).filter(([k]) => k !== 'vocabulary').map(([key, value]) => ({ key, value, source: S.sources[key] || 'default' }));
  }
  async function doExport(what) {
    const fmt = S.exportFmt || 'json';
    if (fmt === 'zip') {
      const files = ['deploys', 'history', 'settings'].flatMap(w => [{ name: `${w}.json`, data: Lib.exportAs('json', `aws-app-deployer.${w}/1`, exportRows(w)) }, { name: `${w}.csv`, data: Lib.exportAs('csv', `aws-app-deployer.${w}/1`, exportRows(w)) }]);
      const r = await api.saveFile('aws-app-deployer-export.zip', Lib.zip(files)); if (r.ok) toast('Saved ZIP with ' + files.length + ' files'); return;
    }
    const r = await api.saveFile(`aws-app-deployer-${what}.${Lib.FORMATS[fmt].ext}`, Lib.exportAs(fmt, `aws-app-deployer.${what}/1`, exportRows(what)));
    if (r.ok) toast(`Saved ${Lib.FORMATS[fmt].label} export`);
  }


  // ---------- element keys (shared by locks and the appearance editor) ----------
  const KEYED = '[data-go],[data-act],[data-toggle],[data-set],[data-info],[data-tab-go],[data-panel-open],[data-cmd],[data-menu],[data-win],button,a,input,select,textarea,h1,.h2,.card,.li';
  function elKey(node) {
    const t = node?.closest?.(KEYED); if (!t || t.closest('.panel[data-panel="unlock"], .panel[data-panel="lockwiz"], .panel[data-panel="appearance"]')) return null;
    const d = t.dataset;
    const k = d.go ? 'go:' + d.go : d.tabGo ? 'tab:' + (S.tabs.find(x => x.id === d.tabGo)?.view || 'workspace') : d.toggle ? 'toggle:' + d.toggle : d.set ? `set:${d.set}=${d.val}` : d.act ? 'act:' + d.act + (d.key ? ':' + d.key : '') + (d.view ? ':' + d.view : '') : d.panelOpen ? 'panel:' + d.panelOpen : d.info ? 'info:' + d.info : d.cmd ? 'cmd:' + d.cmd : d.win ? 'win:' + d.win : d.menu ? `menu:${d.menu}:${d.key || d.at || d.tab || ''}` : t.id ? 'id:' + t.id : 'text:' + (t.tagName.toLowerCase()) + ':' + (t.innerText || '').trim().slice(0, 40).replace(/[^\w.\-]+/g, '-');
    return { key: k.slice(0, 160), el: t, label: (t.getAttribute('aria-label') || t.innerText || k).trim().split('\n')[0].slice(0, 60) };
  }

  // ---------- toy locks ----------
  const lockSet = () => new Set((S.lockState?.locks || []).map(l => l.id));
  function isLocked(key) { if (!lockSet().has(key)) return false; const u = S.unlocked[key]; return !(u === 'session' || (typeof u === 'number' && u > Date.now())); }
  async function refreshLocks() { S.lockState = await api.lockStatus(); }
  function guard(key) { if (isLocked(key)) { openUnlock({ key, label: (S.lockState.locks.find(l => l.id === key) || {}).label || key }); return true; } return false; }
  function openUnlock(k) { S.unlock = { key: k.key, label: k.label, pin: '', password: '', totp: '', duration: 'once', error: null, ladder: null }; openPanel('unlock'); }
  function openLockWizard(k) { S.lockWiz = { key: k.key, label: k.label, policy: 'pin', pin: '', pin2: '', password: '', password2: '', totp: null, code: '', error: null }; openPanel('lockwiz'); }
  document.addEventListener('click', e => {
    if (e.target.closest('.panel[data-panel="unlock"], .panel[data-panel="lockwiz"], .ctx, .sc, .toasts')) return;
    const k = elKey(e.target); if (k && isLocked(k.key)) { e.preventDefault(); e.stopImmediatePropagation(); openUnlock(k); }
  }, true);
  document.addEventListener('keydown', e => {
    if (!['Enter', ' '].includes(e.key) || e.target.closest?.('.panel[data-panel="unlock"], .panel[data-panel="lockwiz"], .ctx, .sc')) return;
    const k = elKey(e.target); if (k && isLocked(k.key)) { e.preventDefault(); e.stopImmediatePropagation(); openUnlock(k); }
  }, true);
  document.addEventListener('focusin', e => { if (!e.target.matches?.('input, select, textarea')) return; const k = elKey(e.target); if (k && isLocked(k.key)) { e.target.blur(); openUnlock(k); } });
  function decorateLocks() {
    const styled = S.settings.appearance?.elements || {}, editing = S.ap?.key;
    if (Object.keys(styled).length || editing) root.querySelectorAll(KEYED).forEach(el => { const k = elKey(el); if (k && k.el === el && (styled[k.key] || k.key === editing)) { el.dataset.ak = k.key; el.classList.toggle('ap-target', k.key === editing); } });
    const set = lockSet(); if (!set.size) return;
    root.querySelectorAll(KEYED).forEach(el => { const k = elKey(el); if (k && k.el === el && set.has(k.key)) { const locked = isLocked(k.key); el.classList.toggle('is-locked', locked); el.classList.toggle('was-locked', !locked); if (locked) { el.setAttribute('aria-disabled', 'true'); el.setAttribute('title', 'Locked for fun. Activate to unlock.'); } } });
  }
  const POLICY_LABEL = { pin: 'PIN', password: 'Password', 'pin+password': 'PIN plus password', 'password+totp': 'Password plus TOTP', 'pin+totp': 'PIN plus TOTP', 'password+pin+totp': 'Password plus PIN plus TOTP' };
  const recoveryLine = () => `Just for fun, never security. Locked out? Delete the app data folder: ${S.appdata || 'unavailable'}.`;
  function keypad(field) {
    return `<div class="pad" role="group" aria-label="PIN keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => `<button class="pk" data-act="pk" data-f="${field}" data-n="${n}" aria-label="Digit ${n}">${n}</button>`).join('')}<button class="pk" data-act="pk-back" data-f="${field}" aria-label="Backspace">${ic('backspace')}</button><button class="pk" data-act="pk" data-f="${field}" data-n="0" aria-label="Digit 0">0</button><button class="pk" data-act="pk-clear" data-f="${field}" aria-label="Clear">${ic('clear_all')}</button></div>`;
  }
  const masked = v => `<span class="dots" aria-live="polite" aria-label="${v.length} digits entered">${Array.from({ length: Math.max(4, v.length) }, (_, i) => `<i class="${i < v.length ? '' : 'e'}"></i>`).join('')}</span>`;
  function lockWizPanel() {
    const W = S.lockWiz, need = W.policy.split('+');
    if (S.lockState && !S.lockState.available) return panelFrame('lockwiz', 'Lock this element', `<span>Locks need the operating system's protected storage, which is not available here. Nothing was locked.</span>`, 'top: 90px; left: calc(50% - 220px); width: 440px;');
    const fld = (id, label, val, type = 'password', extra = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" data-lw="${id}" value="${esc(val)}" autocomplete="off" ${extra}></div>`;
    return panelFrame('lockwiz', `Lock "${W.label}"`, `<span class="small">Target: <span class="mono">${esc(W.key)}</span></span>
      <span class="label">CHOOSE ONE POLICY</span><div class="seg" role="radiogroup" style="flex-wrap: wrap">${Object.keys(POLICY_LABEL).map(p => `<button role="radio" aria-checked="${W.policy === p}" class="${W.policy === p ? 'on' : ''}" data-act="lw-policy" data-p="${p}">${POLICY_LABEL[p]}</button>`).join('')}</div>
      ${need.includes('pin') ? `${fld('lw-pin', 'PIN (4 to 12 digits)', W.pin, 'password', 'inputmode="numeric"')}${masked(W.pin)}${keypad('pin')}${fld('lw-pin2', 'Repeat PIN', W.pin2, 'password', 'inputmode="numeric"')}` : ''}
      ${need.includes('password') ? `${fld('lw-password', 'Password (6 or more characters)', W.password)}${fld('lw-password2', 'Repeat password', W.password2)}` : ''}
      ${need.includes('totp') ? (W.totp ? `<span class="label">SCAN WITH YOUR AUTHENTICATOR</span><div class="qr" aria-label="QR code for the authenticator">${W.totp.qr}</div><span class="small">Or enter this key: <span class="mono" style="overflow-wrap: anywhere">${esc(W.totp.secret.replace(/(.{4})/g, '$1 '))}</span></span>${fld('lw-code', 'Code from your authenticator', W.code, 'text', 'inputmode="numeric" maxlength="6"')}` : `<button class="btn tonal" data-act="lw-totp">${ic('qr_code_2')}Set up an authenticator</button>`) : ''}
      ${W.error ? `<span class="badge err">${esc(W.error)}</span>` : ''}
      <span class="small" style="color: var(--tx)">${esc(recoveryLine())}</span>
      <div class="row" style="justify-content: flex-end"><button class="btn text" data-act="panel-close">${T('cancel')}</button><button class="btn fillb" data-act="lw-create">${ic('lock')}Lock it</button></div>`, 'top: 70px; left: calc(50% - 230px); width: 460px; height: 640px;');
  }
  function unlockPanel() {
    const U = S.unlock, l = (S.lockState?.locks || []).find(x => x.id === U.key);
    if (!l) return panelFrame('unlock', 'Unlock', '<span>This element is not locked any more.</span>', 'top: 90px; left: calc(50% - 200px); width: 400px;');
    const need = l.policy.split('+');
    const body = U.ladder ? ladderHtml(l) : `<span class="small">${esc(POLICY_LABEL[l.policy])} · ${need.length} step${need.length > 1 ? 's' : ''}</span>
      ${need.map((f, i) => f === 'pin' ? `<div class="field"><label for="ul-pin">Step ${i + 1}: PIN</label><input id="ul-pin" type="password" inputmode="numeric" data-ul="pin" value="${esc(U.pin)}" autocomplete="off"></div>${masked(U.pin)}${keypad('upin')}` : f === 'password' ? `<div class="field"><label for="ul-password">Step ${i + 1}: Password</label><input id="ul-password" type="password" data-ul="password" value="${esc(U.password)}" autocomplete="off"></div>` : `<div class="field"><label for="ul-totp">Step ${i + 1}: Authenticator code</label><input id="ul-totp" inputmode="numeric" maxlength="6" data-ul="totp" value="${esc(U.totp)}" autocomplete="one-time-code"></div>`).join('')}
      <div class="field"><label for="ul-dur">Unlock for</label><select id="ul-dur" data-ul="duration"><option value="once" ${U.duration === 'once' ? 'selected' : ''}>This time only</option><option value="15" ${U.duration === '15' ? 'selected' : ''}>15 minutes</option><option value="session" ${U.duration === 'session' ? 'selected' : ''}>Until the app closes</option></select></div>
      ${U.error ? `<span class="badge err" role="alert">${esc(U.error)}</span>` : ''}
      ${l.waitMs ? `<button class="btn tonal" data-act="ladder-open">${ic('stairs')}Play the unlock ladder (${l.ladderLeft} left this hour)</button>` : ''}
      <span class="small" style="color: var(--tx)">${esc(recoveryLine())}</span>
      <div class="row" style="justify-content: space-between; flex-wrap: wrap"><button class="btn text" data-act="go-support">Forgotten your password?</button><span class="row" style="gap: 6px"><button class="btn text" data-act="panel-close">${T('cancel')}</button><button class="btn fillb" data-act="ul-go" ${l.waitMs ? 'disabled' : ''}>${ic('lock_open')}Unlock</button></span></div>`;
    return panelFrame('unlock', `Unlock "${U.label}"`, body, 'top: 70px; left: calc(50% - 210px); width: 420px; height: 620px;');
  }
  function ladderHtml(l) {
    const L = S.unlock.ladder, mins = Math.ceil(l.waitMs / 60000);
    const rungs = S.settings.school ? ['sums', 'mole', 'clock'] : ['dimsum', 'sums', 'mole', 'clock'];
    const names = { dimsum: 'Dim sum', sums: 'Ten sums', mole: 'Whack-a-mole', clock: 'The clock' };
    let game = '';
    if (L.challenge?.rung === 'dimsum') game = `<span class="h2">Which dish is this?</span><span>${esc(L.challenge.prompt)}</span><span class="small">${esc(L.challenge.zh)}</span>${L.challenge.choices.map((c, i) => `<button class="btn out" data-act="ld-dim" data-i="${i}">${esc(c)}</button>`).join('')}`;
    if (L.challenge?.rung === 'sums') game = `<span class="h2">Ten easy sums</span>${L.challenge.sums.map((q, i) => `<div class="row"><label for="sum${i}" style="flex: 1">${esc(q)} =</label><input id="sum${i}" inputmode="numeric" data-sum="${i}" value="${esc(L.sums?.[i] || '')}" style="width: 90px; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 8px"></div>`).join('')}<button class="btn fillb" data-act="ld-sums">Check</button>`;
    if (L.challenge?.rung === 'mole') game = `<span class="h2">Whack ten moles</span><span class="small" aria-live="polite">Hits ${L.hits?.size || 0} · ${L.left ?? Math.round(L.challenge.duration / 1000)} s left</span><div class="pad">${Array.from({ length: 9 }, (_, h) => { const m = L.up?.[h]; return `<button class="mole ${m ? 'up' : ''}" data-act="ld-mole" data-h="${h}" aria-label="Hole ${h + 1}${m ? ', mole up' : ''}">${m ? ic('pets', 'fill') : ''}</button>`; }).join('')}</div>`;
    if (L.challenge?.rung === 'clock') game = `<span class="h2">The clock</span><span>Waiting works too. About ${mins} minute${mins === 1 ? '' : 's'} left.</span>`;
    return `<span class="label">UNLOCK LADDER · ABOUT ${mins} MIN LEFT OR PLAY</span><div class="row" style="gap: 6px; flex-wrap: wrap">${rungs.map(r => `<button class="badge ${L.challenge?.rung === r ? 'ac' : 'mute'}" style="border: 0; cursor: pointer" data-act="ld-start" data-r="${r}">${names[r]}</button>`).join('')}</div>
      ${game || '<span class="small">Pick a rung. Each one you finish clears a share of the waiting time. It never clears the credential, and you can play up to 3 ladders an hour.</span>'}
      ${L.msg ? `<span class="badge ${L.ok ? 'ok' : 'err'}">${esc(L.msg)}</span>` : ''}
      <button class="btn text" data-act="ladder-close">Back to unlock</button>`;
  }
  async function ladderStart(rung) {
    const r = await api.ladderStart(S.unlock.key, rung);
    if (!r.ok) { S.unlock.ladder = { msg: { LADDER_LIMIT: 'That is 3 ladders this hour. The clock still works.', CATALOG_UNAVAILABLE: 'The dim sum catalog is unreachable; try the next rung.', NO_WAIT: 'There is no wait to clear.' }[r.error] || r.error }; render(); return; }
    S.unlock.ladder = { nonce: r.nonce, challenge: r.challenge, sums: [], hits: new Set(), up: {} };
    if (rung === 'mole') {
      const L = S.unlock.ladder, start = Date.now();
      r.challenge.moles.forEach(m => { setTimeout(() => { if (S.unlock?.ladder !== L) return; L.up[m.hole] = m.id; render(); setTimeout(() => { if (L.up[m.hole] === m.id) { delete L.up[m.hole]; render(); } }, 900); }, m.at); });
      const tick = setInterval(() => { if (S.unlock?.ladder !== L) return clearInterval(tick); L.left = Math.max(0, Math.round((r.challenge.duration - (Date.now() - start)) / 1000)); render(); if (Date.now() - start >= r.challenge.duration + 200) { clearInterval(tick); ladderAnswer([...L.hits]); } }, 500);
    }
    render();
  }
  async function ladderAnswer(answer) {
    const r = await api.ladderAnswer(S.unlock.ladder.nonce, answer);
    await refreshLocks();
    S.unlock.ladder = { msg: r.ok ? (r.passed ? 'Rung cleared. The wait just got shorter.' : 'Not this time. The wait is unchanged.') : r.error, ok: r.ok && r.passed };
    cue(r.passed ? 'ok' : 'err'); render();
  }


  // ---------- per-element appearance editor ----------
  const apStyleEl = document.head.appendChild(document.createElement('style')); apStyleEl.id = 'element-appearance';
  function applyElementStyles() { apStyleEl.textContent = Lib.appearanceCss(S.settings.appearance); }
  const apUndo = [], apRedo = []; let apSaveTimer;
  const apData = () => Lib.cleanAppearance(S.settings.appearance);
  function apCommit(next, { record = true } = {}) {
    if (record) { apUndo.push(JSON.stringify(apData())); if (apUndo.length > 100) apUndo.shift(); apRedo.length = 0; }
    S.settings.appearance = Lib.cleanAppearance(next); applyElementStyles();
    clearTimeout(apSaveTimer); apSaveTimer = setTimeout(async () => { const r = await api.setSetting('appearance', S.settings.appearance); if (r.ok) { S.sources.appearance = 'file'; } else toast('Appearance could not be saved: ' + r.error, 'err'); }, 300);
  }
  function apSet(prop, value, record = true) {
    const a = apData(), st = S.ap.state, el = { ...(a.elements[S.ap.key] || {}) }, props = { ...(el[st] || {}) };
    if (value === undefined) delete props[prop]; else props[prop] = value;
    el[st] = props; a.elements[S.ap.key] = el; apCommit(a, { record });
  }
  function apHistory(from, to) { if (!from.length) return; to.push(JSON.stringify(apData())); apCommit(JSON.parse(from.pop()), { record: false }); render(); }
  function openAppearance(k) { S.ap = { key: k.key, label: k.label, state: 'rest', preset: '' }; openPanel('appearance'); }
  function appearancePanel() {
    const A = S.ap, a = apData(), cur = a.elements[A.key]?.[A.state] || {}, P = Lib.AP_PROPS;
    const reset = k => `<button class="btn text" data-act="ap-reset" data-p="${k}" ${cur[k] === undefined ? 'disabled' : ''} aria-label="Reset ${P[k].label}">Reset</button>`;
    const row = (k, ctl) => `<div class="prop"><label for="ap-${k}">${P[k].label}</label>${ctl}${reset(k)}</div>`;
    const range = k => row(k, `<span class="row" style="gap: 6px"><input id="ap-${k}" type="range" min="${P[k].min}" max="${P[k].max}" step="${P[k].step}" value="${cur[k] ?? P[k].min}" data-ap="${k}" style="flex: 1; min-width: 0"><span class="badge ${cur[k] === undefined ? 'mute' : 'ac'} mono" style="min-width: 44px; justify-content: center">${cur[k] ?? 'auto'}</span></span>`);
    const col = k => row(k, `<span class="row" style="gap: 6px"><input id="ap-${k}" type="color" value="${cur[k] || '#6ea8ff'}" data-ap="${k}" style="width: 36px; height: 30px; border: 0; background: none; padding: 0"><span class="mono small">${cur[k] || 'auto'}</span></span>`);
    const style = ['italic', 'underline', 'strike', 'caps'].map(k => `<button class="badge ${cur[k] ? 'ac' : 'mute'}" style="border: 0; cursor: pointer; min-width: 34px; justify-content: center" aria-pressed="${!!cur[k]}" aria-label="${P[k].label}" data-act="ap-flag" data-p="${k}">${{ italic: '<i>I</i>', underline: '<u>U</u>', strike: '<s>S</s>', caps: 'AA' }[k]}</button>`).join('');
    const presets = Object.keys(a.presets);
    return panelFrame('appearance', `Edit appearance: "${A.label}"`, `<span class="small">Element <span class="mono">${esc(A.key)}</span>. Changes apply live and are saved to your settings.</span>
      <div class="seg" role="radiogroup" aria-label="State">${Object.keys(Lib.AP_STATES).map(st => `<button role="radio" aria-checked="${A.state === st}" class="${A.state === st ? 'on' : ''}" data-act="ap-state" data-s="${st}">${{ rest: 'Rest', hover: 'Hover', focus: 'Focus', pressed: 'Pressed' }[st]}${a.elements[A.key]?.[st] ? ' •' : ''}</button>`).join('')}</div>
      ${row('font', `<select id="ap-font" data-ap="font"><option value="">Default</option>${Object.entries(Lib.AP_FONT_LABELS).map(([v, l]) => `<option value="${v}" ${cur.font === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${range('size')}${range('weight')}
      <div class="prop"><span>Style</span><span class="row" style="gap: 4px">${style}</span><button class="btn text" data-act="ap-reset-flags" ${['italic', 'underline', 'strike', 'caps'].some(k => cur[k]) ? '' : 'disabled'}>Reset</button></div>
      ${range('spacing')}${col('color')}${col('background')}${col('border')}${range('radius')}${range('glow')}${range('opacity')}
      <div class="row" style="flex-wrap: wrap; gap: 4px"><button class="btn text" data-act="ap-undo" ${apUndo.length ? '' : 'disabled'} aria-keyshortcuts="Control+Z">${ic('undo')}Undo</button><button class="btn text" data-act="ap-redo" ${apRedo.length ? '' : 'disabled'} aria-keyshortcuts="Control+Y">${ic('redo')}Redo</button><button class="btn text" data-act="ap-copy" ${a.elements[A.key] ? '' : 'disabled'}>${ic('content_copy')}Copy style</button><button class="btn text" data-act="ap-paste" ${S.apClip ? '' : 'disabled'}>${ic('content_paste')}Paste style</button><button class="btn text" data-act="ap-reset-el" ${a.elements[A.key] ? '' : 'disabled'}>Reset element</button></div>
      <span class="label">PRESETS</span>
      <div class="row" style="gap: 6px; flex-wrap: wrap"><label class="sr" for="ap-pname">Preset name</label><input id="ap-pname" data-input="apPreset" value="${esc(A.preset)}" maxlength="40" placeholder="Preset name" style="flex: 1 1 140px; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"><button class="btn tonal" data-act="ap-preset-save" ${a.elements[A.key] ? '' : 'disabled'}>Save preset</button></div>
      ${presets.length ? `<div class="row" style="gap: 6px; flex-wrap: wrap">${presets.map(n => `<span class="row" style="gap: 2px"><button class="btn out" data-act="ap-preset-apply" data-n="${esc(n)}">${esc(n)}</button><button class="btn text" data-act="ap-preset-del" data-n="${esc(n)}" aria-label="Delete preset ${esc(n)}">${ic('close', 'sm')}</button></span>`).join('')}</div>` : '<span class="small">No presets yet. Style an element, name it and save.</span>'}
      <div class="divider"></div>
      <div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn text" data-act="ap-export">${ic('download')}Export styles</button><label class="btn text" style="cursor: pointer">${ic('upload')}Import styles<input type="file" accept="application/json,.json" data-file="style" class="sr"></label><span class="grow"></span><button class="btn text" style="color: var(--err)" data-act="ap-reset-all" ${Object.keys(a.elements).length ? '' : 'disabled'}>Reset every element…</button></div>`, 'top: 60px; right: 12px; width: 420px; height: 680px;');
  }
  document.addEventListener('keydown', e => {
    if (S.panel?.id !== 'appearance' || !(e.ctrlKey || e.metaKey) || e.target.matches?.('input[type=text], input:not([type]), textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); apHistory(apUndo, apRedo); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); apHistory(apRedo, apUndo); }
  });
  async function apImport(file) {
    if (file.size > 200000) { toast('That style file is too large. Nothing changed.', 'err'); return; }
    const r = Lib.parseStyleFile(await file.text());
    if (!r.ok) { toast('Style file refused (' + r.error.toLowerCase().replace(/_/g, ' ') + '). Nothing changed.', 'err'); cue('err'); return; }
    const a = apData(); apCommit({ elements: { ...a.elements, ...r.appearance.elements }, presets: { ...a.presets, ...r.appearance.presets } });
    toast(`Imported ${Object.keys(r.appearance.elements).length} element styles and ${Object.keys(r.appearance.presets).length} presets`); cue('ok'); render();
  }
  async function apAction(a, t) {
    const d = apData();
    switch (a) {
      case 'ap-state': S.ap.state = t.dataset.s; break;
      case 'ap-flag': apSet(t.dataset.p, (d.elements[S.ap.key]?.[S.ap.state] || {})[t.dataset.p] ? undefined : true); break;
      case 'ap-reset': apSet(t.dataset.p, undefined); break;
      case 'ap-reset-flags': ['italic', 'underline', 'strike', 'caps'].forEach(k => apSet(k, undefined)); break;
      case 'ap-undo': return apHistory(apUndo, apRedo);
      case 'ap-redo': return apHistory(apRedo, apUndo);
      case 'ap-copy': S.apClip = JSON.stringify(d.elements[S.ap.key]); toast('Style copied. Paste it onto any element from its Edit appearance panel.'); break;
      case 'ap-paste': d.elements[S.ap.key] = JSON.parse(S.apClip); apCommit(d); toast('Style pasted'); break;
      case 'ap-reset-el': delete d.elements[S.ap.key]; apCommit(d); toast('Element back to the default look'); break;
      case 'ap-reset-all': Kit.superConfirm({ title: `Reset ${Object.keys(d.elements).length} styled elements`, detail: 'Presets stay. Undo can bring the styles back while this window is open.', opener: t, onConfirm: () => { apCommit({ elements: {}, presets: d.presets }); render(); toast('Every element is back to the default look'); } }); return;
      case 'ap-preset-save': { const n = (S.ap.preset || '').trim(); if (!n || /[<>]/.test(n)) { toast('Name the preset first (no angle brackets)', 'err'); break; } d.presets[n.slice(0, 40)] = d.elements[S.ap.key]; apCommit(d); S.ap.preset = ''; toast(`Preset "${n}" saved`); break; }
      case 'ap-preset-apply': d.elements[S.ap.key] = d.presets[t.dataset.n]; apCommit(d); toast(`Applied "${t.dataset.n}"`); break;
      case 'ap-preset-del': delete d.presets[t.dataset.n]; apCommit(d); break;
      case 'ap-export': { const r = await api.saveFile('aws-app-deployer-styles.json', JSON.stringify({ schema: 'aws-app-deployer.appearance/1', exportedAt: new Date().toISOString(), ...d }, null, 2) + '\n'); if (r.ok) toast('Saved styles as UTF-8 JSON'); return; }
    }
    render();
  }



  // ---------- attention modes ----------
  S.openedAt = Date.now(); S.lastChange = Date.now();
  const mins = ms => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const timeLine = () => `Open ${mins(Date.now() - S.openedAt)} · last change ${mins(Date.now() - S.lastChange)} ago`;
  setInterval(() => { const el = document.getElementById('time-aware'); if (el) el.textContent = timeLine(); if (S.settings?.momentum && S.view === 'deploys' && !S.panel && !S.palette) { const was = !!document.querySelector('[data-momentum]'); if (was !== !!momentumDue()) render(); } }, 30000);
  function nextActionBar() {
    if (!S.settings?.oneThing) return '';
    const a = S.settings.nextAction;
    if (!a || S.editNext) return `<div class="next-bar"><i class="ms fill" aria-hidden="true">flag</i><label class="sr" for="na">Your next action</label><input id="na" data-input="nextDraft" maxlength="200" value="${esc(S.nextDraft ?? a ?? '')}" placeholder="Write the one next thing you want to do"><button class="btn fillb" data-act="next-save">Keep in view</button></div>`;
    return `<div class="next-bar" role="note" aria-label="Your next action"><i class="ms fill" aria-hidden="true">flag</i><span class="grow" style="flex: 1">Next: ${esc(a)}</span><button class="chip" data-act="next-edit">Change</button><button class="chip" data-act="next-done">Done</button></div>`;
  }
  function momentumDue() {
    const d = S.settings?.draft;
    if (!S.settings?.momentum || !d?.savedAt || S.settings.momentumUntil > Date.now()) return null;
    const idle = Date.now() - d.savedAt; return idle >= 30 * 60000 ? idle : null;
  }
  function momentumCard() {
    const idle = momentumDue(); if (!idle) return '';
    return `<div class="card raise" data-momentum="1" role="status" style="border: 1px solid var(--line)"><div class="row"><i class="ms" aria-hidden="true">schedule</i><span style="flex: 1">The deployment draft${S.settings.draft.name ? ` "${esc(S.settings.draft.name)}"` : ''} has not changed for ${mins(idle)}.</span></div><div class="row" style="gap: 6px"><button class="btn tonal" data-go="wizard">Open the draft</button><button class="btn text" data-act="momentum-snooze">Not now (1 hour)</button></div></div>`;
  }

  // ---------- logo ----------
  const logo = () => Lib.cleanLogo(S.settings.logo) || { symbol: 'rocket_launch', shape: 'rounded', bg: null, fg: null };
  function logoHtml(size) {
    const l = Lib.cleanLogo(S.settings?.logo);
    if (!l) return `<img src="icon.png" alt="" width="${size - 2}" height="${size - 2}" style="flex: none">`;
    const box = `width: ${size}px; height: ${size}px; border-radius: ${Lib.LOGO_SHAPES[l.shape]}; flex: none`;
    if (l.image) return `<img src="${l.image}" alt="" style="${box}; object-fit: cover">`;
    return `<span aria-hidden="true" style="${box}; display: grid; place-items: center; background: ${l.bg || 'var(--ac-c)'}; color: ${l.fg || 'var(--on-ac-c)'}"><i class="ms fill" style="font-size: ${Math.round(size * 0.64)}px; width: ${Math.round(size * 0.64)}px; height: ${Math.round(size * 0.64)}px">${l.symbol}</i></span>`;
  }
  function logoCard() {
    const l = logo(), custom = !!S.settings.logo;
    return `<div class="card" data-menu="setting" data-key="logo" data-search="logo icon symbol shape brand image"><div class="row"><span class="h2" style="flex: 1">Logo</span>${logoHtml(40)}</div>
      <div class="row" style="gap: 6px; flex-wrap: wrap" role="radiogroup" aria-label="Symbol">${Lib.LOGO_SYMBOLS.map(sym => `<button class="sw" role="radio" aria-checked="${custom && !l.image && l.symbol === sym}" aria-label="${sym.replace(/_/g, ' ')}" style="display: grid; place-items: center; background: var(--s2); ${custom && !l.image && l.symbol === sym ? 'outline: 2px solid var(--ac)' : ''}" data-act="logo-symbol" data-v="${sym}">${ic(sym, 'sm fill')}</button>`).join('')}</div>
      <div class="row" style="gap: 8px; flex-wrap: wrap"><span class="seg">${Object.keys(Lib.LOGO_SHAPES).map(sh => `<button class="${l.shape === sh ? 'on' : ''}" aria-pressed="${l.shape === sh}" data-act="logo-shape" data-v="${sh}">${sh[0].toUpperCase() + sh.slice(1)}</button>`).join('')}</span><label class="sr" for="lbg">Logo background colour</label><input id="lbg" class="mono" data-input="logoBg" placeholder="Background colour" value="${esc(l.bg || '')}" style="width: 150px; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"></div>
      <div class="row" style="gap: 6px; flex-wrap: wrap"><label class="btn tonal" style="cursor: pointer">${ic('upload')}Your own PNG, JPEG or WebP<input type="file" accept="image/png,image/jpeg,image/webp" data-file="logo" class="sr"></label><button class="btn text" data-act="reset" data-key="logo" ${custom ? '' : 'disabled'}>Reset</button></div>
      <span class="small">Shown in the title bar. Images up to 256 KB are checked on this computer and never uploaded.</span></div>`;
  }
  async function logoUpload(file) {
    if (file.size > 262144) { toast('That image is over 256 KB. Nothing changed.', 'err'); return; }
    const bytes = new Uint8Array(await file.arrayBuffer()), kind = Lib.imageKind(bytes);
    if (!kind) { toast('Only real PNG, JPEG or WebP images work as a logo. Nothing changed.', 'err'); return; }
    const r = await set('logo', { ...logo(), image: `data:image/${kind};base64,${Lib.b64encode(bytes)}` });
    if (r.ok) toast('Logo updated');
  }

  // ---------- live charts ----------
  function chartsCard() {
    const C = Lib.chartData(S.history.deployments), W = 400, H = 110;
    const pts = Lib.linePoints(C.timed.map(t => t.minutes), W, H);
    const maxDay = Math.max(1, ...C.outcomes.map(o => o.ok + o.bad));
    const line = pts.length > 1 ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-line" role="img" aria-label="Deployment minutes for the last ${C.timed.length} timed deployments"><path class="a" d="M${pts.map(p => p.join(' ')).join(' L')} L${W} ${H} L0 ${H}Z"/><path class="l" d="M${pts.map(p => p.join(' ')).join(' L')}"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5 : 3.5}" class="${C.timed[i].ok ? '' : 'bad'}"><title>${esc(C.timed[i].name)}: ${C.timed[i].minutes} min, ${new Date(C.timed[i].at).toLocaleString()}</title></circle>`).join('')}</svg>` : `<span class="small">Timing appears after two deployments finish with this version. Older records have no timing, and none is guessed.</span>`;
    const bars = `<div class="chart-bars" role="img" aria-label="Outcomes for the last 7 days">${C.outcomes.map(o => `<span class="col" title="${o.day}: ${o.ok} healthy, ${o.bad} stopped"><i class="b" style="height: ${(o.bad / maxDay) * 100}%"></i><i style="height: ${(o.ok / maxDay) * 100}%"></i><span class="d">${new Date(o.day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'narrow' })}</span></span>`).join('')}</div>`;
    const table = `<table class="chart-table"><thead><tr><th>Day</th><th>Healthy</th><th>Stopped</th></tr></thead><tbody>${C.outcomes.map(o => `<tr><td>${o.day}</td><td>${o.ok}</td><td>${o.bad}</td></tr>`).join('')}</tbody></table>${C.timed.length ? `<table class="chart-table"><thead><tr><th>Deployment</th><th>Minutes</th></tr></thead><tbody>${C.timed.map(t => `<tr><td>${esc(t.name)}</td><td>${t.minutes}</td></tr>`).join('')}</tbody></table>` : ''}`;
    return `<div class="card rise chart-card" data-search="charts"><div class="row" style="gap: 8px; flex-wrap: wrap"><span class="h2" style="flex: 1">Deployment time and outcomes</span>${S.run ? `<span class="badge ok">${ic('fiber_manual_record', 'sm fill')}Live</span>` : ''}<button class="btn text" data-act="chart-table" aria-pressed="${!!S.chartTable}">${ic(S.chartTable ? 'show_chart' : 'table_rows')}${S.chartTable ? 'Chart view' : 'Table view'}</button></div>
      ${S.chartTable ? table : `<div class="chart-grid"><div class="stack" style="gap: 6px; min-width: 0">${line}<span class="small">${C.latest !== null ? `Latest ${C.latest} min · median ${C.median} min · ` : ''}Built from records on this computer only.</span></div>${bars}</div>`}</div>`;
  }

  // ---------- tools: Base64 and file converter ----------
  S.tools = { b64mode: 'encode', b64in: '', b64out: null, urlSafe: false, conv: null };
  async function b64File(file) {
    if (file.size > 10 * 1024 * 1024) { toast('Files up to 10 MB only. Nothing was read.', 'err'); return; }
    S.tools.b64out = { ok: true, text: Lib.b64encode(new Uint8Array(await file.arrayBuffer()), { urlSafe: S.tools.urlSafe }), name: file.name.replace(/[^\w.-]+/g, '-') + '.b64.txt' }; render();
  }
  async function convertFile(kind, file) {
    if (file.size > 25 * 1024 * 1024) { toast('Files up to 25 MB only. Nothing was read.', 'err'); return; }
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'converted';
    if (kind.startsWith('img>')) {
      const to = kind.slice(4), mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[to];
      if (!Lib.imageKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()))) { toast('That is not a PNG, JPEG or WebP image. Nothing changed.', 'err'); return; }
      try {
        const bmp = await createImageBitmap(file), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const g = c.getContext('2d'); if (to === 'jpeg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); } g.drawImage(bmp, 0, 0);
        const blob = await new Promise(r => c.toBlob(r, mime, 0.92));
        S.tools.conv = { name: `${base}.${to === 'jpeg' ? 'jpg' : to}`, bytes: new Uint8Array(await blob.arrayBuffer()), note: `${bmp.width} × ${bmp.height}${to === 'jpeg' ? ', transparency filled with white' : ''}` };
      } catch { toast('This image could not be decoded. Nothing changed.', 'err'); return; }
    } else {
      const r = Lib.convertText(kind, await file.text());
      if (!r.ok) { toast(`${Lib.CONVERSIONS[kind].label} failed: ${r.error.toLowerCase().replace(/_/g, ' ')}. Nothing was saved.`, 'err'); return; }
      S.tools.conv = { name: `${base}.${Lib.CONVERSIONS[kind].ext}`, text: r.text, note: r.lossy ? 'Nested values are written as JSON text inside one cell.' : '' };
    }
    toast(`Converted to ${S.tools.conv.name}`); cue('ok'); render();
  }
  function viewTools() {
    const T2 = S.tools, out = T2.b64out;
    const io = 'width: 100%; min-height: 96px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 10px 12px; font: 13px/1.5 "JetBrains Mono", monospace; resize: vertical';
    const row = (label, kind, accept, ready = true, need = '') => `<div class="conv ${ready ? '' : 'off'}"><span>${label}</span>${ready ? `<span class="badge ok">Ready</span><label class="btn text" style="cursor: pointer">Choose…<input type="file" accept="${accept}" data-convfile="${kind}" class="sr"></label>` : `<span class="badge mute">${need}</span>`}</div>`;
    const ed = S.editors || {};
    return page('Tools', '', `<div class="cols"><div class="wide">
      <div class="card"><span class="h2">Base64 toolkit</span>
        <div class="row" style="gap: 8px; flex-wrap: wrap"><span class="seg">${[['encode', 'Encode text'], ['decode', 'Decode']].map(([v, l]) => `<button class="${T2.b64mode === v ? 'on' : ''}" aria-pressed="${T2.b64mode === v}" data-act="b64-mode" data-v="${v}">${l}</button>`).join('')}</span><button class="badge ${T2.urlSafe ? 'ac' : 'mute'}" style="border: 0; cursor: pointer" aria-pressed="${T2.urlSafe}" data-act="b64-url">URL-safe</button><label class="btn text" style="cursor: pointer">${ic('upload_file')}File to Base64<input type="file" data-b64file="1" class="sr"></label></div>
        <label class="sr" for="b64in">Input</label><textarea id="b64in" data-input="b64in" style="${io}" placeholder="${T2.b64mode === 'encode' ? 'Text to encode (UTF-8)' : 'Base64 to decode'}">${esc(T2.b64in)}</textarea>
        <button class="btn fillb" data-act="b64-go" style="align-self: flex-start">${ic('swap_vert')}${T2.b64mode === 'encode' ? 'Encode' : 'Decode'}</button>
        ${out ? (out.ok ? `<label class="sr" for="b64out">Result</label><textarea id="b64out" readonly style="${io}">${esc(out.text ?? '')}</textarea>${out.binary ? `<span class="small">This is binary data (${out.bytes.length} bytes), not UTF-8 text. Save it as a file instead.</span>` : ''}<div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn text" data-act="b64-copy" ${out.binary ? 'disabled' : ''}>${ic('content_copy')}Copy</button><button class="btn text" data-act="b64-save">${ic('download')}Save</button><button class="btn text" data-act="b64-edit" data-e="default">${ic('edit_note')}Open with the default app</button><button class="btn text" data-act="b64-edit" data-e="vscode" ${ed.vscode ? '' : 'disabled'} title="${ed.vscode ? '' : 'VS Code is not installed on this computer'}">${ic('code')}Open in VS Code${ed.vscode ? '' : ' (not found)'}</button></div>` : `<span class="badge err" role="alert">${esc({ EMPTY: 'Nothing to decode', NOT_BASE64: 'That is not valid Base64' }[out.error] || out.error)}</span>`) : ''}
      </div></div>
      <div class="side"><div class="card"><span class="h2">File converter</span><span class="small">Up to 25 MB, converted on this computer. Nothing is uploaded.</span>
        ${row('JSON to YAML', 'json>yaml', '.json,application/json')}${row('JSON to CSV', 'json>csv', '.json,application/json')}${row('CSV to JSON', 'csv>json', '.csv,text/csv')}${row('CSV to YAML', 'csv>yaml', '.csv,text/csv')}${row('Markdown to HTML', 'md>html', '.md,.markdown,text/markdown')}
        ${row('Image to PNG', 'img>png', 'image/png,image/jpeg,image/webp')}${row('Image to JPEG', 'img>jpeg', 'image/png,image/jpeg,image/webp')}${row('Image to WebP', 'img>webp', 'image/png,image/jpeg,image/webp')}
        ${row('YAML to JSON', '', '', false, 'Needs a YAML reader, not included')}${row('Video and audio', '', '', false, 'Needs FFmpeg, not included')}${row('7z and RAR archives', '', '', false, 'Needs 7-Zip, not included')}
        ${T2.conv ? `<div class="card outline" style="gap: 8px"><span class="t" style="font-weight: 650">${esc(T2.conv.name)}</span>${T2.conv.note ? `<span class="small">${esc(T2.conv.note)}</span>` : ''}<div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn tonal" data-act="conv-save">${ic('download')}Save</button>${T2.conv.text !== undefined ? `<button class="btn text" data-act="conv-edit" data-e="vscode" ${ed.vscode ? '' : 'disabled'}>${ic('code')}Open in VS Code${ed.vscode ? '' : ' (not found)'}</button><button class="btn text" data-act="conv-edit" data-e="default">Open with the default app</button>` : ''}</div></div>` : ''}
      </div></div></div>`);
  }
  async function handoff(name, text, editor) {
    const r = await api.openInEditor(name, text, editor);
    if (r.ok) toast(`Opened ${name}`); else toast(r.error === 'VSCODE_NOT_FOUND' ? 'VS Code is not installed on this computer.' : `No app opened the file. It is saved at ${r.path}`, 'err');
  }

  // ---------- wording celebration ----------
  function partyHtml() {
    const p = S.party; if (!p) return '';
    const quiet = S.settings.reduceMotion || S.settings.calm || S.settings.school || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quiet) return `<div class="party quiet" role="status">${ic('check_circle', 'fill')}${esc(p)}</div>`;
    const bits = Array.from({ length: 36 }, (_, i) => `<i style="left: ${(i * 37) % 100}%; animation-delay: ${(i % 9) * 0.08}s; background: ${['var(--ac)', 'var(--ok)', 'var(--warn)', 'var(--err)'][i % 4]}; transform: rotate(${i * 23}deg)"></i>`).join('');
    return `<div class="party" role="status" aria-live="polite"><div class="party-card">${ic('celebration', 'fill')}<span class="h2">Tada! ${esc(p)}</span></div>${bits}</div>`;
  }
  function celebrate(text) {
    S.party = text; render(); cue('tada'); say(text);
    clearTimeout(S.partyTimer); S.partyTimer = setTimeout(() => { S.party = null; render(); }, 2600);
  }

  // ---------- Support Tickets ----------
  const SEVERITY = ['Mild inconvenience', 'Moderately dramatic', 'Catastrophic (ignored)', 'Existential'];
  const STATUSES = ['Received', 'Triaged by the Desk', 'Escalated to a drawer', 'Resolved: delete the app data folder'];
  function ticketStatus(t) { const mins = (Date.now() - new Date(t.createdAt)) / 60000; return STATUSES[Math.min(3, Math.floor(mins / 0.5))]; }
  const cannedReply = () => ['Your request has been received and filed.', 'Thank you for contacting the Desk. Your case is in a queue of exactly one.', 'Thank you for contacting the Desk. We have reviewed your case with all the care our manual describes.', 'The Desk has convened. The Desk has deliberated. The Desk has a folder for you.', 'Our most senior drawer has escalated your ticket to an even deeper drawer. Resolution below.'][(S.settings.school ? 1 : S.settings.funnyLevels[S.settings.language === 'yue' ? 'yue' : 'en']) - 1];
  function viewSupport() {
    const tickets = S.settings.tickets || [], q = S.ticketQ || '';
    const r = Lib.search(tickets.map(t => ({ ...t, label: `${t.id} ${t.category} ${t.description}` })), q, { regex: !!S.ticketRegex });
    const list = r.ok ? r.items : [];
    return page('Support Tickets', '', `<div class="cols"><div class="wide"><div class="card"><span class="h2">Open a ticket</span>
      <div class="row" style="gap: 12px; flex-wrap: wrap"><div class="field" style="flex: 1 1 200px"><label for="tk-cat">Category</label><select id="tk-cat" data-tk="category"><option>Forgot my PIN</option><option>Forgot my password</option><option>Lost my authenticator</option><option>Locked myself out of Settings</option><option>Other existential matters</option></select></div></div>
      <div class="field"><label for="tk-desc">Describe what happened</label><textarea id="tk-desc" data-tk="description" rows="3" maxlength="2000" style="border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 10px 12px; font: inherit">${esc(S.ticketDraft || '')}</textarea></div>
      <button class="btn fillb" data-act="tk-submit" style="align-self: flex-start">${ic('send')}Submit ticket</button>
      <span class="small" style="border-top: 1px solid var(--line); padding-top: 10px; color: var(--tx)">Nothing is sent anywhere. No ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading this.</span></div>
      <div class="card"><span class="h2">The only fix that works</span><span>Delete this app's data folder yourself. That removes every lock, along with your settings, history and these tickets.</span><span class="mono small" style="overflow-wrap: anywhere">${esc(S.appdata || '')}</span><div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn tonal" data-act="open-appdata">${ic('folder_open')}Open the app data folder</button><button class="btn text" data-act="copy-appdata">${ic('content_copy')}Copy path</button></div></div></div>
      <div class="side"><div class="row" style="gap: 6px"><label class="sr" for="tkq">Search tickets</label><input id="tkq" class="mono" data-input="ticketQ" value="${esc(q)}" placeholder="Search tickets" style="flex: 1; height: 36px; border-radius: 10px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px"><button class="badge ${S.ticketRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="tk-regex" aria-pressed="${!!S.ticketRegex}">.*</button></div>
        <div class="row" style="gap: 6px"><button class="btn text" data-act="tk-export" ${tickets.length ? '' : 'disabled'}>${ic('download')}Export</button><button class="btn text" style="color: var(--err)" data-act="tk-clear" ${tickets.length ? '' : 'disabled'}>Remove all…</button></div>
        ${list.map(t => `<div class="card" style="gap: 6px"><div class="row"><span class="mono t" style="font-weight: 650">${esc(t.id)}</span><span class="badge ${ticketStatus(t).startsWith('Resolved') ? 'ok' : 'warn'}">${esc(ticketStatus(t))}</span></div><span class="small">${esc(t.category)} · Severity: ${esc(t.severity)}</span><span>${esc(t.description)}</span><span class="small" style="color: var(--tx)">“${esc(t.reply)}”</span></div>`).join('') || '<span class="small">No tickets yet.</span>'}</div></div>`);
  }

  // ---------- render ----------
  function vocabularize(node) {
    const v = S.settings?.vocabulary; if (!v) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('.ms, .mono, input, textarea, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n; (n = walker.nextNode());) { const next = Lib.applyVocabulary(n.nodeValue, v); if (next !== n.nodeValue) n.nodeValue = next; }
  }
  function render() {
    if (!S.settings || (browser && !api.authenticated)) return;
    const focusId = document.activeElement?.id, caret = document.activeElement?.selectionStart;
    const views = { setup: viewSetup, accounts: viewAccounts, deploys: viewDeploys, wizard: viewWizard, run: viewRun, result: viewResult, settings: viewSettings, help: viewHelp, history: viewHistory, changelog: viewChangelog, docs: viewDocs, support: viewSupport, tools: viewTools };
    const tab = S.tabs.find(t => t.id === S.active) || S.tabs[0];
    const v = tab.id === 'ws' ? S.view : tab.view;
    root.innerHTML = shell((views[v] || viewDeploys)(), { rail: v !== 'setup' }) + paletteHtml() + panelHtml() + dimsumHtml() + partyHtml();
    Kit.watchPanels(root, (id, box) => { const ui = S.settings.ui || { filtersOpen: {}, panels: {} }; api.setSetting('ui', { ...ui, panels: { ...ui.panels, [id]: box } }).then(r => r.ok && (S.settings.ui = r.value)); });
    if (S.view === 'settings' && S.settingsQuery) { const q = S.settingsQuery.toLowerCase(); root.querySelectorAll('[data-search]').forEach(el => { el.hidden = !el.dataset.search.toLowerCase().includes(q); }); }
    vocabularize(root);
    decorateLocks();
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch { } } }
  }
  function go(view) { if (guard('go:' + view)) return; S.view = view; S.active = 'ws'; S.palette = null; if (['history', 'changelog', 'docs'].includes(view)) ensureData(view); render(); document.getElementById('main')?.focus?.(); }
  window.__ready = () => !!S.prereq && S.profiles !== null;
  window.__go = v => {
    if (v === 'palette') { S.palette = { q: 'dep', regex: false, sel: 0 }; render(); return; }
    if (v === 'a11y') { go('deploys'); openPanel('a11y'); return; }
    if (v === 'info') { go('settings'); openPanel('info:funnyLevels'); return; }
    if (v === 'tabs') { go('deploys'); ['history', 'docs', 'changelog'].forEach(x => { ensureData(x); openTab(x); }); S.active = S.tabs[1].id; render(); return; }
    if (v === 'export') { go('history'); openPanel('export:history'); return; }
    if (v === 'lockwiz') { go('deploys'); openLockWizard({ key: 'go:settings', label: 'Settings' }); S.lockWiz.policy = 'pin+totp'; api.lockTotp('Settings').then(x => { S.lockWiz.totp = x; S.lockWiz.pin = '2468'; render(); }); return; }
    if (v === 'unlock') { go('deploys'); api.lockCreate('go:settings', { label: 'Settings', policy: 'pin', pin: '2468' }).then(async () => { await refreshLocks(); render(); openUnlock({ key: 'go:settings', label: 'Settings' }); S.unlock.pin = '24'; render(); }); return; }
    if (v === 'tools') { go('deploys'); ensureData('tools'); openTab('tools'); S.tools.b64in = 'hello, har gow'; S.tools.b64out = { ok: true, text: Lib.b64encode('hello, har gow') }; S.tools.conv = { name: 'menu.yaml', text: 'x', note: '' }; render(); return; }
    if (v === 'party') { S.active = 'ws'; go('deploys'); celebrate('42 words applied'); return; }
    if (v === 'appearance') { go('deploys'); openAppearance({ key: 'go:accounts', label: 'Accounts' }); apSet('weight', 750); apSet('color', '#4ade9a'); apSet('glow', 12); apSet('radius', 18); apSet('underline', true); render(); return; }
    if (v === 'support') { go('support'); S.ticketDraft = 'I locked Settings with a PIN and forgot it.'; render(); return; }
    const row = () => document.querySelector('[data-menu="deploy"]');
    if (v === 'menu') { go('deploys'); const r = row(); if (r) { const b = r.getBoundingClientRect(); Kit.openMenu(menuFor(r), { x: b.left + 240, y: b.top + 20, opener: r }); } return; }
    if (v === 'confirm') { go('deploys'); const r = row(); if (r) removeRecords([r.dataset.at], r); return; }
    S.panel = null; Kit.closeMenu(false); go(v);
  };
  const __goInner = window.__go;
  window.__go = v => { S.panel = null; Kit.closeMenu(false); document.querySelector('.sc')?.remove(); __goInner(v); };

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-go],[data-act],[data-win],[data-toggle],[data-set],[data-cmd],[data-panel-open],[data-info],[data-a11y],[data-tab-go],[data-tab-close],[data-doc-open],[data-doc]');
    if (!t) return;
    if (t.dataset.stop && e.target === t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.tabGo) { S.active = t.dataset.tabGo; const tb = S.tabs.find(x => x.id === S.active); if (tb?.view) ensureData(tb.view); render(); document.querySelector(`[data-tab-go="${S.active}"]`)?.focus(); return; }
    if (t.dataset.tabClose) return closeTabs([t.dataset.tabClose]);
    if (t.dataset.docOpen || t.dataset.doc) { e.preventDefault(); S.docF.id = t.dataset.docOpen || t.dataset.doc; render(); return; }
    if (t.dataset.panelOpen) return S.panel?.id === t.dataset.panelOpen ? closePanel() : openPanel(t.dataset.panelOpen, `[data-panel-open="${t.dataset.panelOpen}"]`);
    if (t.dataset.info) return openPanel('info:' + t.dataset.info, `[data-info="${t.dataset.info}"]`);
    if (t.dataset.a11y) return setA11y({ [t.dataset.a11y]: !S.settings.a11y[t.dataset.a11y] });
    if (t.dataset.win) { const r = await api.window(t.dataset.win); S.maximized = r.maximized; return; }
    if (t.dataset.toggle) return set(t.dataset.toggle, !S.settings[t.dataset.toggle]);
    if (t.dataset.set) return set(t.dataset.set, t.dataset.val);
    if (t.dataset.cmd) { const c = COMMANDS.find(x => x.id === t.dataset.cmd); S.palette = null; render(); return c?.run(); }
    const a = t.dataset.act;
    if (a?.startsWith('ap-')) return apAction(a, t);
    if (a === 'submit-code') e.preventDefault();
    if (a === 'close-palette' && e.target.closest('[data-stop]')) return;
    switch (a) {
      case 'sign-out': if (browser) await api.signOut(); break;
      case 'palette': S.palette = S.palette ? null : { q: '', regex: false, sel: 0 }; render(); document.getElementById('pq')?.focus(); break;
      case 'close-palette': S.palette = null; render(); break;
      case 'regex': S.palette.regex = !S.palette.regex; render(); document.getElementById('pq')?.focus(); break;
      case 'drawer': S.drawer = !S.drawer; render(); break;
      case 'clear-notes': S.notes = []; render(); break;
      case 'recheck': loadPrereq(); break;
      case 'install': { const tools = t.dataset.tools.split(','); const r = await api.install(tools); if (r.ok) { S.install = { op: r.op, requested: Object.fromEntries(tools.map(x => [x, 1])), tools: {}, log: [[time(), 'Started one-click install']], done: false }; cue('start'); } render(); break; }
      case 'cancel-op': await api.cancel(t.dataset.op); break;
      case 'reload-profiles': loadProfiles(); break;
      case 'pick-profile': if (browser && S.login && !S.login.done) await api.cancel(S.login.op); S.selection = { profile: t.dataset.profile, region: t.dataset.region || '' }; S.identity = null; S.login = null; S.loginExpired = false; if (S.selection.region) api.setSetting('selection', S.selection); render(); if (S.selection.region) verify(); break;
      case 'skip-setup': await set('setupComplete', true); go('deploys'); break;
      case 'go-connect': await set('setupComplete', true); go('accounts'); break;
      case 'login': { if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(S.selection.region || '')) { toast('Enter a region such as us-east-1', 'err'); break; } api.setSetting('selection', S.selection); const r = await api.login(S.selection); S.login = r.ok ? { op: r.op, authorizationUrl: safeAwsUrl(r.authorizationUrl) } : { done: true, error: r.error }; render(); break; }
      case 'submit-code': { const input = document.getElementById('aws-code'); const code = input?.value.trim(); if (!code) { input?.focus(); break; } input.value = ''; S.login.submitting = true; render(); const r = await api.submitLoginCode(S.login.op, code); if (!r.ok) { if (S.login?.op) await api.cancel(S.login.op); S.login = { ...S.login, done: true, error: r.error }; } render(); break; }
      case 'verify': verify(); break;
      case 'wiz': S.wizard.step = +t.dataset.step; saveDraft(); render(); break;
      case 'wiz-restart': S.wizard.step = 3; go('wizard'); break;
      case 'sample':
      case 'pick': { const r = await (a === 'sample' ? api.sampleProject() : api.pickSource()); if (!r.ok) { if (r.error !== 'CANCELLED') toast(browserError(r.error), 'err'); break; } S.wizard.file = r.path; S.wizard.inspecting = true; S.wizard.inspect = null; render(); const i = await api.inspectSource(r.path); S.wizard.inspecting = false; S.wizard.inspect = i;
        if (i.ok) { const src = i.source; S.wizard.port = src.containerPort ? String(src.containerPort) : ''; if (!S.wizard.name) S.wizard.name = (src.service || 'app').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').padEnd(3, 'x').slice(0, 32); S.wizard.env = Object.entries(src.environment || {}).map(([k, v]) => ({ k, v })); } saveDraft(); render(); break; }
      case 'env-add': S.wizard.env.push({ k: '', v: '' }); render(); break;
      case 'env-del': S.wizard.env.splice(+t.dataset.i, 1); render(); break;
      case 'deploy': await startDeploy(); break;
      case 'copy': await navigator.clipboard.writeText(t.dataset.url); toast(Lib.t('copied', S.settings.language)); break;
      case 'open-url': { const r = await api.openExternal(t.dataset.url); if (!r.ok) toast('That link was blocked for safety', 'err'); break; }
      case 'export': api.exportHistory(); break;
      case 'accent': await set('rainbow', false); await set('accent', t.dataset.c); break;
      case 'rainbow': await set('rainbow', !S.settings.rainbow); break;
      case 'reset': { const r = await api.resetSetting(t.dataset.key); if (r.ok) { S.settings[t.dataset.key] = r.value; applyAppearance(); render(); } break; }
      case 'schedule': await set('schedule', { ...S.settings.schedule, enabled: !S.settings.schedule.enabled }); break;
      case 'troll': S.troll = true; cue('tap'); render(); say(Lib.t('dim_sum_troll', S.settings.language)); setTimeout(() => { S.troll = false; render(); }, 4000); break;
      case 'update-check': S.update = await api.checkUpdates(); render(); break;
      case 'update-later': S.updateLater = true; render(); break;
      case 'update-install': if (S.run) { toast('A deployment is running. Restart after it finishes.', 'err'); break; } saveDraft(); await api.installUpdate(); break;
      case 'panel-close': if (S.panel?.id === 'appearance') { S.ap = null; } closePanel(); break;
      case 'pk': { const fld = t.dataset.f === 'upin' ? 'unlock' : 'lockWiz'; const key = t.dataset.f === 'upin' ? 'pin' : 'pin'; const obj = S[fld]; if (obj[key].length < 12) obj[key] += t.dataset.n; render(); break; }
      case 'pk-back': { const obj = t.dataset.f === 'upin' ? S.unlock : S.lockWiz; obj.pin = obj.pin.slice(0, -1); render(); break; }
      case 'pk-clear': { const obj = t.dataset.f === 'upin' ? S.unlock : S.lockWiz; obj.pin = ''; render(); break; }
      case 'lw-policy': S.lockWiz.policy = t.dataset.p; S.lockWiz.error = null; render(); break;
      case 'lw-totp': S.lockWiz.totp = await api.lockTotp(S.lockWiz.label); render(); break;
      case 'lw-create': { const W = S.lockWiz, need = W.policy.split('+');
        if (need.includes('pin') && W.pin !== W.pin2) { W.error = 'The two PINs differ.'; render(); break; }
        if (need.includes('password') && W.password !== W.password2) { W.error = 'The two passwords differ.'; render(); break; }
        if (need.includes('totp') && !W.totp) { W.error = 'Set up the authenticator first.'; render(); break; }
        const r = await api.lockCreate(W.key, { label: W.label, policy: W.policy, pin: W.pin, password: W.password, totpSecret: W.totp?.secret, totpCode: W.code });
        if (!r.ok) { W.error = { PIN_INVALID: 'A PIN is 4 to 12 digits.', PASSWORD_INVALID: 'A password is 6 to 200 characters.', TOTP_CODE_WRONG: 'That code did not match. Check the authenticator and try the current code.', VAULT_UNAVAILABLE: 'Protected storage is unavailable, so nothing was locked.', ALREADY_LOCKED: 'This element is already locked.' }[r.error] || r.error; render(); break; }
        await refreshLocks(); S.lockWiz = null; closePanel(); toast(`Locked "${W.label}" with ${POLICY_LABEL[W.policy]}. Just for fun.`); break; }
      case 'ul-go': { const U = S.unlock, fn = U.remove ? api.lockRemove : api.lockVerify; const r = await fn(U.key, { pin: U.pin, password: U.password, totp: U.totp }); await refreshLocks();
        if (r.ok) { if (!U.remove) S.unlocked[U.key] = U.duration === 'session' ? 'session' : Date.now() + (U.duration === '15' ? 900000 : 60000); S.unlock = null; closePanel(); toast(U.remove ? 'Lock removed' : 'Unlocked'); cue('ok'); }
        else { U.error = r.error === 'WAIT' ? `Too many tries. Wait about ${Math.ceil(r.waitMs / 60000)} min, or play the unlock ladder.` : r.error === 'NO_MATCH' ? `That did not match.${r.attemptsBeforeWait ? ` ${r.attemptsBeforeWait} more tries before a wait.` : ''} Locked out for good? Delete the app data folder.` : r.error; U.pin = ''; cue('err'); render(); } break; }
      case 'ladder-open': S.unlock.ladder = {}; render(); break;
      case 'ladder-close': S.unlock.ladder = null; render(); break;
      case 'ld-start': ladderStart(t.dataset.r); break;
      case 'ld-dim': ladderAnswer(+t.dataset.i); break;
      case 'ld-sums': ladderAnswer(S.unlock.ladder.challenge.sums.map((_, i) => S.unlock.ladder.sums[i])); break;
      case 'ld-mole': { const L = S.unlock.ladder, id = L.up?.[+t.dataset.h]; if (id) { L.hits.add(id); delete L.up[+t.dataset.h]; cue('tap'); render(); } break; }
      case 'go-support': S.unlock = null; S.panel = null; S.view = 'support'; S.active = 'ws'; render(); break;
      case 'open-appdata': { const r = await api.openAppdata(); if (!r.ok) toast(`The file manager could not open. The folder is ${r.path}`, 'err'); break; }
      case 'copy-appdata': copy(S.appdata); break;
      case 'tk-regex': S.ticketRegex = !S.ticketRegex; render(); break;
      case 'tk-submit': { const desc = (S.ticketDraft || '').trim(); if (!desc) { toast('Describe what happened first', 'err'); break; } const cat = document.getElementById('tk-cat').value; const id = 'AAD-' + String(1000 + Math.floor(Math.random() * 9000)); await set('tickets', [{ id, category: cat, description: desc.slice(0, 2000), severity: SEVERITY[Math.floor(Math.random() * SEVERITY.length)], createdAt: new Date().toISOString(), reply: cannedReply() }, ...(S.settings.tickets || [])].slice(0, 200)); S.ticketDraft = ''; toast(`Ticket ${id} filed with the Desk`); setTimeout(render, 31000); setTimeout(render, 61000); setTimeout(render, 91000); break; }
      case 'tk-export': { const r = await api.saveFile('support-tickets.json', Lib.exportAs('json', 'aws-app-deployer.tickets/1', S.settings.tickets)); if (r.ok) toast('Saved tickets'); break; }
      case 'tk-clear': Kit.superConfirm({ title: `Remove ${S.settings.tickets.length} tickets`, detail: 'Only from this computer. The Desk will not notice.', opener: t, onConfirm: async () => { await set('tickets', []); toast('Tickets removed'); } }); break;
      case 'open-tab': ensureData(t.dataset.view); openTab(t.dataset.view); break;
      case 'tab-regex': S.tabRegex = !S.tabRegex; render(); break;
      case 'hist-regex': S.hist.regex = !S.hist.regex; render(); break;
      case 'hist-cat': S.hist.cat = t.dataset.c; render(); break;
      case 'hist-sel': S.hist.sel = +t.dataset.i; render(); break;
      case 'hist-restore': { const r = await api.restore(+t.dataset.i); if (r.ok) { const s2 = await api.settings(); S.settings = s2.settings; S.sources = s2.sources; applyAppearance(); await loadHistory(); toast(r.key ? `Restored ${r.key}` : `Restored ${r.restored} record${r.restored === 1 ? '' : 's'}`); } else toast('That revision cannot be restored: ' + r.error.toLowerCase().replace(/_/g, ' '), 'err'); render(); break; }
      case 'hist-label': { const v = document.getElementById('hl').value; const r = await api.label(+t.dataset.i, v); if (r.ok) { await loadHistory(); render(); } break; }
      case 'clog-regex': S.clog.regex = !S.clog.regex; render(); break;
      case 'clog-copy': copy(changelogText()); break;
      case 'clog-export': { const r = await api.saveFile('aws-app-deployer-changelog.md', changelogText()); if (r.ok) toast('Saved changelog'); break; }
      case 'doc-regex': S.docF.regex = !S.docF.regex; render(); break;
      case 'exp-fmt': S.exportFmt = t.dataset.f; render(); break;
      case 'exp-go': await doExport(t.dataset.w); closePanel(); break;
      case 'panel-reset': { const ui = S.settings.ui; const panels = { ...ui.panels }; delete panels[t.dataset.id]; await set('ui', { ...ui, panels }); break; }
      case 'a11y-hide': openPanel('a11y-hide'); break;
      case 'a11y-hide-yes': S.panel = null; await setA11y({ hidden: true }); toast('Accessibility button hidden. Find it again in Settings or the command palette.'); break;
      case 'a11y-show': await setA11y({ hidden: false }); break;
      case 'a11y-reset': await set('a11y', { textSize: 100, contrast: false, focus: false, targets: false, hidden: false }); break;
      case 'read-aloud': { const main = document.getElementById('main'); const text = [...main.querySelectorAll('h1, .h2, .t, .sub, .small, dt, dd, .badge')].filter(n => !n.closest('input, .mono')).map(n => n.innerText.trim()).filter(Boolean).join('. '); if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text.slice(0, 4000))); } else toast('No voice is available on this computer', 'err'); break; }
      case 'filters': { const ui = S.settings.ui; await set('ui', { ...ui, filtersOpen: { ...ui.filtersOpen, [t.dataset.id]: !ui.filtersOpen?.[t.dataset.id] } }); break; }
      case 'note-regex': S.noteRegex = !S.noteRegex; render(); break;
      case 'note-all': { const r = Lib.search(S.notes.map(n => ({ ...n, label: n.text })), S.noteQ, { regex: S.noteRegex }); (r.items || []).forEach(n => S.noteSel.add(n.id)); render(); break; }
      case 'note-invert': S.notes.forEach(n => (S.noteSel.has(n.id) ? S.noteSel.delete(n.id) : S.noteSel.add(n.id))); render(); break;
      case 'note-copy': copy(S.notes.filter(n => S.noteSel.has(n.id)).map(n => `${n.at} ${n.text}`).join('\n')); break;
      case 'note-dismiss': { const n = S.noteSel.size; S.notes = S.notes.filter(x => !S.noteSel.has(x.id)); S.noteSel.clear(); render(); say(`Dismissed ${n} notifications`); break; }
      case 'practice': S.practice[t.dataset.key] = !S.practice[t.dataset.key]; render(); break;
      case 'info-step': S.infoStep = Math.max(0, S.infoStep + +t.dataset.d); render(); break;
      case 'dep-regex': S.depRegex = !S.depRegex; render(); break;
      case 'dep-status': S.depStatus = t.dataset.v; render(); break;
      case 'dep-all': filteredDeployments().list.forEach(x => S.depSel.add(x.id || x.at)); render(); break;
      case 'dep-invert': S.history.deployments.forEach(x => { const k = x.id || x.at; S.depSel.has(k) ? S.depSel.delete(k) : S.depSel.add(k); }); render(); break;
      case 'dep-export': exportRecords(S.history.deployments.filter(x => S.depSel.has(x.id || x.at))); break;
      case 'dep-remove': removeRecords([...S.depSel], t); break;
      case 'voice-try': { const was = S.settings.narration; S.settings.narration = true; say(S.settings.language === 'yue' ? '你好，部署準備好喇。' : 'Hello. Your deployment is ready.'); S.settings.narration = was; break; }
      case 'logo-symbol': await set('logo', { ...logo(), symbol: t.dataset.v, image: undefined }); break;
      case 'logo-shape': await set('logo', { ...logo(), shape: t.dataset.v }); break;
      case 'chart-table': S.chartTable = !S.chartTable; render(); break;
      case 'b64-mode': S.tools.b64mode = t.dataset.v; S.tools.b64out = null; render(); break;
      case 'b64-url': S.tools.urlSafe = !S.tools.urlSafe; render(); break;
      case 'b64-go': S.tools.b64out = S.tools.b64mode === 'encode' ? { ok: true, text: Lib.b64encode(S.tools.b64in, { urlSafe: S.tools.urlSafe }) } : Lib.b64decode(S.tools.b64in); render(); break;
      case 'b64-copy': copy(S.tools.b64out.text); break;
      case 'b64-save': { const o = S.tools.b64out; const r = await api.saveFile(o.name || (o.binary ? 'decoded.bin' : S.tools.b64mode === 'encode' ? 'encoded.txt' : 'decoded.txt'), o.binary ? o.bytes : o.text); if (r.ok) toast('Saved'); break; }
      case 'b64-edit': handoff(S.tools.b64mode === 'encode' ? 'encoded.txt' : 'decoded.txt', S.tools.b64out.text || '', t.dataset.e); break;
      case 'conv-save': { const c = S.tools.conv; const r = await api.saveFile(c.name, c.bytes || c.text); if (r.ok) toast(`Saved ${c.name}`); break; }
      case 'conv-edit': handoff(S.tools.conv.name, S.tools.conv.text, t.dataset.e); break;
      case 'next-save': { const v = (S.nextDraft ?? '').trim(); if (!v) { toast('Write the next action first', 'err'); break; } S.editNext = false; S.nextDraft = null; await set('nextAction', v.slice(0, 200)); break; }
      case 'next-edit': S.editNext = true; S.nextDraft = S.settings.nextAction; render(); document.getElementById('na')?.focus(); break;
      case 'next-done': S.nextDraft = ''; await set('nextAction', ''); toast('Next action cleared'); break;
      case 'momentum-snooze': await set('momentumUntil', Date.now() + 3600000); break;
      case 'vocab-clear': await set('vocabulary', null); toast('Original words restored'); break;
    }
  });
  async function startDeploy() {
    const W = S.wizard, src = W.inspect.source;
    const source = W.file.toLowerCase().match(/(compose|docker-compose)\.ya?ml$/) ? { kind: 'compose', composePath: W.file } : { kind: 'dockerfile', contextPath: src.contextPath, dockerfilePath: src.dockerfilePath };
    const environment = Object.fromEntries(W.env.filter(e => e.k).map(e => [e.k, e.v]));
    const r = await api.deploy({ ...S.selection, region: S.identity.region, expectedIdentity: S.identity, name: W.name, source, containerPort: W.port ? Number(W.port) : undefined, healthCheckPath: W.health || '/', environment });
    if (!r.ok) { toast(Lib.errorText(r.error), 'err'); return; }
    S.run = { op: r.op, name: W.name, stage: 'validation', log: [[time(), 'Deployment started']], scope: { accountId: S.identity.accountId, region: S.identity.region } };
    cue('start'); say('Deployment started'); go('run');
  }
  function saveDraft() { const W = S.wizard; const d = { savedAt: Date.now(), step: W.step, file: W.file, name: W.name, port: W.port, health: W.health, env: W.env.map(e => ({ k: e.k, v: '' })) }; S.settings.draft = d; S.lastChange = Date.now(); api.setSetting('draft', d); }
  root.addEventListener('submit', e => { if (e.target.id === 'aws-code-form') { e.preventDefault(); root.querySelector('[data-act="submit-code"]')?.click(); } });
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.input === 'paletteQ') { S.palette.q = el.value; S.palette.sel = 0; render(); return; }
    if (el.dataset.input === 'settingsQuery') { S.settingsQuery = el.value; render(); return; }
    if (el.dataset.input === 'noteQ') { S.noteQ = el.value; render(); return; }
    if (el.dataset.input === 'depQ') { S.depQ = el.value; render(); return; }
    if (el.dataset.input === 'ticketQ') { S.ticketQ = el.value; render(); return; }
    if (el.dataset.tk === 'description') { S.ticketDraft = el.value; return; }
    if (el.dataset.lw) { const m = { 'lw-pin': 'pin', 'lw-pin2': 'pin2', 'lw-password': 'password', 'lw-password2': 'password2', 'lw-code': 'code' }[el.dataset.lw]; S.lockWiz[m] = el.value; if (m === 'pin') render(); return; }
    if (el.dataset.ul) { S.unlock[el.dataset.ul] = el.value; if (el.dataset.ul === 'pin') render(); return; }
    if (el.dataset.input === 'nextDraft') { S.nextDraft = el.value; return; }
    if (el.dataset.funny) { set('funnyLevels', { ...S.settings.funnyLevels, [el.dataset.funny]: +el.value }); return; }
    if (el.dataset.input === 'apPreset') { S.ap.preset = el.value; return; }
    if (el.dataset.ap && el.type === 'range') { apSet(el.dataset.ap, +el.value, !S.apDrag); S.apDrag = true; const b = el.nextElementSibling; if (b) { b.textContent = el.value; b.className = 'badge ac mono'; } return; }
    if (el.dataset.sum !== undefined) { S.unlock.ladder.sums[+el.dataset.sum] = el.value; return; }
    const F = { tabQ: v => (S.tabQ = v), histQ: v => (S.hist.q = v), histFrom: v => (S.hist.from = v), histTo: v => (S.hist.to = v), clogQ: v => (S.clog.q = v), clogFrom: v => (S.clog.from = v), clogTo: v => (S.clog.to = v), docQ: v => (S.docF.q = v) }[el.dataset.input];
    if (F) { F(el.value); render(); return; }
    if (el.dataset.a11ySize) { setA11y({ textSize: +el.value }); return; }
    if (el.dataset.input === 'region') { S.selection.region = el.value.trim(); return; }
    if (['name', 'port', 'health'].includes(el.dataset.input)) { S.wizard[el.dataset.input] = el.value.trim(); clearTimeout(S.wt); S.wt = setTimeout(() => { saveDraft(); render(); }, 250); return; }
    if (el.dataset.env) { S.wizard.env[+el.dataset.env][el.dataset.k] = el.value; return; }
    if (el.dataset.range) { set(el.dataset.range, +el.value); return; }
    if (el.dataset.input === 'b64in') { S.tools.b64in = el.value; S.tools.b64out = null; return; }
  });
  root.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset.input === 'displayName') set('displayName', el.value.trim());
    if (el.dataset.input === 'accentText') { const hex = Lib.parseColor(el.value); if (hex) { await set('rainbow', false); set('accent', hex); } else toast('Not a colour this app can read', 'err'); }
    if (el.dataset.select) set(el.dataset.select, el.value);
    if (el.dataset.voice) set('voices', { ...S.settings.voices, [el.dataset.voice]: el.value });
    if (el.dataset.file === 'logo' && el.files[0]) logoUpload(el.files[0]);
    if (el.dataset.input === 'logoBg') { const c = Lib.parseColor(el.value); if (c) set('logo', { ...logo(), bg: c }); }
    if (el.dataset.b64file && el.files[0]) b64File(el.files[0]);
    if (el.dataset.convfile && el.files[0]) convertFile(el.dataset.convfile, el.files[0]);
    if (el.dataset.dep) { el.checked ? S.depSel.add(el.dataset.dep) : S.depSel.delete(el.dataset.dep); render(); }
    if (el.dataset.note) { el.checked ? S.noteSel.add(el.dataset.note) : S.noteSel.delete(el.dataset.note); render(); }
    if (el.dataset.file === 'vocab' && el.files[0]) applyVocabFile(el.files[0]);
    if (el.dataset.file === 'style' && el.files[0]) apImport(el.files[0]);
    if (el.dataset.ap === 'font') { apSet('font', el.value || undefined); render(); }
    else if (el.dataset.ap && el.type === 'color') { apSet(el.dataset.ap, el.value); render(); }
    else if (el.dataset.ap && el.type === 'range') { S.apDrag = false; render(); }
  });
  async function applyVocabFile(file) {
    const r = Lib.parseVocabulary(await file.text());
    if (!r.ok) { toast('Wording file refused (' + r.error.toLowerCase().replace(/_/g, ' ') + '). Nothing changed.', 'err'); cue('err'); return; }
    await set('vocabulary', r.vocabulary); const n = Object.keys(r.vocabulary.entries).length; toast(n + ' words applied' + (emojiOn() ? ' ✨' : '')); celebrate(`${n} word${n === 1 ? '' : 's'} applied`);
  }
  document.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && /\.json$/i.test(f.name)) applyVocabFile(f); });
  async function ensureData(view) {
    if (view === 'history') await loadHistory();
    if (view === 'changelog' && !S.changelog) { S.changelog = await api.changelog(); }
    if (view === 'docs' && !S.docs) { S.docs = await api.docs(); }
    if (view === 'tools' && !S.editors) { S.editors = (await api.editors?.()) || { vscode: false }; }
    render();
  }
  function togglePalette() { S.palette = S.palette ? null : { q: '', regex: false, sel: 0 }; render(); document.getElementById('pq')?.focus(); }
  Kit.bind('palette', 'Ctrl+Shift+F', togglePalette);
  Kit.bind('new', 'Ctrl+N', () => go('wizard'));
  Kit.bind('settings', 'Ctrl+,', () => go('settings'));
  Kit.bind('keys', 'F1', () => openPanel('keys'));
  Kit.bind('copyLink', 'Ctrl+Shift+C', () => { const at = document.activeElement?.closest?.('[data-menu="deploy"]')?.dataset.at; const d = S.history.deployments.find(x => (x.id || x.at) === at) || (S.result?.ok && S.result); if (d?.url) copy(d.url); }, () => !!(document.activeElement?.closest?.('[data-menu="deploy"]') || S.result?.ok));
  Kit.bind('remove', 'Delete', () => { const el = document.activeElement.closest('[data-menu="deploy"]'); removeRecords([el.dataset.at], el); }, () => !!document.activeElement?.closest?.('[data-menu="deploy"]') && !document.activeElement.matches('input'));
  document.addEventListener('keydown', e => {
    if (Kit.menuOpen() || Kit.confirmOpen()) return;
    if (Kit.nudgePanel(e)) return;
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); menuFromKeyboard(); return; }
    if (e.key === 'Escape') { if (S.palette) { S.palette = null; render(); } else if (S.panel) closePanel(); return; }
    if (S.palette && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
      e.preventDefault(); const P = S.palette;
      if (e.key === 'Enter') { const c = P.items?.[P.sel]; S.palette = null; render(); c?.run(); return; }
      P.sel = Math.max(0, Math.min((P.items?.length || 1) - 1, P.sel + (e.key === 'ArrowDown' ? 1 : -1))); render(); document.getElementById('pq')?.focus(); return;
    }
    { const map = { palette: 'act:palette', new: 'go:wizard', settings: 'go:settings', keys: 'panel:keys' }; const combo = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join('+'); const hit = Object.entries(map).find(([id]) => Kit.keysFor(id) === combo); if (hit && isLocked(hit[1])) { e.preventDefault(); guard(hit[1]); return; } }
    Kit.dispatch(e);
  });
  api.onWindow(w => { S.maximized = w.maximized; render(); });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyAppearance);
  setInterval(applyAppearance, 60000);
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => S.view === 'settings' && render();

  // ---------- start ----------
  (async () => {
    if (browser && !(await api.ready()).ok) return;
    VERSION = await api.version();
    await refreshLocks(); S.appdata = (await api.appdata()).path;
    S.prov = await api.provenance(); S.update = await api.updateState();
    api.onUpdate(u => { if (u.status !== S.update?.status) S.updateLater = false; S.update = u; render(); });
    const settingsResult = await api.settings();
    if (!settingsResult.ok || !settingsResult.settings) return;
    S.settings = settingsResult.settings;
    S.sources = settingsResult.sources || {}; S.defaults = settingsResult.defaults || {};
    applyAppearance();
    const d = S.settings.draft;
    if (d) Object.assign(S.wizard, { step: Math.min(d.step || 1, 3), file: d.file || null, name: d.name || '', port: d.port || '', health: d.health || '/', env: d.env || [] });
    S.view = S.settings.setupComplete ? 'deploys' : 'setup';
    if (S.settings.selection) S.selection = S.settings.selection;
    render();
    await Promise.all([loadHistory(), loadPrereq(), loadProfiles()]);
    if (S.selection?.region) verify();
    if (S.wizard.file) api.inspectSource(S.wizard.file).then(i => { S.wizard.inspect = i; render(); });
    render();
    const ds = await api.dimSum();
    if (ds.ok && ds.show && !S.run) { S.dimsum = ds.dish; render(); setTimeout(() => { S.dimsum = null; render(); }, 7000); }
  })();
})();
