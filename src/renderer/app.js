/* global Lib */
'use strict';
(() => {
  const api = window.deployer;
  const root = document.getElementById('app');
  const live = document.getElementById('live');
  const VERSION = '0.1.0';
  const S = {
    view: 'setup', settings: null, prereq: null, profiles: null, profilesError: null,
    selection: null, identity: null, login: null, install: null,
    wizard: { step: 1, file: null, inspect: null, name: '', port: '', health: '/', env: [] },
    run: null, result: null, history: { history: [], deployments: [] },
    palette: null, drawer: false, notes: [], toasts: [], dimsum: null, troll: false, maximized: false,
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = k => esc(Lib.t(k, S.settings?.language || 'en'));
  const ic = (name, cls = '') => `<i class="ms ${cls}" aria-hidden="true">${name}</i>`;
  const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const emojiOn = () => S.settings?.emoji && !S.settings?.school;

  // ---------- feedback: live region, narration, sounds, toasts, notifications ----------
  let audio;
  function cue(kind) {
    if (!S.settings?.sounds) return;
    try {
      audio ||= new AudioContext();
      const notes = { tap: [660], ok: [523, 784], err: [392, 262], start: [440, 587] }[kind] || [660];
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
    const v = speechSynthesis.getVoices().find(x => x.name === S.settings.voice); if (v) u.voice = v;
    u.rate = S.settings.rate || 1; speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function toast(text, kind = 'ok') {
    const id = Math.random().toString(36).slice(2);
    S.toasts.push({ id, text, kind }); S.notes.unshift({ text, kind, at: time() }); S.notes = S.notes.slice(0, 50);
    say(text); renderToasts();
    setTimeout(() => { S.toasts = S.toasts.filter(t => t.id !== id); renderToasts(); }, 4200);
  }

  // ---------- appearance ----------
  let rainbowTimer;
  function applyAppearance() {
    const s = S.settings; if (!s) return;
    const sched = Lib.scheduledTheme(s.schedule, new Date());
    const theme = sched || (s.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme);
    const reduce = s.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.className = ['app', theme === 'light' ? 'light' : '', reduce ? 'reduce' : '', s.calm ? 'calm' : '', s.focus ? 'focus' : ''].join(' ');
    document.body.style.background = theme === 'light' ? '#f4f6fa' : '#0b0d12';
    clearInterval(rainbowTimer);
    if (s.rainbow && !reduce) { let h = 210; rainbowTimer = setInterval(() => { h = (h + 2) % 360; root.style.setProperty('--ac', `hsl(${h} 90% 70%)`); }, 120); }
    else root.style.setProperty('--ac', s.rainbow ? 'hsl(210 90% 70%)' : s.accent);
    document.title = s.displayName || 'AWS App Deployer';
  }
  async function set(key, value) {
    const r = await api.setSetting(key, value);
    if (r.ok) { S.settings[key] = r.value; applyAppearance(); render(); cue('tap'); }
    return r;
  }

  // ---------- data loading ----------
  async function loadPrereq() { S.prereq = null; render(); S.prereq = await api.prerequisites(); render(); }
  async function loadProfiles() {
    S.profiles = null; S.profilesError = null; render();
    const r = await api.profiles();
    if (r.ok) S.profiles = r.profiles; else { S.profiles = []; S.profilesError = r.error; }
    if (!S.selection && S.settings.selection) S.selection = S.settings.selection;
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
        const ok = S.result.ok; cue(ok ? 'ok' : 'err'); toast(Lib.funny(ok ? 'success' : 'failure', S.settings.school ? 1 : S.settings.funnyLevel, S.settings.language) + (ok && emojiOn() ? ' 🎉' : ''), ok ? 'ok' : 'err'); }
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
    const nav = (v, icon, key) => `<button class="navi ${S.view === v || (v === 'deploys' && ['wizard', 'run', 'result'].includes(S.view)) ? 'on' : ''}" data-go="${v}"><span class="pill">${ic(icon)}</span>${T(key)}</button>`;
    return `
    <div class="titlebar"><span class="name">${esc(S.settings?.displayName || 'AWS App Deployer')}</span><span class="small mono" title="Version">v${VERSION}</span><span class="grow"></span>
      <button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-act="palette" aria-label="${T('palette')}">${ic('search', 'sm')}<span class="kbd">Ctrl+Shift+F</span></button>
      <button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-act="drawer" aria-label="${T('notifications')}">${ic('notifications', 'sm')}${S.notes.length ? `<span class="badge ac" style="height: 18px">${S.notes.length}</span>` : ''}</button>
      <div class="caption"><button data-win="minimize" aria-label="Minimize">${ic('remove')}</button><button data-win="maximize" aria-label="${S.maximized ? 'Restore' : 'Maximize'}">${ic(S.maximized ? 'filter_none' : 'crop_square')}</button><button class="x" data-win="close" aria-label="Close">${ic('close')}</button></div></div>
    <div class="body">
      ${rail ? `<nav class="rail" aria-label="Main">
        <button class="fab" data-go="wizard" aria-label="${T('new_deployment')}">${ic('add', 'lg')}</button>
        ${nav('deploys', 'rocket_launch', 'nav_deploys')}${nav('accounts', 'key', 'nav_accounts')}${nav('settings', 'tune', 'nav_settings')}
        <span class="gap"></span>${nav('help', 'help', 'nav_help')}</nav>` : ''}
      <main class="main ${rail ? "" : "bare"}" id="main" tabindex="-1">${content}</main>
    </div>`;
  }
  const page = (title, actions, body) => `<header class="topbar"><h1 class="rise">${title}</h1><span class="grow"></span>${actions || ''}</header><div class="content">${body}</div>`;

  // ---------- views ----------
  function prereqCard() {
    const p = S.prereq;
    if (!p) return `<div class="card"><span class="h2">${T('checking')}</span><div class="sk" style="height: 18px; width: 70%"></div><div class="sk" style="height: 18px; width: 55%"></div></div>`;
    const row = (ok, title, sub) => `<div class="step ${ok ? 'done' : 'bad'}"><span class="n">${ic(ok ? 'check' : 'close', 'sm')}</span><span class="stack"><span class="t">${title}</span><span class="m">${sub}</span></span></div>`;
    const missing = [!p.aws?.available && 'aws', !(p.docker?.available && p.docker?.running) && 'docker'].filter(Boolean);
    const installing = S.install && !S.install.done;
    return `<div class="card rise" style="--i:3; flex: 1">
      <span class="h2">${T('checking')}</span>
      <div class="steps">${row(p.aws?.available, 'AWS CLI v2.22 or later', p.aws?.available ? 'Found' : p.aws?.error === 'AWS_CLI_UPDATE_REQUIRED' ? 'Installed, but too old for browser sign-in' : 'Not found')}
      ${row(p.docker?.available && p.docker?.running, 'Docker Engine and Compose', p.docker?.available ? (p.docker.running ? 'Running' : 'Installed, not running') : 'Not found')}</div>
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
      <div class="stack rise" style="--i:1; gap: 10px; max-width: 720px"><h1 class="h1" style="font-size: 38px; letter-spacing: -.035em">Deploy a container to your own AWS account.</h1><p class="sub" style="margin: 0; font-size: 16px">Pick a Dockerfile or Compose project, press Deploy, and get a public link anyone can open. Everything runs on this computer with your own AWS credentials.</p></div>
      <div class="card rise" style="--i:2; flex-direction: row; gap: 14px; background: var(--warn-c)">${ic('payments', 'fill')}<span class="stack"><span style="font-weight: 650">${T('charges')}</span><span class="sub">${T('charges_sub')}</span></span></div>
      <div class="cols" style="align-items: stretch">
        <div class="wide"><div class="card rise" style="--i:3"><div class="row"><span class="tile ac">${ic('badge', 'fill')}</span><span class="stack grow"><span class="h2">Use an AWS CLI profile</span><span class="small">${T('profiles')}</span></span><button class="btn text" data-act="reload-profiles">${ic('refresh')}</button></div>${list}
          <button class="btn fillb" data-act="go-connect" ${S.selection ? '' : 'disabled'} style="align-self: flex-start">${T('continue')}${ic('arrow_forward')}</button></div>
          ${installPanel()}</div>
        <div class="side">${prereqCard()}</div>
      </div></div>`;
  }
  function viewAccounts() {
    const s = S.selection, L = S.login, id = S.identity;
    let main;
    if (!s) main = `<div class="empty"><span class="tile">${ic('key_off')}</span><span class="h2">Choose a profile first</span><button class="btn fillb" data-go="setup">${T('setup')}</button></div>`;
    else if (L && !L.done) main = `<div class="card raise" style="padding: 32px; gap: 24px; border: 1px solid var(--line)"><div class="row" style="gap: 18px"><span class="tile ac" style="width: 56px; height: 56px; border-radius: 18px">${ic('open_in_browser', 'lg fill')}</span><span class="stack"><span style="font-size: 20px; font-weight: 650">${T('waiting_browser')}</span><span class="sub">Approve the request in your browser. AWS CLI handles the sign-in; this window comes back by itself.</span></span></div>
      <div class="steps" aria-live="polite"><div class="step done"><span class="n">${ic('check', 'sm')}</span><span class="t">Browser opened</span></div><div class="step now"><span class="n">2</span><span class="stack"><span class="t">Waiting for approval</span><span class="m">Times out after 5 minutes</span></span></div><div class="step off"><span class="n">3</span><span class="t">Verify account</span></div></div>
      <button class="btn out" data-act="cancel-op" data-op="${L.op}" style="align-self: flex-start">Cancel sign-in</button></div>`;
    else if (id) main = `<div class="card raise rise" style="padding: 28px; gap: 20px; border: 1px solid var(--line)"><div class="row" style="gap: 16px"><span class="tile ok pop" style="width: 56px; height: 56px; border-radius: 18px"><svg class="check" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg></span><span class="stack"><span style="font-size: 20px; font-weight: 650">${T('verified')}</span><span class="sub">Deployments from this profile go to this account only.</span></span></div>
      <dl class="kv" style="margin: 0; grid-template-columns: 140px minmax(0, 1fr)"><dt>Account ID</dt><dd class="mono">${esc(id.accountId.replace(/(\d{4})(?=\d)/g, '$1 '))}</dd><dt>Role</dt><dd>${esc(roleOf(id.arn))}</dd><dt>Signed-in ARN</dt><dd class="mono" style="overflow-wrap: anywhere; color: var(--tx2)">${esc(id.arn)}</dd><dt>Profile</dt><dd class="mono">${esc(id.profile)}</dd><dt>Region</dt><dd class="mono">${esc(id.region)}</dd></dl>
      <div class="row" style="flex-wrap: wrap"><button class="btn fillb" data-go="wizard">${ic('rocket_launch')}Start a deployment</button><button class="btn out" data-act="verify">Re-verify</button></div></div>`;
    else main = `<div class="card raise" style="padding: 28px; gap: 18px; border: 1px solid var(--line)"><div class="row" style="gap: 16px"><span class="tile ${S.loginExpired ? 'warn' : 'ac'}" style="width: 56px; height: 56px; border-radius: 18px">${ic(S.loginExpired ? 'lock_clock' : 'login', 'lg fill')}</span><span class="stack"><span style="font-size: 20px; font-weight: 650">${S.loginExpired ? 'Your AWS sign-in expired' : 'Sign in to ' + esc(s.profile)}</span><span class="sub">${S.loginExpired ? 'Nothing was changed in AWS. Sign in again to read status or deploy.' : 'Your browser opens the AWS access portal. This is not your AWS console password.'}</span></span></div>
      ${!s.region ? `<div class="field"><label for="reg">Region for this profile</label><input id="reg" class="mono" placeholder="us-east-1" data-input="region"></div>` : ''}
      ${L?.error ? `<div class="card" style="background: var(--err-c); flex-direction: row; gap: 10px">${ic('error', 'fill')}<span>${esc(Lib.errorText(L.error))}</span></div>` : ''}
      <button class="btn fillb" data-act="login" style="align-self: flex-start">${ic('open_in_browser')}${T('sign_in')}</button></div>`;
    const list = (S.profiles || []).map(p => `<button class="li ${s?.profile === p.name ? 'sel' : ''}" data-act="pick-profile" data-profile="${esc(p.name)}" data-region="${esc(p.region || '')}"><span class="tile ${s?.profile === p.name && id ? 'ok' : ''}">${ic(s?.profile === p.name && id ? 'verified_user' : 'key', 'fill')}</span><span class="stack grow"><span class="t mono">${esc(p.name)}</span><span class="m">${esc(p.region || 'region needed')}</span></span></button>`).join('');
    return page(T('nav_accounts'), `<button class="btn out" data-act="reload-profiles">${ic('refresh')}${T('refresh')}</button>`, `<div class="cols"><div class="side extra" style="flex: 1 1 340px"><span class="label">${T('profiles').toUpperCase()}</span><div class="list">${list || `<span class="small" style="padding: 12px">${T('no_profiles')}</span>`}</div>
      <div class="card outline" style="flex-direction: row; gap: 12px">${ic('group')}<span class="small">Each Windows user keeps their own profiles and AWS credentials. Signing in to AWS gives this app permission to deploy; it never adds a sign-in to your deployed site.</span></div></div><div class="wide">${main}</div></div>`);
  }
  function viewDeploys() {
    const d = [...S.history.deployments].reverse();
    const chip = S.identity ? `<button class="chip" data-go="accounts"><span class="dot"></span>${esc(S.identity.profile)} <span class="mono" style="color: var(--tx3)">${esc(S.identity.accountId)}</span></button><span class="chip">${ic('public', 'sm')}${esc(S.identity.region)}</span>` : `<button class="chip" data-go="accounts">${ic('key_off', 'sm')}Not signed in</button>`;
    const running = S.run ? `<button class="li" data-go="run"><span class="tile ac"><span class="spin"></span></span><span class="stack grow"><span class="t">${esc(S.run.name)}</span><span class="m">${esc(stageLabel(S.run.stage || 'validation'))}</span><span class="bar" style="margin-top: 6px; max-width: 320px"><i style="width: ${Math.max(4, 100 * Lib.stageIndex(S.run.stage || 'validation') / Lib.STAGES.length)}%"></i></span></span><span class="badge ac">Deploying</span></button>` : '';
    const rows = d.map(x => `<div class="li static"><span class="tile ${x.ok ? 'ok' : 'warn'}">${ic(x.ok ? 'deployed_code' : 'history', 'fill')}</span><span class="stack grow"><span class="t">${esc(x.name)}</span><span class="m">${esc(x.region)} · ${new Date(x.at).toLocaleString()}${x.ok ? '' : ' · ' + esc(Lib.errorText(x.error))}</span></span>${x.ok ? `<button class="btn text" data-act="open-url" data-url="${esc(x.url)}">${T('open')}</button><span class="badge ok">${ic('check', 'sm')}Healthy at deploy</span>` : `<span class="badge warn">Stopped</span>`}</div>`).join('');
    const body = !d.length && !S.run ? `<div class="empty rise"><span class="tile ac">${ic('rocket_launch', 'lg fill')}</span><span class="h2" style="font-size: 20px">${T('no_deployments')}</span><span class="sub" style="max-width: 480px">${T('no_deployments_sub')}</span><button class="btn fillb" data-go="wizard">${ic('add')}${T('new_deployment')}</button></div>`
      : `<div class="list rise">${running}${rows}</div><div class="row"><span class="small grow">Status shown is the result recorded when each deployment finished on this computer.</span><button class="btn text" data-act="export">${T('export_history')}</button></div>`;
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
      body = `<div class="drop ${W.file ? 'idle' : ''}" style="flex-wrap: wrap"><span class="tile ac" style="width: 56px; height: 56px; border-radius: 18px">${ic('folder_open', 'lg fill')}</span><span class="stack grow" style="flex: 1"><span style="font-weight: 650; overflow-wrap: anywhere">${W.file ? esc(W.file) : T('choose_file')}</span><span class="sub">${W.inspecting ? 'Inspecting…' : I?.ok ? 'Inspected: ' + esc(I.source.kind) + (I.source.containerPort ? ' · port ' + I.source.containerPort : ' · no single exposed port') : I ? esc(Lib.errorText(I.error)) : 'Nothing is created in AWS until you press Deploy.'}</span></span><button class="btn out" data-act="pick">${W.file ? 'Choose another' : 'Choose file'}</button></div>${reasons}
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
    const tog = (key, label, sub, extra = '') => `<div class="set" data-search="${esc(label + ' ' + sub)}"><span class="stack grow"><span class="t" style="font-weight: 600">${label}</span><span class="small">${sub}</span></span><button class="toggle ${s[key] ? 'on' : ''}" role="switch" aria-checked="${!!s[key]}" aria-label="${label}" data-toggle="${key}"></button>${extra}</div>`;
    const seg = (key, opts) => `<span class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${s[key] === v}" class="${s[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${l}</button>`).join('')}</span>`;
    const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    const q = S.settingsQuery || '';
    return page(T('nav_settings'), `<div class="field" style="flex: 0 1 380px; position: relative"><label for="sq" class="sr">${T('search_settings')}</label><input id="sq" data-input="settingsQuery" placeholder="${T('search_settings')}" value="${esc(q)}" style="padding-left: 42px; border-radius: 22px"><i class="ms" style="position: absolute; left: 14px; top: 12px; color: var(--tx3)" aria-hidden="true">search</i></div>`,
    `<div class="cols"><div class="wide" style="flex-direction: row; flex-wrap: wrap; align-items: flex-start">
      <div class="card" style="flex: 1 1 360px; gap: 0"><span class="h2" style="padding-bottom: 6px">Appearance</span>
        <div class="set" data-search="theme light dark system"><span class="stack grow"><span class="t" style="font-weight: 600">${T('theme')}</span><span class="small">Follows Windows unless you pick one</span></span>${seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}</div>
        <div class="set" data-search="accent colour color"><span class="stack grow"><span class="t" style="font-weight: 600">${T('accent')}</span><span class="small">Type a hex, rgb(), hsl() or colour name</span></span><span class="row" style="gap: 8px">${['#6ea8ff', '#4ade9a', '#f5b451', '#ff8a8a'].map(c => `<button class="sw ${!s.rainbow && s.accent === c ? 'on' : ''}" style="background: ${c}" data-act="accent" data-c="${c}" aria-label="Accent ${c}"></button>`).join('')}<button class="sw rainbow ${s.rainbow ? 'on' : ''}" data-act="rainbow" aria-label="Rainbow accent"></button></span></div>
        <div class="set" data-search="accent custom colour"><span class="stack grow"><label class="t" for="acc" style="font-weight: 600">Custom colour</label><span class="small mono">${esc(s.accent)} · ${esc(Lib.toRgb(s.accent))}</span></span><input id="acc" class="mono" style="width: 150px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px" data-input="accentText" placeholder="#6ea8ff"></div>
        ${tog('reduceMotion', T('reduce_motion'), 'Replaces movement with simple fades')}
        <div class="set" data-search="app name rename display"><span class="stack grow"><label class="t" for="dn" style="font-weight: 600">${T('app_title')}</label><span class="small">Shown in the title bar and taskbar</span></span><input id="dn" style="width: 180px; height: 40px; border-radius: 12px; border: 1px solid var(--line2); background: var(--s1); color: var(--tx); padding: 0 10px" data-input="displayName" value="${esc(s.displayName)}" placeholder="AWS App Deployer"><button class="btn text" data-act="reset" data-key="displayName">${T('reset')}</button></div>
        <div class="set" data-search="schedule light dark time"><span class="stack grow"><span class="t" style="font-weight: 600">${T('schedule')}</span><span class="small">Light from ${esc(s.schedule.lightAt)}, dark from ${esc(s.schedule.darkAt)}, every day</span></span><button class="toggle ${s.schedule.enabled ? 'on' : ''}" role="switch" aria-checked="${s.schedule.enabled}" aria-label="${T('schedule')}" data-act="schedule"></button></div>
      </div>
      <div class="card" style="flex: 1 1 360px; gap: 0"><span class="h2" style="padding-bottom: 6px">Language and voice</span>
        <div class="set" data-search="language english cantonese both"><span class="stack grow"><span class="t" style="font-weight: 600">${T('language')}</span></span>${seg('language', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']])}</div>
        ${s.school ? '' : `<div class="set" style="flex-wrap: wrap" data-search="funny level humour"><span class="stack grow" style="flex: 1 1 170px"><label class="t" for="fl" style="font-weight: 600">${T('funny')}</label><span class="small">Changes the wording only, never the facts</span></span><input id="fl" type="range" min="1" max="5" value="${s.funnyLevel}" data-range="funnyLevel" style="flex: 1 1 100px; min-width: 0"><span class="badge ac" style="width: 28px; justify-content: center; padding: 0">${s.funnyLevel}</span><span class="card" style="flex: 1 1 100%; background: var(--s1); padding: 12px 14px; margin-top: 10px; gap: 2px"><span class="small">Preview</span><span>${esc(Lib.funny('success', s.funnyLevel, s.language))}</span></span></div>`}
        ${s.school ? '' : tog('emoji', T('emoji'), 'Adds emoji to some messages')}
        ${tog('narration', T('narration'), voices.length ? 'Uses a voice installed on this computer' : 'No voices found on this computer')}
        ${s.narration && voices.length ? `<div class="set"><label class="grow" for="vc">Voice</label><select id="vc" data-select="voice"><option value="">System default</option>${voices.map(v => `<option ${v.name === s.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : ''}
        ${tog('sounds', T('sounds'), 'Soft cues for deploy, success and errors')}
      </div></div>
      <div class="side">
        <div class="drop idle" style="flex-direction: column; align-items: flex-start; gap: 12px; padding: 22px" data-search="personal wording vocabulary json"><div class="row"><span class="tile ac">${ic('dictionary', 'fill')}</span><span class="stack"><span style="font-weight: 650">${T('vocabulary')}</span><span class="small">${s.vocabulary ? Object.keys(s.vocabulary.entries).length + ' words active' : 'Drop a vocabulary JSON anywhere in the app'}</span></span></div><span class="small">Format: {"version": 1, "entries": {"Deploy": "Ship"}}. Stays on this computer. Applied all at once or not at all.</span><span class="row" style="gap: 8px"><label class="btn tonal" for="vf">Choose file</label><input id="vf" type="file" accept="application/json,.json" class="sr" data-file="vocab"><button class="btn text" data-act="vocab-clear" ${s.vocabulary ? '' : 'disabled'}>Clear</button></span></div>
        <div class="card" style="gap: 0"><span class="h2" style="padding-bottom: 6px">Focus and comfort</span>
          ${tog('focus', T('focus'), 'Hides side panels so one action leads')}${tog('calm', T('calm'), 'No pulsing or looping motion')}${tog('school', T('school'), 'Hides playful extras everywhere')}
          ${s.school ? '' : `<div class="set" style="flex-wrap: wrap" data-search="dim sum surprise"><span class="stack grow"><span class="t" style="font-weight: 600">${T('dim_sum')}</span><span class="small">A rare treat at launch</span></span><button class="toggle on" role="switch" aria-checked="true" aria-label="${T('dim_sum')}" data-act="troll"></button>${S.troll ? `<span class="card pop" style="flex: 1 1 100%; flex-direction: row; gap: 10px; align-items: center; padding: 10px 14px; margin-top: 10px; background: var(--warn-c)" role="status">${ic('lock', 'fill')}<span class="small" style="color: var(--tx)">${T('dim_sum_troll')}${emojiOn() ? ' 🥟' : ''}</span></span>` : ''}</div>`}
        </div>
        <button class="btn text" data-act="export" style="align-self: flex-start">${ic('download')}${T('export_history')}</button>
      </div></div>`);
  }
  function viewHelp() {
    return page(T('nav_help'), '', `<div class="cols"><div class="wide"><div class="card"><span class="h2">Keyboard</span><dl class="kv" style="margin: 0"><dt><span class="kbd">Ctrl+Shift+F</span></dt><dd>Command palette with regex search</dd><dt><span class="kbd">Ctrl+N</span></dt><dd>New deployment</dd><dt><span class="kbd">Ctrl+,</span></dt><dd>Settings</dd><dt><span class="kbd">Esc</span></dt><dd>Close palette or panel</dd></dl></div>
      <div class="card"><span class="h2">What a deployment creates</span><span class="sub">A VPC across two availability zones, a public Application Load Balancer, one NAT gateway, two Fargate tasks in private subnets, an ECR repository with an immutable image, and CloudWatch logs. These cost money until you delete them in AWS.</span></div>
      <div class="card"><span class="h2">Not supported yet</span><span class="sub">Multi-service Compose, volumes, Compose secrets, adjustable task size, custom-domain HTTPS from the app, automatic updates from a repository, and deleting a deployment from the app.</span></div></div>
      <div class="side"><div class="card"><span class="h2">About</span><span class="small">Version ${VERSION}. Free, source on GitHub. Not affiliated with Amazon Web Services.</span><button class="btn out" data-act="open-url" data-url="https://github.com/Ding-Ding-Projects/aws-app-deployer" style="align-self: flex-start">${ic('code')}Source</button><button class="btn text" data-go="setup" style="align-self: flex-start">Run setup again</button></div></div></div>`);
  }

  // ---------- overlays ----------
  const COMMANDS = [
    { id: 'new', label: 'Deploy new application', keywords: 'new wizard', run: () => go('wizard') },
    { id: 'deploys', label: 'Deployments', run: () => go('deploys') }, { id: 'accounts', label: 'Accounts and sign-in', keywords: 'aws login profile', run: () => go('accounts') },
    { id: 'settings', label: 'Settings', run: () => go('settings') }, { id: 'setup', label: 'Setup and tool check', keywords: 'install prerequisites', run: () => go('setup') },
    { id: 'help', label: 'Help and keyboard shortcuts', run: () => go('help') }, { id: 'theme', label: 'Toggle dark and light theme', run: () => set('theme', S.settings.theme === 'dark' ? 'light' : 'dark') },
    { id: 'motion', label: 'Toggle reduce motion', run: () => set('reduceMotion', !S.settings.reduceMotion) }, { id: 'export', label: 'Export history', run: () => api.exportHistory() },
    { id: 'notes', label: 'Notifications', run: () => { S.drawer = true; render(); } },
  ];
  function paletteHtml() {
    const P = S.palette; if (!P) return '';
    const r = Lib.search(COMMANDS, P.q, { regex: P.regex });
    const items = r.ok ? r.items : [];
    P.items = items; P.sel = Math.min(P.sel, Math.max(0, items.length - 1));
    return `<div class="overlay"><div class="scrim" data-act="close-palette" style="align-items: start; padding-top: 72px"><div class="dialog" role="dialog" aria-label="${T('palette')}" style="width: min(680px, 100%); padding: 10px; gap: 0" data-stop="1">
      <div class="row" style="padding: 8px 10px; gap: 10px; flex-wrap: wrap">${ic('search')}<label for="pq" class="sr">Command</label><input id="pq" class="mono" data-input="paletteQ" value="${esc(P.q)}" autocomplete="off" style="flex: 1 1 200px; min-width: 0; height: 40px; border: 0; background: transparent; color: var(--tx); font-size: 16px; outline: none"><button class="badge ${P.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" aria-pressed="${P.regex}" data-act="regex">.* Regex</button></div>
      ${P.regex && P.q ? `<div class="row small" style="padding: 4px 12px 10px; gap: 8px; flex-wrap: wrap">${r.ok ? (r.parts || []).map(p => `<span class="row" style="gap: 6px; white-space: nowrap"><span class="badge mute mono">${esc(p.token)}</span>${esc(p.meaning)}</span>`).join('') + `<span class="badge ok">${ic('check', 'sm')}valid · ${items.length} matches</span>` : `<span class="badge err">${esc(r.error)}</span>`}</div>` : ''}
      <div class="divider"></div><div class="list" style="background: transparent" role="listbox">${items.map((c, i) => `<button class="li ${i === P.sel ? 'sel' : ''}" role="option" aria-selected="${i === P.sel}" data-cmd="${c.id}">${esc(c.label)}</button>`).join('') || '<span class="small" style="padding: 12px">No matches</span>'}</div>
      <div class="row small" style="padding: 8px 12px; gap: 14px"><span><span class="kbd">↑↓</span> move</span><span><span class="kbd">Enter</span> run</span><span><span class="kbd">Esc</span> close</span></div></div></div></div>`;
  }
  function drawerHtml() {
    if (!S.drawer) return '';
    return `<div class="drawer" role="region" aria-label="${T('notifications')}"><div class="row"><span class="h2">${T('notifications')}</span><span class="grow"></span><button class="btn text" data-act="clear-notes">${T('clear_all')}</button><button class="btn text" data-act="drawer" aria-label="Close">${ic('close')}</button></div>
      ${S.notes.map(n => `<div class="li static" style="padding: 8px 0"><span class="tile ${n.kind === 'err' ? 'err' : 'ok'}">${ic(n.kind === 'err' ? 'error' : 'check_circle', 'fill')}</span><span class="stack grow"><span class="t">${esc(n.text)}</span><span class="m">${esc(n.at)}</span></span></div>`).join('') || '<span class="small">Nothing yet</span>'}</div>`;
  }
  function dimsumHtml() {
    const d = S.dimsum; if (!d) return '';
    return `<div class="dimsum" role="status">${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.en)}">` : `<span class="tile warn" style="width: 64px; height: 64px">${ic('ramen_dining', 'lg fill')}</span>`}<span class="stack"><span class="small">Dim sum surprise</span><span style="font-weight: 650">${esc(d.en)} · ${esc(d.zh)}</span></span></div>`;
  }
  function renderToasts() {
    let el = document.getElementById('toasts'); if (!el) { el = document.createElement('div'); el.id = 'toasts'; el.className = 'toasts'; document.body.appendChild(el); }
    el.innerHTML = S.toasts.map(t => `<div class="toast" role="status">${ic(t.kind === 'err' ? 'error' : 'check_circle', 'fill')}${esc(t.text)}</div>`).join('');
  }

  // ---------- render ----------
  function vocabularize(node) {
    const v = S.settings?.vocabulary; if (!v) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('.ms, .mono, input, textarea, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n; (n = walker.nextNode());) { const next = Lib.applyVocabulary(n.nodeValue, v); if (next !== n.nodeValue) n.nodeValue = next; }
  }
  function render() {
    if (!S.settings) return;
    const focusId = document.activeElement?.id, caret = document.activeElement?.selectionStart;
    const views = { setup: viewSetup, accounts: viewAccounts, deploys: viewDeploys, wizard: viewWizard, run: viewRun, result: viewResult, settings: viewSettings, help: viewHelp };
    root.innerHTML = shell((views[S.view] || viewDeploys)(), { rail: S.view !== 'setup' }) + paletteHtml() + drawerHtml() + dimsumHtml();
    if (S.view === 'settings' && S.settingsQuery) { const q = S.settingsQuery.toLowerCase(); root.querySelectorAll('[data-search]').forEach(el => { el.hidden = !el.dataset.search.toLowerCase().includes(q); }); }
    vocabularize(root);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch { } } }
  }
  function go(view) { S.view = view; S.palette = null; render(); document.getElementById('main')?.focus?.(); }
  window.__go = v => { if (v === 'palette') { S.palette = { q: 'dep', regex: false, sel: 0 }; render(); } else go(v); };

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-go],[data-act],[data-win],[data-toggle],[data-set],[data-cmd]');
    if (!t) return;
    if (t.dataset.stop && e.target === t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.win) { const r = await api.window(t.dataset.win); S.maximized = r.maximized; return; }
    if (t.dataset.toggle) return set(t.dataset.toggle, !S.settings[t.dataset.toggle]);
    if (t.dataset.set) return set(t.dataset.set, t.dataset.val);
    if (t.dataset.cmd) { const c = COMMANDS.find(x => x.id === t.dataset.cmd); S.palette = null; render(); return c?.run(); }
    const a = t.dataset.act;
    if (a === 'close-palette' && e.target.closest('[data-stop]')) return;
    switch (a) {
      case 'palette': S.palette = S.palette ? null : { q: '', regex: false, sel: 0 }; render(); document.getElementById('pq')?.focus(); break;
      case 'close-palette': S.palette = null; render(); break;
      case 'regex': S.palette.regex = !S.palette.regex; render(); document.getElementById('pq')?.focus(); break;
      case 'drawer': S.drawer = !S.drawer; render(); break;
      case 'clear-notes': S.notes = []; render(); break;
      case 'recheck': loadPrereq(); break;
      case 'install': { const tools = t.dataset.tools.split(','); const r = await api.install(tools); if (r.ok) { S.install = { op: r.op, requested: Object.fromEntries(tools.map(x => [x, 1])), tools: {}, log: [[time(), 'Started one-click install']], done: false }; cue('start'); } render(); break; }
      case 'cancel-op': await api.cancel(t.dataset.op); break;
      case 'reload-profiles': loadProfiles(); break;
      case 'pick-profile': S.selection = { profile: t.dataset.profile, region: t.dataset.region || '' }; S.identity = null; S.login = null; S.loginExpired = false; if (S.selection.region) api.setSetting('selection', S.selection); render(); if (S.selection.region) verify(); break;
      case 'skip-setup': await set('setupComplete', true); go('deploys'); break;
      case 'go-connect': await set('setupComplete', true); go('accounts'); break;
      case 'login': { if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(S.selection.region || '')) { toast('Enter a region such as us-east-1', 'err'); break; } api.setSetting('selection', S.selection); const r = await api.login(S.selection); S.login = r.ok ? { op: r.op } : { done: true, error: r.error }; render(); break; }
      case 'verify': verify(); break;
      case 'wiz': S.wizard.step = +t.dataset.step; saveDraft(); render(); break;
      case 'wiz-restart': S.wizard.step = 3; go('wizard'); break;
      case 'pick': { const r = await api.pickSource(); if (!r.ok) break; S.wizard.file = r.path; S.wizard.inspecting = true; S.wizard.inspect = null; render(); const i = await api.inspectSource(r.path); S.wizard.inspecting = false; S.wizard.inspect = i;
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
  function saveDraft() { const W = S.wizard; api.setSetting('draft', { step: W.step, file: W.file, name: W.name, port: W.port, health: W.health, env: W.env.map(e => ({ k: e.k, v: '' })) }); }
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.input === 'paletteQ') { S.palette.q = el.value; S.palette.sel = 0; render(); return; }
    if (el.dataset.input === 'settingsQuery') { S.settingsQuery = el.value; render(); return; }
    if (el.dataset.input === 'region') { S.selection.region = el.value.trim(); return; }
    if (['name', 'port', 'health'].includes(el.dataset.input)) { S.wizard[el.dataset.input] = el.value.trim(); clearTimeout(S.wt); S.wt = setTimeout(() => { saveDraft(); render(); }, 250); return; }
    if (el.dataset.env) { S.wizard.env[+el.dataset.env][el.dataset.k] = el.value; return; }
    if (el.dataset.range) { set(el.dataset.range, +el.value); return; }
  });
  root.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset.input === 'displayName') set('displayName', el.value.trim());
    if (el.dataset.input === 'accentText') { const hex = Lib.parseColor(el.value); if (hex) { await set('rainbow', false); set('accent', hex); } else toast('Not a colour this app can read', 'err'); }
    if (el.dataset.select) set(el.dataset.select, el.value);
    if (el.dataset.file === 'vocab' && el.files[0]) applyVocabFile(el.files[0]);
  });
  async function applyVocabFile(file) {
    const r = Lib.parseVocabulary(await file.text());
    if (!r.ok) { toast('Wording file refused (' + r.error.toLowerCase().replace(/_/g, ' ') + '). Nothing changed.', 'err'); cue('err'); return; }
    await set('vocabulary', r.vocabulary); toast(Object.keys(r.vocabulary.entries).length + ' words applied' + (emojiOn() ? ' ✨' : '')); cue('ok');
  }
  document.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && /\.json$/i.test(f.name)) applyVocabFile(f); });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); S.palette = S.palette ? null : { q: '', regex: false, sel: 0 }; render(); document.getElementById('pq')?.focus(); return; }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); go('wizard'); return; }
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); go('settings'); return; }
    if (e.key === 'Escape') { if (S.palette) { S.palette = null; render(); } else if (S.drawer) { S.drawer = false; render(); } return; }
    if (S.palette && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
      e.preventDefault(); const P = S.palette;
      if (e.key === 'Enter') { const c = P.items?.[P.sel]; S.palette = null; render(); c?.run(); return; }
      P.sel = Math.max(0, Math.min((P.items?.length || 1) - 1, P.sel + (e.key === 'ArrowDown' ? 1 : -1))); render(); document.getElementById('pq')?.focus();
    }
  });
  api.onWindow(w => { S.maximized = w.maximized; render(); });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyAppearance);
  setInterval(applyAppearance, 60000);
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => S.view === 'settings' && render();

  // ---------- start ----------
  (async () => {
    S.settings = (await api.settings()).settings;
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
