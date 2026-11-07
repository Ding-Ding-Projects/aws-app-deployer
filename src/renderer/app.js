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
  const T = k => k === 'school' ? esc(S.schoolState?.name || 'School mode') : esc(Lib.t(k, S.settings?.language || 'en'));
  const ic = (name, cls = '') => `<i class="ms ${cls}" aria-hidden="true">${name}</i>`;
  const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const stamp = iso => { try { const d = new Date(iso); const p = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' }).formatToParts(d); const g = t => p.find(x => x.type === t)?.value || ''; return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')} ${g('timeZoneName')}`; } catch { return 'unavailable'; } };
  const provLine = () => { const p = S.prov; if (!p) return 'v' + VERSION; const cn = p.codeName?.available && !S.settings?.school ? ` · ${p.codeName.en} · ${p.codeName.zh}` : ''; return p.ok ? `v${p.version}${cn} · built ${stamp(p.builtAt)}` : `v${p.version} · build time unavailable (not a release build)`; };
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
  function toast(text, kind = 'ok', opts = {}) {
    const id = Math.random().toString(36).slice(2);
    if (S.settings && !S.settings.school && !opts.raw) text = Lib.styleMessage(text, kind, S.settings.funnyLevels, S.settings.language);
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
    document.body.style.zoom = (a.textSize || 100) / 100; root.style.setProperty('--zoom', (a.textSize || 100) / 100);
    document.body.style.background = theme === 'light' ? '#f4f6fa' : '#0b0d12';
    if (!browser && api.titleBar && S.overlayTheme !== theme) { S.overlayTheme = theme; api.titleBar({ dark: theme !== 'light' }); }
    clearInterval(rainbowTimer);
    if (s.rainbow && !reduce) { let h = 210; rainbowTimer = setInterval(() => { h = (h + 2) % 360; root.style.setProperty('--acc', `hsl(${h} 90% 70%)`); }, 120); }
    else root.style.setProperty('--acc', s.rainbow ? 'hsl(210 90% 70%)' : s.accent);
    document.title = s.displayName || 'AWS App Deployer';
    applyElementStyles();
  }
  async function set(key, value) {
    const r = await api.setSetting(key, value);
    if (r.ok && S.overlaid?.[key]) { const sched = Lib.scheduledValues(S.settings.schedules, new Date()); S.overrides[key] = JSON.stringify(sched[key]); delete S.base[key]; delete S.overlaid[key]; }
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
  // Background jobs started from tool screens (installs of optional tools, conversions, archives).
  S.jobs = {};
  const JOB_TEXT = { FFMPEG_MISSING: 'FFmpeg is not installed', SEVEN_ZIP_FULL_REQUIRED: 'RAR needs the full 7-Zip', WINGET_REQUIRED: 'This needs the Windows Package Manager (winget), which is not available here', ELEVATION_DECLINED: 'The Windows permission prompt was declined, so nothing was installed', POLICY_BLOCKED: 'A Windows or company policy blocked the installer', COMMAND_FAILED: 'The tool reported an error', CANCELLED: 'Cancelled', INVALID_INPUT: 'That file cannot be used', UNSUPPORTED_PLATFORM: 'Installing tools works on Windows only' };
  const jobError = r => (JOB_TEXT[r?.error] || String(r?.error || 'Failed').toLowerCase().replace(/_/g, ' ')) + (r?.detail ? `: ${r.detail}` : '');
  async function startJob(slot, promise, label) { const r = await promise; if (!r.ok) { toast(`${label} could not start: ${jobError(r)}`, 'err'); return; } S.jobs[r.op] = { slot, label, kind: null, progress: null, result: null }; render(); }
  const jobFor = slot => Object.entries(S.jobs).reverse().find(([, j]) => j.slot === slot);
  function jobHtml(slot) {
    const e = jobFor(slot); if (!e) return '';
    const [op, j] = e, pct = j.progress?.total ? Math.round(100 * j.progress.done / j.progress.total) : null;
    if (!j.result) return `<div class="row" style="gap: 8px"><span class="spin" style="width: 14px; height: 14px; border-width: 2px"></span><span class="small grow" style="flex: 1">${esc(j.label)}${pct !== null ? ` · ${pct}%` : j.progress?.step ? ` · ${esc(j.progress.step)}` : ''}</span><button class="btn text" data-act="cancel-op" data-op="${op}">Cancel</button></div>${pct !== null ? `<span class="bar"><i style="width: ${pct}%"></i></span>` : ''}`;
    return j.result.ok ? `<span class="row small" style="gap: 8px; flex-wrap: wrap"><span class="badge ok">Done</span>${j.result.path ? `<span class="mono" style="overflow-wrap: anywhere">${esc(j.result.path)}</span><button class="btn text" data-act="show-file" data-p="${esc(j.result.path)}">Show in folder</button>` : esc(j.label)}</span>` : `<span class="badge err" role="alert">${esc(jobError(j.result))}</span>`;
  }
  api.onOperation(ev => {
    if (S.jobs[ev.op]) { const j = S.jobs[ev.op]; if (ev.type === 'progress') { if (ev.step === 'token') { j.onToken?.(ev.delta); return; } j.progress = ev; } else if (ev.type !== 'started') { j.result = ev.result || { ok: false, error: ev.type.toUpperCase() }; j.onDone?.(j.result); if (j.slot === 'mc-create' && j.result.ok) { S.mc.sel = j.result.server.id; mcLoad().then(() => mcSelect(j.result.server.id)); } if (j.slot.startsWith('install-')) { S.mediaStatus = null; S.mc.java = null; S.ai.status = null; } if (j.quiet) { render(); return; } cue(j.result.ok ? 'ok' : 'err'); toast(j.result.ok ? `${j.label}: done` : `${j.label}: ${jobError(j.result)}`, j.result.ok ? 'ok' : 'err'); } render(); return; }
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
        const ok = S.result.ok; cue(ok ? 'ok' : 'err'); toast(Lib.funny(ok ? 'success' : 'failure', S.settings.school ? 1 : S.settings.funnyLevels, S.settings.language) + (ok && emojiOn() ? ' 🎉' : ''), ok ? 'ok' : 'err', { raw: true }); }
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
    // On a utility tab the rail marks nothing: the tab strip shows where you are, and a rail click returns to the Workspace tab.
    const inWs = S.active === 'ws', here = v => inWs && (S.view === v || (v === 'deploys' && ['wizard', 'run', 'result'].includes(S.view)));
    const nav = (v, icon, key) => `<button class="navi ${here(v) ? 'on' : ''}" data-go="${v}" data-menu="nav" ${inWs && S.view === v ? 'aria-current="page"' : ''}><span class="pill">${ic(icon)}</span>${T(key)}</button>`;
    return `
    <header class="titlebar${browser ? '' : ' wco'}">${logoHtml(20)}<span class="name">${esc(S.settings?.displayName || 'AWS App Deployer')}</span><span class="small mono" title="Running version and build time">${esc(provLine())}</span>${S.settings?.timeAware ? `<span class="small mono" id="time-aware" aria-live="off">${esc(timeLine())}</span>` : ''}<span class="grow"></span>
      <button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-act="palette" aria-label="${T('palette')}">${ic('search', 'sm')}<span class="kbd">Ctrl+Shift+F</span></button>
      ${S.settings?.a11y?.hidden ? '' : `<button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-panel-open="a11y" aria-label="Accessibility tools" data-menu="a11y">${ic('accessibility_new', 'sm')}</button>`}
      <button class="chip" style="height: 28px; -webkit-app-region: no-drag" data-panel-open="notes" aria-label="${T('notifications')}">${ic('notifications', 'sm')}${S.notes.length ? `<span class="badge ac" style="height: 18px">${S.notes.length}</span>` : ''}</button>
      ${browser ? '<span class="badge ac">Browser companion</span><button class="chip" data-act="sign-out">Sign out</button>' : ''}</header>
    ${S.update?.status === 'ready' && !S.updateLater ? `<section class="banner" aria-label="Update ready"><span role="status" class="sr">Version ${esc(S.update.next)} is ready to install</span>${ic('system_update', 'fill')}<span class="stack grow" style="flex: 1 1 320px"><span style="font-weight: 650">Version ${esc(S.update.next)} is ready to install</span><span class="small" style="color: inherit; opacity: .85">Unsigned build: Windows may show an unknown-publisher or SmartScreen warning. Your settings and drafts are kept.</span></span><button class="btn text" style="color: inherit" data-act="open-url" data-url="https://github.com/Ding-Ding-Projects/aws-app-deployer/releases/latest">Release notes</button><button class="btn out" style="color: inherit; border-color: currentColor" data-act="update-later">Later</button><button class="btn fillb" data-act="update-install">${ic('restart_alt')}Restart to install update</button></section>` : ''}
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
        <div class="wide"><div class="card rise" style="--i:3"><div class="row"><span class="tile ac">${ic('badge', 'fill')}</span><span class="stack grow"><span class="h2">Use an AWS CLI profile</span><span class="small">${T('profiles')}</span></span><button class="btn text" data-act="reload-profiles" aria-label="Refresh profiles" data-tip="Refresh profiles">${ic('refresh')}</button></div>${list}
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
      ${fOpen ? `<div class="row" style="flex-wrap: wrap; gap: 8px"><label class="sr" for="dq">Search deployments</label><input id="dq" class="mono" data-input="depQ" value="${esc(S.depQ)}" placeholder="Search name, region or error" style="flex: 1 1 240px; height: 40px"><button class="badge ${S.depRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="dep-regex" aria-pressed="${S.depRegex}">.* Regex</button><span class="seg">${[['all', 'All'], ['ok', 'Healthy'], ['bad', 'Stopped']].map(([v, l]) => `<button class="${S.depStatus === v ? 'on' : ''}" data-act="dep-status" data-v="${v}" aria-pressed="${S.depStatus === v}">${l}</button>`).join('')}</span></div>${F.error ? `<span class="badge err">${esc(F.error)}</span>` : ''}` : ''}
      <div class="row" style="flex-wrap: wrap; gap: 6px"><button class="btn text" data-act="dep-all">Select all ${shown.length} shown</button><button class="btn text" data-act="dep-invert">Invert</button><span class="grow"></span>${S.depSel.size ? `<span class="badge ac">${S.depSel.size} selected</span><button class="btn text" data-act="dep-export">${ic('download')}Export</button><button class="btn text" style="color: var(--err)" data-act="dep-remove">${ic('delete')}Remove…</button>` : ''}</div>` : '';
    const rows = shown.map(x => `<div class="li static" data-menu="deploy" data-at="${esc(x.id || x.at)}" tabindex="0"><input type="checkbox" class="check" aria-label="Select ${esc(x.name)}" data-dep="${esc(x.id || x.at)}" ${S.depSel.has(x.id || x.at) ? 'checked' : ''}><span class="tile ${x.ok ? 'ok' : 'warn'}">${ic(x.ok ? 'deployed_code' : 'history', 'fill')}</span><span class="stack grow"><span class="t">${esc(x.name)}</span><span class="m">${esc(x.region)} · ${new Date(x.at).toLocaleString()}${x.ok ? '' : ' · ' + esc(Lib.errorText(x.error))}</span></span>${x.ok ? `<button class="btn text" data-act="open-url" data-url="${esc(x.url)}">${T('open')}</button><span class="badge ok">${ic('check', 'sm')}Healthy at deploy</span>` : `<span class="badge warn">Stopped</span>`}</div>`).join('');
    const body = !d.length && !S.run ? `<div class="empty rise"><span class="tile ac">${ic('rocket_launch', 'lg fill')}</span><span class="h2" style="font-size: 20px">${T('no_deployments')}</span><span class="sub" style="max-width: 480px">${T('no_deployments_sub')}</span><button class="btn fillb" data-go="wizard">${ic('add')}${T('new_deployment')}</button><div class="empty-steps">${[['Sign in', 'Your AWS profile, in the browser', 'accounts'], ['Choose a source', 'A Dockerfile or Compose file', 'wizard'], ['Get the link', 'Checked healthy before it is shown', 'wizard']].map(([t, m, g], i) => `<button class="empty-step" data-go="${g}"><span class="n">${i + 1}</span><span class="stack"><span style="font-weight: 600">${t}</span><span class="small">${m}</span></span></button>`).join('')}</div></div>`
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
  const srcLabel = key => ({ scheduled: 'scheduled right now', external: 'from the external source', school: 'set by ' + (S.schoolState?.name || 'School mode') }[S.overlaid?.[key]] || (S.sources[key] === 'file' ? 'set by you' : 'default'));
  function viewSettings() {
    const s = S.settings;
    const info = (key, label, id) => Lib.EXPLAIN[key] ? `<button class="info" data-info="${key}"${id ? ` id="${id}"` : ''} data-tip="About ${esc(label)}" aria-label="About ${esc(label)}: explanation and guided steps">${ic('info', 'sm')}</button>` : '';
    // The info button sits directly above the control it explains, in the same slot on every row.
    const ctl = (key, label, control, id) => `<span class="set-ctl">${info(key, label, id)}<span class="set-ctl-row">${control}</span></span>`;
    const tog = (key, label, sub, extra = '') => `<div class="set" data-menu="setting" data-key="${key}" data-search="${esc(label + ' ' + sub)}"><span class="stack grow"><span class="t" style="font-weight: 600">${label}</span><span class="small">${sub} · ${srcLabel(key)}</span></span>${ctl(key, label, `<button class="toggle ${s[key] ? 'on' : ''}" role="switch" aria-checked="${!!s[key]}" aria-label="${label}" data-toggle="${key}"></button>`)}${extra}</div>`;
    const seg = (key, opts) => `<span class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${s[key] === v}" class="${s[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${l}</button>`).join('')}</span>`;
    const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    const q = S.settingsQuery || '';
    return page(T('nav_settings'), `<div class="field" style="flex: 0 1 380px; position: relative"><label for="sq" class="sr">${T('search_settings')}</label><input id="sq" data-input="settingsQuery" placeholder="${T('search_settings')}" value="${esc(q)}" style="padding-left: 42px; border-radius: 22px"><i class="ms" style="position: absolute; left: 14px; top: 12px; color: var(--tx3)" aria-hidden="true">search</i></div>`,
    `<div class="cols"><div class="wide settings-grid">
      <div class="card" style="flex: 1 1 360px; gap: 0"><span class="h2" style="padding-bottom: 6px">Appearance</span>
        <div class="set" data-menu="setting" data-key="theme" data-search="theme light dark system"><span class="stack grow"><span class="t" style="font-weight: 600">${T('theme')}</span><span class="small">Follows Windows unless you pick one</span></span>${ctl('theme', T('theme'), seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]))}</div>
        <div class="set" data-menu="setting" data-key="accent" data-search="accent colour color"><span class="stack grow"><span class="t" style="font-weight: 600">${T('accent')}</span><span class="small">Type a hex, rgb(), hsl() or colour name</span></span>${ctl('accent', T('accent'), `${['#6ea8ff', '#4ade9a', '#f5b451', '#ff8a8a'].map(c => `<button class="sw ${!s.rainbow && s.accent === c ? 'on' : ''}" style="background: ${c}" data-act="accent" data-c="${c}" aria-label="Accent ${c}"></button>`).join('')}<button class="sw rainbow ${s.rainbow ? 'on' : ''}" data-act="rainbow" aria-label="Rainbow accent"></button>`)}</div>
        <div class="set" data-search="accent custom colour"><span class="stack grow"><label class="t" for="acc" style="font-weight: 600">Custom colour</label><span class="small mono"><span class="nw">${esc(s.accent)}</span> · <span class="nw">${esc(Lib.toRgb(s.accent))}</span></span></span>${ctl('accent', 'Custom colour', `<input id="acc" class="mono" style="width: 150px; height: 40px" data-input="accentText" placeholder="#6ea8ff"><button class="btn tonal" data-act="pick-accent" aria-label="Open the colour picker">${ic('colorize')}Pick</button>`, 'info-accent-custom')}</div>
        ${tog('reduceMotion', T('reduce_motion'), 'Replaces movement with simple fades')}
        <div class="set" data-menu="setting" data-key="displayName" data-search="app name rename display"><span class="stack grow"><label class="t" for="dn" style="font-weight: 600">${T('app_title')}</label><span class="small">Shown in the title bar and taskbar</span></span>${ctl('displayName', T('app_title'), `<input id="dn" style="width: 180px; height: 40px" data-input="displayName" value="${esc(s.displayName)}" placeholder="AWS App Deployer"><button class="btn text" data-act="reset" data-key="displayName">${T('reset')}</button>`)}</div>
        <div class="set" data-menu="setting" data-key="schedule" data-search="schedule light dark time"><span class="stack grow"><span class="t" style="font-weight: 600">${T('schedule')}</span><span class="small">Light from ${esc(s.schedule.lightAt)}, dark from ${esc(s.schedule.darkAt)}, every day</span></span>${ctl('schedule', T('schedule'), `<button class="toggle ${s.schedule.enabled ? 'on' : ''}" role="switch" aria-checked="${s.schedule.enabled}" aria-label="${T('schedule')}" data-act="schedule"></button>`)}</div>
      </div>
      ${schedulesCard()}
      <div class="card" style="flex: 1 1 360px; gap: 0"><span class="h2" style="padding-bottom: 6px">Language and voice</span>
        <div class="set" data-menu="setting" data-key="language" data-search="language english cantonese both"><span class="stack grow"><span class="t" style="font-weight: 600">${T('language')}</span></span>${ctl('language', T('language'), (s.school ? `<span class="badge mute">English</span>` : seg('language', [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']])))}</div>
        ${s.school ? '' : `<div class="set" style="flex-wrap: wrap" data-menu="setting" data-key="funnyLevels" data-search="funny level humour english cantonese"><span class="stack grow" style="flex: 1 1 170px"><span class="t" style="font-weight: 600">${T('funny')}</span><span class="small">Styles every message, errors included. Both start at 5. Facts never change.</span></span>${info('funnyLevels', T('funny'))}
          ${[['en', 'English'], ['yue', '廣東話']].map(([k, l]) => `<span class="row" style="flex: 1 1 100%; gap: 10px"><label for="fl-${k}" style="width: 70px">${l}</label><input id="fl-${k}" type="range" min="1" max="5" value="${s.funnyLevels[k]}" data-funny="${k}" style="flex: 1; min-width: 0" aria-valuetext="${s.funnyLevels[k]} of 5"><span class="badge ac" style="width: 28px; justify-content: center; padding: 0">${s.funnyLevels[k]}</span></span>`).join('')}
          <span class="card" style="flex: 1 1 100%; background: var(--s1); padding: 12px 14px; margin-top: 10px; gap: 2px"><span class="small">Preview</span><span>${esc(Lib.funny('success', s.funnyLevels, s.language))}</span></span></div>`}
        ${s.school ? '' : tog('emoji', T('emoji'), 'Adds emoji to some messages')}
        ${tog('narration', T('narration'), voices.length ? 'Uses a voice installed on this computer' : 'No voices found on this computer')}
        ${s.narration && voices.length ? [['en', 'English voice', /^en/i], ['yue', 'Cantonese voice', /^(yue|zh-HK)/i]].map(([k, l, re]) => { const list = voices.filter(v => re.test(v.lang)); return `<div class="set" data-search="voice ${l}"><label class="grow" for="vc-${k}">${l}</label>${ctl('voice', l, list.length ? `<select id="vc-${k}" data-voice="${k}" style="max-width: 220px"><option value="">System default</option>${list.map(v => `<option ${v.name === s.voices?.[k] ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : `<span class="badge mute">No ${k === 'yue' ? 'Cantonese' : 'English'} voice installed</span>`, 'info-voice-' + k)}</div>`; }).join('') + `<div class="set" data-search="voice pitch speed rate"><label class="grow" for="vp">Pitch</label>${ctl('pitch', 'Pitch', `<input id="vp" type="range" min="0.5" max="2" step="0.1" value="${s.pitch}" data-range="pitch" style="width: 130px"><span class="badge ac mono">${s.pitch}</span>`)}</div><div class="set" data-search="voice speed rate"><label class="grow" for="vr">Speed</label>${ctl('rate', 'Speed', `<input id="vr" type="range" min="0.5" max="2" step="0.1" value="${s.rate}" data-range="rate" style="width: 130px"><span class="badge ac mono">${s.rate}</span>`)}</div><button class="btn text" data-act="voice-try" style="align-self: flex-start">${ic('play_arrow')}Try this voice</button>` : ''}
        ${tog('sounds', T('sounds'), 'Soft cues for deploy, success and errors')}
      </div></div>
      <div class="side">
        ${s.school ? '' : `<div class="drop idle" style="flex-direction: column; align-items: flex-start; gap: 12px; padding: 22px" data-menu="setting" data-key="vocabulary" data-search="personal wording vocabulary json"><div class="row" style="width: 100%; align-items: flex-start"><span class="tile ac">${ic('dictionary', 'fill')}</span><span class="stack grow" style="flex: 1; min-width: 0"><span style="font-weight: 650">${T('vocabulary')}</span><span class="small">${s.vocabulary ? Object.keys(s.vocabulary.entries).length + ' words active' : 'Drop a vocabulary JSON anywhere in the app'}</span></span></div><span class="small">Format: {"version": 1, "entries": {"Deploy": "Ship"}}. Stays on this computer. Applied all at once or not at all.</span><span class="set-ctl" style="align-items: flex-start; margin-left: 0">${info('vocabulary', T('vocabulary'))}<span class="set-ctl-row"><label class="btn tonal" for="vf">Choose file</label><input id="vf" type="file" accept="application/json,.json" class="sr" data-file="vocab"><button class="btn text" data-act="vocab-clear" ${s.vocabulary ? '' : 'disabled'}>Clear</button></span></span></div>`}
        <div class="card" style="gap: 0"><span class="h2" style="padding-bottom: 6px">Focus and comfort</span>
          <span class="small" style="padding: 4px 0 6px">Attention modes: each is separate and off until you turn it on. Interface options only, not medical advice.</span>
          ${tog('focus', 'Focus', 'Dims everything except the row or card you are on')}${tog('calm', 'Low stimulation', 'Quieter colour, no extra motion, only notifications that need you')}${tog('timeAware', 'Time awareness', 'Time open and since the last change, in the title bar')}${tog('oneThing', 'One thing at a time', 'Keeps the next action you chose in view')}${tog('momentum', 'Momentum', 'A gentle note when a draft sits untouched')}${schoolCard()}
          ${s.school ? '' : `<div class="set" style="flex-wrap: wrap" data-search="dim sum surprise"><span class="stack grow"><span class="t" style="font-weight: 600">${T('dim_sum')}</span><span class="small">A rare treat at launch</span></span><button class="toggle on" role="switch" aria-checked="true" aria-label="${T('dim_sum')}" data-act="troll"></button>${S.troll ? `<span class="card pop" style="flex: 1 1 100%; flex-direction: row; gap: 10px; align-items: center; padding: 10px 14px; margin-top: 10px; background: var(--warn-c)" role="status">${ic('lock', 'fill')}<span class="small" style="color: var(--tx)">${T('dim_sum_troll')}${emojiOn() ? ' 🥟' : ''}</span></span>` : ''}</div>`}
        </div>
        ${logoCard()}
        <div class="card" data-search="toy locks lock pin password totp support tickets"><span class="h2">Toy locks</span><span class="small">Right-click anything and choose Lock this element… Just for fun, never security.</span>${(S.lockState?.locks || []).map(l => `<div class="li static" style="padding: 6px 0">${ic('lock', 'sm')}<span class="stack grow"><span class="t">${esc(l.label)}</span><span class="m">${esc(POLICY_LABEL[l.policy])}${l.waitMs ? ' · waiting' : ''}</span></span></div>`).join('') || '<span class="small">No locks yet.</span>'}<span class="small" style="color: var(--tx)">${esc(recoveryLine())}</span><button class="btn text" data-go="support" style="align-self: flex-start">${ic('support_agent')}Support Tickets</button></div>
        <div class="card" style="gap: 0" data-menu="setting" data-key="a11y" data-search="accessibility text size contrast focus targets read aloud button hidden"><div class="set"><span class="stack grow"><span class="t" style="font-weight: 600">Accessibility tools</span><span class="small">${s.a11y.hidden ? 'Title bar button hidden' : 'Button in the title bar'} · text ${s.a11y.textSize}%</span></span>${ctl('a11y', 'Accessibility tools', `<button class="btn tonal" data-panel-open="a11y">Open</button>${s.a11y.hidden ? '<button class="btn text" data-act="a11y-show">Show button</button>' : ''}`)}</div></div>
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
    const cn = S.settings?.school ? null : p.codeName;
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
    { id: 'school', get label() { return (S.settings?.school ? 'Turn off ' : 'Turn on ') + (S.schoolState?.name || 'School mode'); }, keywords: 'study quiet english only', run: () => openPanel('school') },
    { id: 'colour', label: 'Pick the accent colour', keywords: 'color colour alpha transparency contrast', run: () => openColour() },
    { id: 'schedules', label: 'Scheduled settings', keywords: 'schedule timer time home assistant automation', run: () => { go('settings'); setTimeout(() => scrollToEl('schedules'), 50); } },
  ];
  function paletteHtml() {
    const P = S.palette; if (!P) return '';
    const r = Lib.search(COMMANDS, P.q, { regex: P.regex });
    const items = r.ok ? r.items : [];
    P.items = items; P.sel = Math.min(P.sel, Math.max(0, items.length - 1));
    return `<div class="overlay"><div class="scrim" data-act="close-palette" style="align-items: start; padding-top: 72px"><div class="dialog" role="dialog" aria-modal="true" aria-label="${T('palette')}" style="width: min(680px, 100%); padding: 10px; gap: 0" data-stop="1">
      <div class="row" style="padding: 8px 10px; gap: 10px; flex-wrap: wrap">${ic('search')}<label for="pq" class="sr">Command</label><input id="pq" class="mono" data-input="paletteQ" value="${esc(P.q)}" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" aria-activedescendant="${items.length ? 'pal-o-' + P.sel : 'pal-none'}" style="flex: 1 1 200px; min-width: 0; height: 40px; border: 0; background: transparent; color: var(--tx); font-size: 16px; outline: none"><button class="badge ${P.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" aria-pressed="${P.regex}" data-act="regex">.* Regex</button></div>
      ${P.regex && P.q ? `<div class="row small" style="padding: 4px 12px 10px; gap: 8px; flex-wrap: wrap">${r.ok ? (r.parts || []).map(p => `<span class="row" style="gap: 6px; white-space: nowrap"><span class="badge mute mono">${esc(p.token)}</span>${esc(p.meaning)}</span>`).join('') + `<span class="badge ok">${ic('check', 'sm')}valid · ${items.length} matches</span>` : `<span class="badge err">${esc(r.error)}</span>`}</div>` : ''}
      <div class="divider"></div><div class="list" id="pal-list" style="background: transparent" role="listbox" aria-label="Commands">${items.map((c, i) => `<div class="li ${i === P.sel ? 'sel' : ''}" role="option" id="pal-o-${i}" aria-selected="${i === P.sel}" data-cmd="${c.id}">${esc(c.label)}${isLocked('go:' + c.id) || isLocked('panel:' + c.id) ? ` <span class="badge warn">${ic('lock', 'sm')}Locked</span>` : ''}</div>`).join('') || '<div class="li" role="option" id="pal-none" aria-selected="true" aria-disabled="true"><span class="small">No matches</span></div>'}</div>
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
  function openPanel(id, anchor) { if (!['unlock', 'lockwiz', 'appearance', 'colour', 'school'].includes(id) && guard('panel:' + id.split(':')[0])) return; S.panel = { id, anchor: anchor || null }; S.infoStep = 0; render(); setTimeout(() => document.querySelector(`[data-panel="${id.split(':')[0]}"] [data-autofocus]`)?.focus(), 30); }
  function closePanel() { const a = S.panel?.anchor; S.panel = null; render(); if (a) document.querySelector(a)?.focus(); }
  async function setA11y(patch) { await set('a11y', { ...S.settings.a11y, ...patch }); }
  function panelFrame(id, title, body, anchorStyle) {
    const saved = S.settings.ui?.panels;
    return `<section class="panel" data-panel="${id}" role="dialog" aria-label="${esc(title)}" style="${Kit.panelStyle(id, saved, anchorStyle)}"><div class="ph" data-drag="1"><span class="h2" style="flex: 1">${esc(title)}</span><button class="btn text" data-act="panel-reset" data-id="${id}" title="Reset size and position" aria-label="Reset panel size and position">${ic('restart_alt')}</button><button class="btn text" data-act="panel-close" aria-label="Close" data-autofocus="1">${ic('close')}</button></div><div class="pb">${body}</div></section>`;
  }
  function panelHtml() {
    const P = S.panel; if (!P) return '';
    // Right-hand panels open below the tab bar so they never cover a tab or New tab.
    const right = 'top: 88px; right: 12px; width: 380px;';
    if (P.id === 'a11y') {
      const a = S.settings.a11y;
      const sw = (k, label) => `<div class="set"><span class="grow">${label}</span><button class="toggle ${a[k] ? 'on' : ''}" role="switch" aria-checked="${a[k]}" aria-label="${label}" data-a11y="${k}"></button></div>`;
      return panelFrame('a11y', 'Accessibility tools', `<div class="set"><label class="grow" for="ts">Text size</label><input id="ts" type="range" min="80" max="160" step="10" value="${a.textSize}" data-a11y-size="1" style="width: 140px"><span class="badge ac">${a.textSize}%</span></div>
        ${sw('contrast', 'High contrast')}<div class="set"><span class="grow">Reduce motion</span><button class="toggle ${S.settings.reduceMotion ? 'on' : ''}" role="switch" aria-checked="${S.settings.reduceMotion}" aria-label="Reduce motion" data-toggle="reduceMotion"></button></div>${sw('focus', 'Always show focus')}${sw('targets', 'Larger targets')}
        <button class="btn tonal" data-cmd="keys">${ic('keyboard')}Keyboard help <span class="kbd">${Kit.keysFor('keys')}</span></button><button class="btn tonal" data-act="read-aloud">${ic('record_voice_over')}Read this screen aloud</button>
        <button class="btn text" data-act="a11y-reset">Reset accessibility tools</button><div class="divider"></div><button class="btn text" style="color: var(--tx3)" data-act="a11y-hide">${ic('visibility_off')}Hide this button…</button>`, right);
    }
    if (P.id === 'a11y-hide') return panelFrame('a11y-hide', 'Hide the accessibility button?', `<span class="sub">The button leaves the title bar. Your accessibility choices stay on. Bring it back from Settings search, the command palette, or Reset accessibility tools.</span><div class="row pfoot" style="justify-content: flex-end"><button class="btn fillb" data-act="panel-close" data-autofocus="1">Cancel</button><button class="btn out" data-act="a11y-hide-yes">Hide it</button></div>`, right);
    if (P.id === 'keys') return panelFrame('keys', 'Keyboard help', `<dl class="kv" style="margin: 0">${[['palette', 'Command palette with regex search'], ['new', 'New deployment'], ['settings', 'Settings'], ['keys', 'Keyboard help'], ['menu', 'Context menu for the focused element'], ['panelMove', 'Move a focused panel (add Shift to resize)']].map(([k, l]) => `<dt><span class="kbd">${esc(Kit.keysFor(k) || { menu: 'Shift+F10', panelMove: 'Alt+Arrows' }[k])}</span></dt><dd>${l}</dd>`).join('')}<dt><span class="kbd">Esc</span></dt><dd>Clear a filter, then close</dd></dl>`, 'top: 90px; left: max(8px, calc(50% - 220px)); width: 440px;');
    if (P.id === 'notes') {
      const r = Lib.search(S.notes.map(n => ({ ...n, label: n.text })), S.noteQ, { regex: S.noteRegex });
      const list = r.ok ? r.items : [];
      const open = !!S.settings.ui?.filtersOpen?.notes || !!S.noteQ;
      return panelFrame('notes', T('notifications'), `<button class="collapser" data-act="filters" data-id="notes" aria-expanded="${open}">${ic(open ? 'expand_less' : 'expand_more', 'sm')}Search${S.noteQ ? ` <span class="badge ac">filter active: ${list.length} of ${S.notes.length}</span>` : ''}</button>
        ${open ? `<div class="row" style="gap: 6px"><label class="sr" for="nq">Search notifications</label><input id="nq" class="mono" data-input="noteQ" value="${esc(S.noteQ)}" placeholder="Search" style="flex: 1; height: 36px"><button class="badge ${S.noteRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="note-regex" aria-pressed="${S.noteRegex}">.*</button></div>${!r.ok ? `<span class="badge err">${esc(r.error)}</span>` : ''}` : ''}
        <div class="row" style="flex-wrap: wrap; gap: 6px"><button class="btn text" data-act="note-all">Select all ${list.length} shown</button><button class="btn text" data-act="note-invert">Invert</button><span class="grow"></span><button class="btn text" data-act="note-copy" ${S.noteSel.size ? '' : 'disabled'}>Copy ${S.noteSel.size || ''}</button><button class="btn text" data-act="note-dismiss" ${S.noteSel.size ? '' : 'disabled'}>Dismiss ${S.noteSel.size || ''}</button></div>
        ${list.map(n => `<label class="li static" style="padding: 8px 0"><input type="checkbox" class="check" data-note="${n.id}" ${S.noteSel.has(n.id) ? 'checked' : ''}><span class="tile ${n.kind === 'err' ? 'err' : 'ok'}">${ic(n.kind === 'err' ? 'error' : 'check_circle', 'fill')}</span><span class="stack grow"><span class="t">${esc(n.text)}</span><span class="m">${esc(n.at)}</span></span></label>`).join('') || '<span class="small">Nothing here</span>'}`, right + ' height: 520px;');
    }
    if (P.id === 'newtab') return newTabPanel();
    if (P.id === 'lockwiz') return lockWizPanel();
    if (P.id === 'appearance') return appearancePanel();
    if (P.id === 'colour') return colourPanel();
    if (P.id === 'school') return schoolPanel();
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
        <div class="row pfoot" style="justify-content: flex-end"><button class="btn text" data-act="info-step" data-d="-1" ${step ? '' : 'disabled'}>${T('back')}</button><button class="btn tonal" data-act="info-step" data-d="1" ${step < ex.steps.length - 1 ? '' : 'disabled'}>${T('next')}</button></div>`, 'top: 120px; left: max(8px, calc(50% - 200px)); width: 400px;');
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
    // Values show their live controls; the setting under the pointer comes first.
    const own = kind === 'setting' ? valueItems(m.dataset.key) : [], quick = valueItems('quick').filter(q => !own.some(o => o.label === q.label));
    return [...own, ...items, ...quick];
  }
  // Live controls for context menus. Each one changes the real setting through set(), so every
  // other place that shows the value updates too, and the menu stays open.
  const SCHOOL_LOCKED = 'English only while ' + 'School mode is on';
  function valueItems(key) {
    const s = S.settings || {}, out = [];
    const toggle = (k, label, icon) => ({ kind: 'toggle', label, icon, get: () => !!S.settings[k], set: v => set(k, v) });
    const LABELS = { reduceMotion: ['Reduce motion', 'motion_photos_off'], sounds: ['Action sounds', 'volume_up'], emoji: ['Emoji in messages', 'mood'], narration: ['Read status aloud', 'record_voice_over'], focus: ['Focus', 'center_focus_weak'], calm: ['Low stimulation', 'do_not_disturb_on'], timeAware: ['Time awareness', 'schedule'], oneThing: ['One thing at a time', 'flag'], momentum: ['Momentum', 'directions_run'], rainbow: ['Rainbow accent', 'palette'] };
    if (key === 'quick') {
      out.push({ kind: 'choice', label: 'Theme', icon: 'dark_mode', options: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], get: () => S.settings.theme, set: v => set('theme', v) });
      out.push({ kind: 'level', label: 'Text size', icon: 'format_size', min: 80, max: 160, step: 10, format: v => v + '%', get: () => S.settings.a11y?.textSize || 100, set: v => setA11y({ textSize: v }) });
      out.push(toggle('reduceMotion', ...LABELS.reduceMotion), toggle('sounds', ...LABELS.sounds));
      return out;
    }
    if (key === 'theme') out.push({ kind: 'choice', label: 'Theme', icon: 'dark_mode', options: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], get: () => S.settings.theme, set: v => set('theme', v) });
    else if (key === 'language') out.push({ kind: 'choice', label: 'Language', icon: 'translate', options: [['en', 'English'], ['yue', '廣東話'], ['both', 'Both']], get: () => S.settings.language, set: v => set('language', v), disabled: !!s.school, reason: SCHOOL_LOCKED.replace('School mode', S.schoolState?.name || 'School mode') });
    else if (key === 'funnyLevels' && !s.school) ['en', 'yue'].forEach(l => out.push({ kind: 'level', label: l === 'en' ? 'Funny level, English' : 'Funny level, 廣東話', icon: 'sentiment_very_satisfied', min: 1, max: 5, step: 1, format: v => v + ' of 5', get: () => S.settings.funnyLevels[l], set: v => set('funnyLevels', { ...S.settings.funnyLevels, [l]: v }) }));
    else if (key === 'rate' || key === 'pitch') out.push({ kind: 'level', label: key === 'rate' ? 'Speech speed' : 'Speech pitch', icon: 'graphic_eq', min: 0.5, max: 2, step: 0.1, format: v => (Math.round(v * 10) / 10).toFixed(1), get: () => S.settings[key], set: v => set(key, Math.round(v * 10) / 10) });
    else if (key === 'accent') out.push({ kind: 'swatch', label: 'Accent colour', icon: 'palette', get: () => S.settings.accent, run: () => openColour() });
    else if (key === 'a11y') out.push({ kind: 'level', label: 'Text size', icon: 'format_size', min: 80, max: 160, step: 10, format: v => v + '%', get: () => S.settings.a11y?.textSize || 100, set: v => setA11y({ textSize: v }) }, ...['contrast', 'focus', 'targets'].map(k => ({ kind: 'toggle', label: { contrast: 'High contrast', focus: 'Always show focus', targets: 'Larger targets' }[k], icon: 'accessibility_new', get: () => !!S.settings.a11y?.[k], set: v => setA11y({ [k]: v }) })));
    else if (LABELS[key] && typeof s[key] === 'boolean') out.push(toggle(key, ...LABELS[key]));
    return out;
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
    { view: 'servers', label: 'Game servers', icon: 'dns', keywords: 'minecraft server paper fabric world generate ssh docker' },
    { view: 'ai', label: 'Local AI', icon: 'smart_toy', keywords: 'ollama model chat llm llama' },
    { view: 'sketch', label: 'Sketch', icon: 'draw', keywords: 'draw annotate pen highlighter drawing' },
    { view: 'settings', label: 'Settings', icon: 'tune' }, { view: 'help', label: 'Help and about', icon: 'help' },
    { view: 'support', label: 'Support Tickets', icon: 'support_agent', keywords: 'locked out forgot pin password' },
    { view: 'accounts', label: 'Accounts', icon: 'key' }, { view: 'deploys', label: 'Deployments', icon: 'rocket_launch' },
  ];
  function tabStrip() {
    // Tabs and their close marks are siblings; the close mark is for the pointer only (Delete and the tab's menu close a tab
    // from the keyboard), and New tab sits outside the tab list.
    return `<nav class="tabbar" aria-label="Tabs"><div class="tabs" role="tablist" aria-label="Open tabs">${S.tabs.map(t => { const c = t.id === 'ws' ? { label: 'Workspace', icon: 'rocket_launch' } : CATALOG.find(x => x.view === t.view), on = S.active === t.id; return `<span class="tab ${on ? 'on' : ''}" data-menu="tab" data-tab="${t.id}"><button class="tab-b" role="tab" id="tab-${t.id}" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-tab-go="${t.id}" title="${esc(c.label)}"${t.id === 'ws' ? '' : ' aria-keyshortcuts="Delete" aria-describedby="tab-hint"'}>${ic(c.icon, 'sm')}<span class="tab-l">${esc(c.label)}</span></button>${t.id === 'ws' ? '' : `<span class="tab-x" aria-hidden="true" data-tab-close="${t.id}" title="Close ${esc(c.label)}">${ic('close', 'sm')}</span>`}</span>`; }).join('')}</div><span class="sr" id="tab-hint">Delete closes this tab. Left and Right move between tabs.</span><span class="tab-new"><button class="chip" style="height: 30px; flex: none" data-panel-open="newtab">${ic('add', 'sm')}New tab</button></span></nav>`;
  }
  // The tab strip hides its scrollbar, so a mouse wheel over it scrolls it sideways; the active tab is kept in view.
  document.addEventListener('scroll', e => { if (e.target.classList?.contains('tabs')) tabFade(e.target); }, true);
  addEventListener('resize', () => { const strip = root.querySelector('.tabs'); if (strip) tabFade(strip); });
  document.addEventListener('wheel', e => { const strip = e.target.closest?.('.tabs'); if (!strip || Math.abs(e.deltaX) > Math.abs(e.deltaY) || strip.scrollWidth <= strip.clientWidth) return; strip.scrollLeft += e.deltaY; e.preventDefault(); }, { passive: false });
  // Tab keys: Left and Right move between tabs, Home and End jump to the ends, Delete closes a utility tab.
  function selectTab(id) { withTransition(() => { S.active = id; const tb = S.tabs.find(x => x.id === S.active); if (tb?.view) ensureData(tb.view); render(); document.getElementById('tab-' + S.active)?.focus(); }); }
  document.addEventListener('keydown', e => {
    const b = e.target.closest?.('.tab-b'); if (!b || e.ctrlKey || e.altKey || e.metaKey) return;
    const ids = S.tabs.map(t => t.id), at = ids.indexOf(b.dataset.tabGo); if (at < 0) return;
    const to = { ArrowRight: ids[(at + 1) % ids.length], ArrowLeft: ids[(at - 1 + ids.length) % ids.length], Home: ids[0], End: ids[ids.length - 1] }[e.key];
    if (to) { e.preventDefault(); selectTab(to); return; }
    if (e.key === 'Delete' && ids[at] !== 'ws') { e.preventDefault(); closeTabs([ids[at]]); document.getElementById('tab-' + S.active)?.focus(); }
  });
  function openTab(view) { const id = 't' + Math.random().toString(36).slice(2, 7); withTransition(() => { S.tabs.push({ id, view }); S.active = id; S.panel = null; render(); }); }
  function closeTabs(ids) { S.tabs = S.tabs.filter(t => t.id === 'ws' || !ids.includes(t.id)); if (!S.tabs.find(t => t.id === S.active)) S.active = 'ws'; render(); }
  function newTabPanel() {
    const r = Lib.search(CATALOG, S.tabQ || '', { regex: !!S.tabRegex });
    return panelFrame('newtab', 'New tab', `<div class="row" style="gap: 6px"><label class="sr" for="tq">Search the catalog</label><input id="tq" class="mono" data-input="tabQ" value="${esc(S.tabQ || '')}" placeholder="Search destinations" data-autofocus="1" style="flex: 1; height: 36px"><button class="badge ${S.tabRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="tab-regex" aria-pressed="${!!S.tabRegex}">.*</button></div>
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
      <div class="row" style="flex-wrap: wrap"><button class="btn fillb" data-act="hist-restore" data-i="${sel.i}" ${sel.key === 'vocabulary' || sel.key === 'deployments.restored' ? 'disabled' : ''}>${ic('restore')}Restore</button><label class="sr" for="hl">Label this revision</label><input id="hl" data-input="histLabel" placeholder="Label" value="${esc(labels[sel.i] || '')}" style="flex: 1 1 140px; height: 40px"><button class="btn text" data-act="hist-label" data-i="${sel.i}">Save label</button></div></div>` : '';
    return page('Local history', `<button class="btn out" data-panel-open="export:history">${ic('download')}Export</button>`, `
      <div class="row" style="gap: 8px; flex-wrap: wrap"><label class="sr" for="hq">Search history</label><input id="hq" class="mono" data-input="histQ" value="${esc(H.q)}" placeholder="Search changes" style="flex: 1 1 220px; height: 40px"><button class="badge ${H.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="hist-regex" aria-pressed="${H.regex}">.* Regex</button>
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
      <div class="row" style="gap: 8px; flex-wrap: wrap"><label class="sr" for="cq">Search changes</label><input id="cq" class="mono" data-input="clogQ" value="${esc(F.q)}" placeholder="Search changes" style="flex: 1 1 220px; height: 40px"><button class="badge ${F.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="clog-regex" aria-pressed="${F.regex}">.* Regex</button><label class="small" for="cf">From</label><input id="cf" type="date" class="datein" data-input="clogFrom" value="${esc(F.from)}"><label class="small" for="ct">To</label><input id="ct" type="date" class="datein" data-input="clogTo" value="${esc(F.to)}"></div>
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
    return page('Docs', '', `<div class="cols"><div class="side" style="flex: 0 1 300px"><div class="row" style="gap: 6px"><label class="sr" for="dsq">Search docs</label><input id="dsq" class="mono" data-input="docQ" value="${esc(F.q)}" placeholder="Search titles and text" style="flex: 1; height: 40px"><button class="badge ${F.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="doc-regex" aria-pressed="${F.regex}">.*</button></div>${!r.ok ? `<span class="badge err">${esc(r.error)}</span>` : ''}
      <div class="list">${list.map(d => `<button class="li ${cur && d.id === cur.id ? 'sel' : ''}" data-doc-open="${d.id}">${esc(d.title)}</button>`).join('') || '<span class="small" style="padding: 10px">No articles match</span>'}</div></div>
      <article class="wide card md" aria-label="${esc(cur?.title || '')}">${cur ? Lib.markdown(cur.body) : ''}</article></div>`);
  }

  // ---------- export panel ----------
  function exportPanel(what) {
    const fmt = S.exportFmt || 'json', F = Lib.FORMATS[fmt];
    const label = { history: 'local history', deploys: 'deployment records', settings: 'settings' }[what] || what;
    return panelFrame('export', `Export ${label}`, `<span class="seg" role="radiogroup">${[...Object.keys(Lib.FORMATS), 'zip'].map(k => `<button role="radio" aria-checked="${fmt === k}" class="${fmt === k ? 'on' : ''}" data-act="exp-fmt" data-f="${k}">${k === 'zip' ? 'ZIP (all)' : Lib.FORMATS[k].label}</button>`).join('')}</span>
      <span class="small">${fmt === 'zip' ? 'A ZIP with deployments, history and settings, each as JSON, plus CSV copies. Relative paths only.' : `UTF-8, LF line endings, schema aws-app-deployer.${what}/1. ${F.loss || 'Nothing is lost; the file can be imported back.'}`}</span>
      <div class="row pfoot" style="justify-content: flex-end"><button class="btn text" data-act="panel-close">${T('cancel')}</button><button class="btn fillb" data-act="exp-go" data-w="${what}" data-autofocus="1">${ic('download')}Save</button></div>`, 'top: 90px; right: 24px; width: 420px;');
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
    if (Object.keys(styled).length || editing) root.querySelectorAll(KEYED).forEach(el => { const k = elKey(el); if (k && k.el === el && (styled[k.key] || k.key === editing)) { el.dataset.ak = k.key; el.classList.toggle('ap-target', k.key === editing && S.panel?.id === 'appearance'); } });
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
    if (S.lockState && !S.lockState.available) return panelFrame('lockwiz', 'Lock this element', `<span>Locks need the operating system's protected storage, which is not available here. Nothing was locked.</span>`, 'top: 90px; left: max(8px, calc(50% - 220px)); width: 440px;');
    const fld = (id, label, val, type = 'password', extra = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" data-lw="${id}" value="${esc(val)}" autocomplete="off" ${extra}></div>`;
    return panelFrame('lockwiz', `Lock "${W.label}"`, `<span class="small">Target: <span class="mono">${esc(W.key)}</span></span>
      <span class="label">CHOOSE ONE POLICY</span><div class="seg" role="radiogroup" style="flex-wrap: wrap">${Object.keys(POLICY_LABEL).map(p => `<button role="radio" aria-checked="${W.policy === p}" class="${W.policy === p ? 'on' : ''}" data-act="lw-policy" data-p="${p}">${POLICY_LABEL[p]}</button>`).join('')}</div>
      ${need.includes('pin') ? `${fld('lw-pin', 'PIN (4 to 12 digits)', W.pin, 'password', 'inputmode="numeric"')}${masked(W.pin)}${keypad('pin')}${fld('lw-pin2', 'Repeat PIN', W.pin2, 'password', 'inputmode="numeric"')}` : ''}
      ${need.includes('password') ? `${fld('lw-password', 'Password (6 or more characters)', W.password)}${fld('lw-password2', 'Repeat password', W.password2)}` : ''}
      ${need.includes('totp') ? (W.totp ? `<span class="label">SCAN WITH YOUR AUTHENTICATOR</span><div class="qr" aria-label="QR code for the authenticator">${W.totp.qr}</div><span class="small">Or enter this key: <span class="mono" style="overflow-wrap: anywhere">${esc(W.totp.secret.replace(/(.{4})/g, '$1 '))}</span></span>${fld('lw-code', 'Code from your authenticator', W.code, 'text', 'inputmode="numeric" maxlength="6"')}` : `<button class="btn tonal" data-act="lw-totp">${ic('qr_code_2')}Set up an authenticator</button>`) : ''}
      ${W.error ? `<span class="badge err">${esc(W.error)}</span>` : ''}
      <span class="small" style="color: var(--tx)">${esc(recoveryLine())}</span>
      <div class="row pfoot" style="justify-content: flex-end"><button class="btn text" data-act="panel-close">${T('cancel')}</button><button class="btn fillb" data-act="lw-create">${ic('lock')}Lock it</button></div>`, 'top: 70px; left: max(8px, calc(50% - 230px)); width: 460px;');
  }
  function unlockPanel() {
    const U = S.unlock, l = (S.lockState?.locks || []).find(x => x.id === U.key);
    if (!l) return panelFrame('unlock', 'Unlock', '<span>This element is not locked any more.</span>', 'top: 90px; left: max(8px, calc(50% - 200px)); width: 400px;');
    const need = l.policy.split('+');
    const body = U.ladder ? ladderHtml(l) : `<span class="small">${esc(POLICY_LABEL[l.policy])} · ${need.length} step${need.length > 1 ? 's' : ''}</span>
      ${need.map((f, i) => f === 'pin' ? `<div class="field"><label for="ul-pin">Step ${i + 1}: PIN</label><input id="ul-pin" type="password" inputmode="numeric" data-ul="pin" value="${esc(U.pin)}" autocomplete="off"></div>${masked(U.pin)}${keypad('upin')}` : f === 'password' ? `<div class="field"><label for="ul-password">Step ${i + 1}: Password</label><input id="ul-password" type="password" data-ul="password" value="${esc(U.password)}" autocomplete="off"></div>` : `<div class="field"><label for="ul-totp">Step ${i + 1}: Authenticator code</label><input id="ul-totp" inputmode="numeric" maxlength="6" data-ul="totp" value="${esc(U.totp)}" autocomplete="one-time-code"></div>`).join('')}
      <div class="field"><label for="ul-dur">Unlock for</label><select id="ul-dur" data-ul="duration"><option value="once" ${U.duration === 'once' ? 'selected' : ''}>This time only</option><option value="15" ${U.duration === '15' ? 'selected' : ''}>15 minutes</option><option value="session" ${U.duration === 'session' ? 'selected' : ''}>Until the app closes</option></select></div>
      ${U.error ? `<span class="badge err" role="alert">${esc(U.error)}</span>` : ''}
      ${l.waitMs ? `<button class="btn tonal" data-act="ladder-open">${ic('stairs')}Play the unlock ladder (${l.ladderLeft} left this hour)</button>` : ''}
      <span class="small" style="color: var(--tx)">${esc(recoveryLine())}</span>
      <div class="row pfoot" style="justify-content: space-between; flex-wrap: wrap"><button class="btn text" data-act="go-support">Forgotten your password?</button><span class="row" style="gap: 6px"><button class="btn text" data-act="panel-close">${T('cancel')}</button><button class="btn fillb" data-act="ul-go" ${l.waitMs ? 'disabled' : ''}>${ic('lock_open')}Unlock</button></span></div>`;
    return panelFrame('unlock', `Unlock "${U.label}"`, body, 'top: 70px; left: max(8px, calc(50% - 210px)); width: 420px;');
  }
  function ladderHtml(l) {
    const L = S.unlock.ladder, mins = Math.ceil(l.waitMs / 60000);
    const rungs = S.settings.school ? ['sums', 'mole', 'clock'] : ['dimsum', 'sums', 'mole', 'clock'];
    const names = { dimsum: 'Dim sum', sums: 'Ten sums', mole: 'Whack-a-mole', clock: 'The clock' };
    let game = '';
    if (L.challenge?.rung === 'dimsum') game = `<span class="h2">Which dish is this?</span><span>${esc(L.challenge.prompt)}</span><span class="small">${esc(L.challenge.zh)}</span>${L.challenge.choices.map((c, i) => `<button class="btn out" data-act="ld-dim" data-i="${i}">${esc(c)}</button>`).join('')}`;
    if (L.challenge?.rung === 'sums') game = `<span class="h2">Ten easy sums</span>${L.challenge.sums.map((q, i) => `<div class="row"><label for="sum${i}" style="flex: 1">${esc(q)} =</label><input id="sum${i}" inputmode="numeric" data-sum="${i}" value="${esc(L.sums?.[i] || '')}" style="width: 90px; height: 36px"></div>`).join('')}<button class="btn fillb" data-act="ld-sums">Check</button>`;
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
      <div class="row" style="gap: 6px; flex-wrap: wrap"><label class="sr" for="ap-pname">Preset name</label><input id="ap-pname" data-input="apPreset" value="${esc(A.preset)}" maxlength="40" placeholder="Preset name" style="flex: 1 1 140px; height: 36px"><button class="btn tonal" data-act="ap-preset-save" ${a.elements[A.key] ? '' : 'disabled'}>Save preset</button></div>
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


  function scrollToEl(id) { const el = document.getElementById(id); if (!el) return; let m = el.parentElement; while (m && m !== root && m.scrollHeight <= m.clientHeight) m = m.parentElement; if (m && m !== root) m.scrollTo({ top: el.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - 16, behavior: 'smooth' }); el.focus?.({ preventScroll: true }); }
  // ---------- School mode (shared record, renamable, credential to turn off) ----------
  async function refreshSchool() {
    const st = await api.schoolState?.(); if (!st?.ok) return;
    const changed = st.enabled !== S.schoolState?.enabled || st.name !== S.schoolState?.name;
    S.schoolState = st; if (changed && S.settings) { applyOverlays(); applyAppearance(); render(); }
  }
  addEventListener('focus', refreshSchool); setInterval(refreshSchool, 30000);
  function schoolCard() {
    const st = S.schoolState || { enabled: false, name: 'School mode' };
    return `<div class="set" data-search="${esc(st.name)} school study english only" style="flex-wrap: wrap"><span class="stack grow"><span class="t" style="font-weight: 600">${esc(st.name)}</span><span class="small">${st.enabled ? 'On for every app on this computer. Turning it off needs your PIN or password.' : 'English only, no funny levels, personal wording or dim sum, in every app on this computer.'}</span></span><button class="toggle ${st.enabled ? 'on' : ''}" role="switch" aria-checked="${st.enabled}" aria-label="${esc(st.name)}" data-act="school-open"></button></div>`;
  }
  function schoolPanel() {
    const st = S.schoolState || {}, F = S.schoolForm || (S.schoolForm = { kind: 'pin', value: '', value2: '', name: st.name || '', error: null });
    const inp = (id, label, val, extra = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" data-sf="${id}" value="${esc(val)}" autocomplete="off" ${extra}></div>`;
    const note = `<span class="small" style="color: var(--tx)">A speed bump, not security. Forgot it? Delete the shared file: <span class="mono" style="overflow-wrap: anywhere">${esc(st.file || '')}</span></span>`;
    let body;
    if (st.enabled) body = `<span>${esc(st.name)} is on. Enter your ${st.credentialKind === 'password' ? 'password' : 'PIN'} to turn it off.</span>${inp('sf-value', st.credentialKind === 'password' ? 'Password' : 'PIN', F.value, `type="password" ${st.credentialKind === 'password' ? '' : 'inputmode="numeric"'}`)}
      ${F.error ? `<span class="badge err" role="alert">${esc(F.error)}</span>` : ''}${note}<div class="row pfoot" style="justify-content: flex-end"><button class="btn text" data-act="panel-close">Cancel</button><button class="btn fillb" data-act="school-off">Turn off</button></div>`;
    else body = `<span class="small">While on: English only, and funny levels, personal wording and everything dim sum disappear from every app on this computer. Your choices come back when you turn it off.</span>
      ${inp('sf-name', 'Name for this mode', F.name, 'maxlength="40"')}<button class="btn text" data-act="school-rename" style="align-self: flex-start">Save name</button>
      ${st.hasCredential ? `<span class="small">Turning it off will ask for your existing ${st.credentialKind === 'password' ? 'password' : 'PIN'}.</span>` : `<span class="label">SET HOW TO TURN IT OFF</span><div class="seg">${[['pin', 'PIN'], ['password', 'Password']].map(([k, l]) => `<button class="${F.kind === k ? 'on' : ''}" aria-pressed="${F.kind === k}" data-act="school-kind" data-k="${k}">${l}</button>`).join('')}</div>
      ${inp('sf-value', F.kind === 'pin' ? 'PIN (4 to 12 digits)' : 'Password (6 or more characters)', F.value, `type="password" ${F.kind === 'pin' ? 'inputmode="numeric"' : ''}`)}${inp('sf-value2', 'Repeat it', F.value2, 'type="password"')}`}
      ${F.error ? `<span class="badge err" role="alert">${esc(F.error)}</span>` : ''}${note}<div class="row pfoot" style="justify-content: flex-end"><button class="btn text" data-act="panel-close">Cancel</button><button class="btn fillb" data-act="school-on">Turn on</button></div>`;
    return panelFrame('school', st.name || 'School mode', body, 'top: 80px; left: max(8px, calc(50% - 220px)); width: 440px;');
  }

  // ---------- scheduled settings and an external source ----------
  S.base = {}; S.overrides = {}; S.external = { applied: {}, ignored: [], error: null, at: null };
  function applyOverlays() {
    if (!S.settings) return;
    for (const k of Object.keys(S.base)) S.settings[k] = S.base[k];
    S.base = {}; S.overlaid = {};
    const sched = Lib.scheduledValues(S.settings.schedules, new Date());
    const over = { ...(S.settings.externalSource?.enabled ? S.external.applied : {}), ...sched };
    if (S.schoolState?.enabled) over.language = 'en';
    for (const [k, v] of Object.entries(over)) { if (S.overrides[k] === JSON.stringify(sched[k])) continue; S.base[k] = S.settings[k]; S.settings[k] = v; S.overlaid[k] = k in sched ? 'scheduled' : k === 'language' && S.schoolState?.enabled ? 'school' : 'external'; }
    S.settings.school = !!S.schoolState?.enabled;
  }
  setInterval(() => { const before = JSON.stringify(S.overlaid); applyOverlays(); if (JSON.stringify(S.overlaid) !== before) { applyAppearance(); render(); } }, 30000);
  async function pollExternal() {
    const X = S.settings?.externalSource; if (!X?.enabled || !X.url) return;
    const r = await api.externalFetch(X.url);
    if (!r.ok) { S.external = { ...S.external, error: r.error, at: Date.now() }; }
    else { const p = Lib.parseExternal(r.text, { mapKey: X.mapKey }); S.external = p.ok ? { applied: p.applied, ignored: p.ignored, error: null, at: Date.now() } : { applied: {}, ignored: [], error: p.error, at: Date.now() }; }
    applyOverlays(); applyAppearance(); if (S.view === 'settings') render();
  }
  let extTimer; function scheduleExternal() { clearInterval(extTimer); const X = S.settings?.externalSource; if (X?.enabled) { pollExternal(); extTimer = setInterval(pollExternal, X.every * 60000); } }
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const valLabel = (k, v) => { const d = Lib.SCHEDULABLE[k]; return d.values ? (d.values.find(([x]) => x === v) || [, String(v)])[1] : String(v); };
  function schedulesCard() {
    const rules = S.settings.schedules || [], active = Lib.scheduledValues(rules, new Date()), F = S.schedForm || (S.schedForm = { key: 'theme', value: 'dark', at: '19:00', days: [0, 1, 2, 3, 4, 5, 6] });
    const d = Lib.SCHEDULABLE[F.key], X = S.settings.externalSource;
    const valueCtl = d.values ? `<select id="sch-val" data-sch="value" aria-label="Value">${d.values.map(([v, l]) => `<option value="${esc(JSON.stringify(v))}" ${JSON.stringify(v) === JSON.stringify(F.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<input id="sch-val" data-sch="value" aria-label="Value" value="${esc(F.value)}" placeholder="${d.colour ? '#4ade9a' : 'Name'}" style="width: 130px">`;
    return `<div class="card" id="schedules" style="flex: 1 1 360px; gap: 0" data-search="schedule scheduled settings time home assistant external source"><span class="h2" style="padding-bottom: 6px">Scheduled settings</span>
      <span class="small" style="padding-bottom: 8px">For each setting, the rule whose time passed most recently wins. Changing a scheduled setting yourself holds until its next rule.</span>
      ${rules.map((r, i) => `<div class="set"><span class="stack grow"><span class="t" style="font-weight: 600">${esc(Lib.SCHEDULABLE[r.key]?.label || r.key)} → ${esc(valLabel(r.key, r.value))}</span><span class="small">${r.days.length === 7 ? 'Every day' : r.days.map(x => DAYS[x]).join(', ')} at ${esc(r.at)}</span></span><span class="badge ${JSON.stringify(active[r.key]) === JSON.stringify(r.value) && S.overlaid?.[r.key] === 'scheduled' ? 'ok' : 'mute'}">${JSON.stringify(active[r.key]) === JSON.stringify(r.value) && S.overlaid?.[r.key] === 'scheduled' ? 'Active' : 'Waiting'}</span><button class="btn text" data-act="sch-del" data-i="${i}" aria-label="Remove rule ${i + 1}">Remove</button></div>`).join('') || '<span class="small" style="padding: 8px 0">No rules yet.</span>'}
      <div class="row sched-form" style="gap: 6px; flex-wrap: wrap; padding: 10px 0"><select data-sch="key" aria-label="Setting">${Object.entries(Lib.SCHEDULABLE).map(([k, x]) => `<option value="${k}" ${F.key === k ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>${valueCtl}<input type="time" data-sch="at" value="${esc(F.at)}" aria-label="Time"><span class="row" style="gap: 2px" role="group" aria-label="Days">${DAYS.map((n, i) => `<button class="badge ${F.days.includes(i) ? 'ac' : 'mute'}" style="border: 0; cursor: pointer" aria-pressed="${F.days.includes(i)}" data-act="sch-day" data-d="${i}">${n[0]}</button>`).join('')}</span><button class="btn tonal" data-act="sch-add">Add rule</button></div>
      <span class="label" style="padding-top: 6px">EXTERNAL SOURCE</span>
      <div class="set"><span class="stack grow"><span class="t" style="font-weight: 600">Read settings from a URL</span><span class="small">A JSON object of settings, or a Home Assistant entity state mapped to one setting. Checked every ${X.every} min.</span></span><button class="toggle ${X.enabled ? 'on' : ''}" role="switch" aria-checked="${X.enabled}" aria-label="Read settings from a URL" data-act="ext-toggle"></button></div>
      <div class="row sched-form" style="gap: 6px; flex-wrap: wrap"><input data-ext="url" value="${esc(X.url)}" placeholder="https://homeassistant.local:8123/api/states/input_select.theme" aria-label="Source URL" style="flex: 1 1 260px"><select data-ext="mapKey" aria-label="Entity state sets">${Object.entries(Lib.SCHEDULABLE).map(([k, x]) => `<option value="${k}" ${X.mapKey === k ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select><input type="password" data-ext="token" placeholder="Access token (optional)" aria-label="Access token" autocomplete="off" style="width: 170px"><button class="btn text" data-act="ext-save">Save</button><button class="btn text" data-act="ext-now" ${X.enabled ? '' : 'disabled'}>Check now</button></div>
      ${S.external.at ? `<span class="small" style="padding-top: 6px">${S.external.error ? `Last check failed: ${esc(S.external.error.toLowerCase().replace(/_/g, ' '))}. Nothing was changed.` : `Applied ${Object.keys(S.external.applied).map(k => `${Lib.SCHEDULABLE[k].label} → ${valLabel(k, S.external.applied[k])}`).join(', ') || 'nothing'}${S.external.ignored.length ? `. Ignored: ${esc(S.external.ignored.join(', '))}` : ''}.`} ${new Date(S.external.at).toLocaleTimeString()}</span>` : ''}
    </div>`;
  }

  // ---------- colour picker with alpha and contrast ----------
  function openColour() { const hex = S.settings.accent; const { h, s: sat, v } = Lib.hexToHsv(hex); S.colour = { h, s: sat, v, a: Lib.rgba(hex).a, text: hex }; openPanel('colour'); }
  const pickerHex = () => Lib.hsvToHex(S.colour.h, S.colour.s, S.colour.v, S.colour.a);
  function colourPanel() {
    const C = S.colour, hex = pickerHex(), bg = document.body.style.background?.startsWith('rgb') ? '#0b0d12' : '#0b0d12';
    const light = root.classList.contains('light'), ratio = Lib.contrast(hex, light ? '#f4f6fa' : '#0b0d12');
    return panelFrame('colour', 'Accent colour', `<div class="sv-box" data-sv="1" style="background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${C.h} 100% 50%))" role="slider" tabindex="0" aria-label="Saturation and brightness" aria-valuetext="saturation ${C.s}%, brightness ${C.v}%"><i style="left: ${C.s}%; top: ${100 - C.v}%"></i></div>
      <label class="small" for="cp-h">Hue ${C.h}°</label><input id="cp-h" type="range" min="0" max="360" value="${C.h}" data-cp="h" class="hue-range">
      <label class="small" for="cp-a">Opacity ${Math.round(C.a * 100)}%</label><input id="cp-a" type="range" min="0" max="100" value="${Math.round(C.a * 100)}" data-cp="a" class="alpha-range" style="--c: ${hex.slice(0, 7)}">
      <div class="row" style="gap: 8px"><span class="sw" style="background: ${hex}; flex: none" aria-hidden="true"></span><label class="sr" for="cp-text">Colour value</label><input id="cp-text" class="mono" data-cp="text" value="${esc(C.text)}" style="flex: 1; min-width: 0; height: 38px"><span class="badge ${ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'warn' : 'err'}" title="WCAG contrast against the page background">Contrast ${ratio} : 1</span></div>
      <span class="small mono">${esc(Lib.toRgb(hex))} · ${esc(Lib.toHsl(hex))}</span>
      <span class="small">${ratio >= 4.5 ? 'Readable as text on this background.' : ratio >= 3 ? 'Fine for large text and icons; small text may be hard to read.' : 'Too faint on this background for text.'} Buttons and links use a lighter or darker shade of the same hue when needed, so they stay readable in both themes. Accepts hex with alpha, rgb(), rgba(), hsl(), hsla() and colour names.</span>
      <div class="row pfoot" style="justify-content: flex-end"><button class="btn text" data-act="panel-close">Cancel</button><button class="btn fillb" data-act="cp-apply">Use this colour</button></div>`, 'top: 70px; left: max(8px, calc(50% - 200px)); width: 400px;');
  }
  function cpFromPointer(e, box) { const r = box.getBoundingClientRect(); S.colour.s = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100); S.colour.v = Math.round(100 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 100); S.colour.text = pickerHex(); render(); }
  root.addEventListener('pointerdown', e => { const box = e.target.closest('[data-sv]'); if (!box) return; cpFromPointer(e, box); const mv = ev => cpFromPointer(ev, document.querySelector('[data-sv]')); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
  root.addEventListener('keydown', e => { if (!e.target.matches?.('[data-sv]')) return; const d = { ArrowLeft: ['s', -2], ArrowRight: ['s', 2], ArrowUp: ['v', 2], ArrowDown: ['v', -2] }[e.key]; if (!d) return; e.preventDefault(); S.colour[d[0]] = Math.max(0, Math.min(100, S.colour[d[0]] + d[1])); S.colour.text = pickerHex(); render(); document.querySelector('[data-sv]')?.focus(); });

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
      <div class="row" style="gap: 8px; flex-wrap: wrap"><span class="seg">${Object.keys(Lib.LOGO_SHAPES).map(sh => `<button class="${l.shape === sh ? 'on' : ''}" aria-pressed="${l.shape === sh}" data-act="logo-shape" data-v="${sh}">${sh[0].toUpperCase() + sh.slice(1)}</button>`).join('')}</span><label class="sr" for="lbg">Logo background colour</label><input id="lbg" class="mono" data-input="logoBg" placeholder="Background colour" value="${esc(l.bg || '')}" style="width: 150px; height: 36px"></div>
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
  async function loadMedia() { if (S.mediaStatus || !api.mediaStatus) return; S.mediaStatus = await api.mediaStatus(); render(); }
  const installBtn = (tool, label) => `<button class="btn tonal" data-act="install-tool" data-tool="${tool}">${ic('download')}Install ${label} (one click)</button>`;
  function mediaCard() {
    const M = S.mediaStatus; if (!M) { loadMedia(); return '<div class="card"><span class="h2">Video and audio</span><span class="small">Checking for FFmpeg…</span></div>'; }
    return `<div class="card"><span class="h2">Video and audio</span>${M.ffmpeg ? `<span class="small">FFmpeg found. The result is saved next to the original with a new name; nothing is overwritten.</span>
      <div class="row" style="gap: 6px; flex-wrap: wrap"><label class="sr" for="mp">Conversion</label><select id="mp" data-input="mediaPreset" style="height: 38px">${Object.entries(MEDIA_PRESETS).map(([k, l]) => `<option value="${k}" ${S.mediaPreset === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn fillb" data-act="media-go">${ic('movie')}Choose a file and convert</button></div>${jobHtml('media')}`
      : `<span class="small">Converting video and audio uses FFmpeg, which is not installed. One click installs it with the Windows Package Manager; Windows may ask for permission.</span>${installBtn('ffmpeg', 'FFmpeg')}${jobHtml('install-ffmpeg')}`}</div>`;
  }
  const MEDIA_PRESETS = { mp4: 'Video to MP4 (H.264)', webm: 'Video to WebM (VP9)', gif: 'Video to GIF', mp3: 'Audio to MP3', wav: 'Audio to WAV', ogg: 'Audio to Ogg (Opus)', m4a: 'Extract audio to M4A' };
  function archiveCard() {
    const M = S.mediaStatus; if (!M) return '';
    return `<div class="card"><span class="h2">Archives</span><span class="small">Make .7z archives and extract 7z, ZIP, TAR, GZ, XZ and BZ2 with the 7-Zip engine included in this app. Extracted files go to a new folder; nothing is overwritten.</span>
      <div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn tonal" data-act="archive-make">${ic('folder_zip')}Make a .7z from files</button><button class="btn tonal" data-act="archive-open">${ic('unarchive')}Extract an archive</button></div>${jobHtml('archive')}
      ${M.sevenZipFull ? '<span class="small">Full 7-Zip found: RAR archives can be extracted too.</span>' : `<span class="small">RAR archives need the full 7-Zip.</span>${installBtn('sevenzip', '7-Zip')}${jobHtml('install-sevenzip')}`}</div>`;
  }
  async function convertFile(kind, file) {
    if (kind === 'yaml>json') { if (file.size > 25 * 1024 * 1024) { toast('Files up to 25 MB only. Nothing was read.', 'err'); return; } const r = await api.yamlToJson(await file.text()); if (!r.ok) { toast(`YAML to JSON failed: ${r.error === 'MALFORMED_YAML' ? 'the YAML is not valid' : r.error.toLowerCase()}${r.detail ? ` (${r.detail})` : ''}. Nothing was saved.`, 'err'); return; } S.tools.conv = { name: file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') + '.json', text: r.text, note: '' }; toast(`Converted to ${S.tools.conv.name}`); render(); return; }
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
    const io = 'width: 100%; min-height: 96px; ; font: 13px/1.5 "JetBrains Mono", monospace; resize: vertical';
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
        ${row('YAML to JSON', 'yaml>json', '.yaml,.yml,application/yaml')}
        ${T2.conv ? `<div class="card outline" style="gap: 8px"><span class="t" style="font-weight: 650">${esc(T2.conv.name)}</span>${T2.conv.note ? `<span class="small">${esc(T2.conv.note)}</span>` : ''}<div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn tonal" data-act="conv-save">${ic('download')}Save</button>${T2.conv.text !== undefined ? `<button class="btn text" data-act="conv-edit" data-e="vscode" ${ed.vscode ? '' : 'disabled'}>${ic('code')}Open in VS Code${ed.vscode ? '' : ' (not found)'}</button><button class="btn text" data-act="conv-edit" data-e="default">Open with the default app</button>` : ''}</div></div>` : ''}
      </div>${mediaCard()}${archiveCard()}</div></div>`);
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


  // ---------- Minecraft servers ----------
  S.mc = { list: null, sel: null, form: { name: 'survival', flavour: 'paper', version: '', channel: 'release', vq: '', kind: 'local', host: '', port: 25565, memoryMb: 2048, eula: false }, catalog: {}, logs: null, props: null, cmd: '', rules: null, area: { x: -50, z: -50, w: 100, h: 100 }, format: 'folder', dest: '' };
  const MC_TARGETS = { local: 'This computer (process)', docker: 'This computer (Docker)', ssh: 'SSH host (process in tmux)', 'ssh-docker': 'SSH host (Docker)' };
  const MC_ERR = { EULA_REQUIRED: 'Accept the Minecraft EULA first', NO_SERVER_DISTRIBUTION: 'Mojang published no server for this version', CATALOG_OFFLINE: 'The version catalog could not be reached', CHECKSUM_MISMATCH: 'The download did not match its published checksum and was deleted', JAVA_MISSING: 'Java is not installed', SSH_AUTH_FAILED: 'SSH refused the key. Set up key-based sign-in for this host first', SSH_UNREACHABLE: 'The SSH host could not be reached', REMOTE_NEEDS_TMUX: 'The SSH host needs tmux installed', REMOTE_NEEDS_JAVA: 'The SSH host needs Java installed', START_SERVER_FIRST: 'Start the server and wait until it says Done', PORT_IN_USE_BY_ANOTHER_SERVER: 'Another server here already uses that port', NOT_RUNNING: 'The server is not running', NO_WORLD_YET: 'There is no world yet. Start the server once', EDIT_ON_TARGET_UNSUPPORTED: 'Typed settings are edited for servers on this computer; use the console for other targets', UNAVAILABLE: 'The tool is not installed or not on PATH' };
  const mcErr = r => (MC_ERR[r?.error] || String(r?.error || 'Failed').toLowerCase().replace(/_/g, ' ')) + (r?.detail ? ` (${r.detail})` : '');
  async function mcLoad() { S.mc.list = (await api.mc.list()).servers || []; if (!S.mc.java && !browser) S.mc.java = await api.javaStatus(); render(); }
  async function mcCatalog(f) { if (S.mc.catalog[f]) return; S.mc.catalog[f] = { loading: true }; render(); S.mc.catalog[f] = await api.mc.catalog(f); const v = (S.mc.catalog[f].versions || []).find(x => x.type === 'release'); if (v && !S.mc.form.version) S.mc.form.version = v.id; render(); }
  let mcTimer; function mcPoll() { clearInterval(mcTimer); mcTimer = setInterval(async () => { const tab = S.tabs.find(t => t.id === S.active); if (tab?.view !== 'servers' || !S.mc.sel) return clearInterval(mcTimer); S.mc.logs = await api.mc.logs(S.mc.sel); const box = document.getElementById('mc-console'); if (box) { const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 8; box.innerHTML = (S.mc.logs.lines || []).map(l => `<span>${esc(l)}</span>`).join(''); if (atEnd) box.scrollTop = box.scrollHeight; const st = document.getElementById('mc-state'); if (st) st.outerHTML = mcState(); } }, 2000); }
  const mcState = () => { const L = S.mc.logs; return `<span id="mc-state" class="badge ${L?.running ? (L.ready === false ? 'warn' : 'ok') : 'mute'}">${L?.connection === 'lost' ? 'Connection lost' : L?.running ? (L.ready === false ? 'Starting' : 'Running') : L?.running === false ? 'Stopped' : 'Unknown'}</span>`; };
  function propControl(k, d, v) {
    const id = 'mp-' + k;
    if (d.type === 'bool') return `<button class="toggle ${v ? 'on' : ''}" role="switch" aria-checked="${!!v}" aria-label="${esc(d.label)}" data-act="mc-prop-bool" data-k="${k}"></button>`;
    if (d.type === 'enum') return `<select id="${id}" data-mcprop="${k}" aria-label="${esc(d.label)}">${d.values.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    if (d.type === 'int') return `<span class="row" style="gap: 4px"><input id="${id}" type="number" min="${d.min}" max="${d.max}" value="${v ?? d.default}" data-mcprop="${k}" aria-label="${esc(d.label)}" style="width: 96px"><span class="small">${d.min} to ${d.max}</span></span>`;
    return `<input id="${id}" value="${esc(v ?? d.default)}" maxlength="${d.max}" data-mcprop="${k}" aria-label="${esc(d.label)}" style="width: 200px">`;
  }
  function mcAreaCanvas() {
    const A = S.mc.area, span = Math.max(200, A.w + 40, A.h + 40), cell = 240 / span;
    const left = (A.x + span / 2) * cell, top = (A.z + span / 2) * cell;
    return `<div class="mc-area" data-mcarea="1" role="application" aria-label="Area to generate: ${A.w} by ${A.h} chunks starting at chunk ${A.x}, ${A.z}. Arrow keys move it, Shift with arrows resizes it." tabindex="0" style="--cell: ${cell}px"><i class="mc-rect" style="left: ${left}px; top: ${top}px; width: ${A.w * cell}px; height: ${A.h * cell}px"></i><span class="mc-origin" style="left: ${span / 2 * cell}px; top: ${span / 2 * cell}px" title="Spawn (chunk 0, 0)"></span></div>`;
  }
  function viewServers() {
    const M = S.mc; if (!M.list) { mcLoad(); return page('Game servers', '', '<span class="small">Loading…</span>'); }
    const F = M.form, cat = M.catalog[F.flavour]; if (!cat) mcCatalog(F.flavour);
    const vlist = (cat?.versions || []).filter(v => F.channel === 'all' || (F.channel === 'release' ? v.type === 'release' : F.channel === 'snapshot' ? v.type === 'snapshot' : /old/.test(v.type)));
    const vr = Lib.search(vlist.map(v => ({ ...v, label: v.id })), F.vq, { regex: !!F.vregex }); const shown = vr.ok ? vr.items.slice(0, 400) : [];
    const sel = M.sel && M.list.find(s => s.id === M.sel);
    const inp = 'height: 38px; ';
    const create = `<div class="card"><span class="h2">New server</span>
      <div class="field"><label for="mc-name">Name</label><input id="mc-name" data-mcf="name" value="${esc(F.name)}" maxlength="40"></div>
      <div class="row" style="gap: 8px; flex-wrap: wrap"><span class="seg" role="radiogroup" aria-label="Server type">${[['vanilla', 'Vanilla'], ['paper', 'Paper'], ['fabric', 'Fabric']].map(([k, l]) => `<button role="radio" aria-checked="${F.flavour === k}" class="${F.flavour === k ? 'on' : ''}" data-act="mc-flavour" data-v="${k}">${l}</button>`).join('')}</span></div>
      <div class="row" style="gap: 6px; flex-wrap: wrap"><span class="seg">${[['release', 'Releases'], ['snapshot', 'Snapshots'], ['old', 'Old'], ['all', 'All']].map(([k, l]) => `<button class="${F.channel === k ? 'on' : ''}" aria-pressed="${F.channel === k}" data-act="mc-channel" data-v="${k}">${l}</button>`).join('')}</span></div>
      <div class="row" style="gap: 6px"><label class="sr" for="mc-vq">Search versions</label><input id="mc-vq" class="mono" data-input="mcVq" value="${esc(F.vq)}" placeholder="Search ${vlist.length} versions" style="flex: 1; ${inp}"><button class="badge ${F.vregex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="mc-vregex" aria-pressed="${!!F.vregex}">.*</button></div>
      ${cat?.loading ? '<span class="small">Reading the official version list…</span>' : cat?.ok ? `<select data-mcf="version" aria-label="Version" size="6" >${shown.map(v => `<option value="${esc(v.id)}" ${v.id === F.version ? 'selected' : ''}>${esc(v.id)} · ${esc(v.type.replace('_', ' '))}</option>`).join('')}</select><span class="small">${vlist.length} versions from the ${F.flavour === 'vanilla' ? 'Mojang' : F.flavour === 'paper' ? 'PaperMC' : 'Fabric'} catalog${cat.stale ? ', last good copy (offline now)' : ''}, read ${new Date(cat.at).toLocaleTimeString()}. Versions without a published server say so when you create.</span>` : `<span class="badge err">${esc(mcErr(cat))}</span><button class="btn text" data-act="mc-catalog-retry">Try again</button>`}
      <div class="field"><label for="mc-target">Runs on</label><select id="mc-target" data-mcf="kind">${Object.entries(MC_TARGETS).map(([k, l]) => `<option value="${k}" ${F.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${F.kind.startsWith('ssh') ? `<div class="field"><label for="mc-host">SSH host (user@host, key sign-in)</label><input id="mc-host" data-mcf="host" value="${esc(F.host)}" placeholder="me@server.example"></div>` : ''}
      <div class="row" style="gap: 12px; flex-wrap: wrap; align-items: flex-start"><div class="field" style="flex: 1 1 120px"><label for="mc-port">Port</label><input id="mc-port" type="number" min="1024" max="65535" data-mcf="port" value="${F.port}" style="height: 44px"></div><div class="field" style="flex: 2 1 180px"><label for="mc-mem">Memory: ${F.memoryMb} MB</label><input id="mc-mem" type="range" min="512" max="16384" step="256" data-mcf="memoryMb" value="${F.memoryMb}"></div></div>
      ${F.kind === 'local' && M.java && !M.java.java ? `<span class="small">Servers on this computer need Java.</span>${installBtn('java', 'Java 21')}${jobHtml('install-java')}` : ''}
      <label class="row" style="gap: 8px"><input type="checkbox" class="check" data-mcf="eula" ${F.eula ? 'checked' : ''}><span class="small">I accept the Minecraft End User License Agreement (minecraft.net/eula). The app writes eula=true only after this.</span></label>
      <button class="btn fillb" data-act="mc-create" style="align-self: flex-start" ${F.eula && F.version ? '' : 'disabled'}>${ic('add')}Create server</button>${jobHtml('mc-create')}</div>`;
    const list = M.list.map(s => `<button class="li" data-act="mc-select" data-id="${esc(s.id)}" aria-current="${s.id === M.sel}"><span class="tile ${s.running ? 'ok' : ''}">${ic('dns', 'fill')}</span><span class="stack grow"><span class="t">${esc(s.name)}</span><span class="m">${esc(s.flavour)} ${esc(s.version)} · ${esc(MC_TARGETS[s.target.kind])}${s.target.host ? ' ' + esc(s.target.host) : ''} · port ${s.port}</span></span></button>`).join('') || '<span class="small">No servers yet.</span>';
    let detail = '';
    if (sel) {
      const P = M.props, local = sel.target.kind === 'local';
      detail = `<div class="card"><div class="row" style="gap: 8px; flex-wrap: wrap"><span class="h2" style="flex: 1">${esc(sel.name)}</span>${mcState()}<button class="btn tonal" data-act="mc-start">${ic('play_arrow')}Start</button><button class="btn text" data-act="mc-stop">${ic('stop')}Stop</button><button class="btn text" data-act="mc-restart">${ic('restart_alt')}Restart</button></div>
        <span class="small">${esc(sel.flavour)} ${esc(sel.version)} · ${esc(MC_TARGETS[sel.target.kind])}${sel.verified ? ' · download checksum verified' : ''}${sel.path ? ` · <span class="mono">${esc(sel.path)}</span>` : ''}</span>
        <div class="mc-console mono" id="mc-console" role="log" aria-live="off">${(M.logs?.lines || []).map(l => `<span>${esc(l)}</span>`).join('')}</div>
        <div class="row" style="gap: 6px"><label class="sr" for="mc-cmd">Console command</label><input id="mc-cmd" class="mono" data-input="mcCmd" value="${esc(M.cmd)}" placeholder="say hello" style="flex: 1; ${inp}"><button class="btn tonal" data-act="mc-send">Send</button></div>
        <div class="row" style="gap: 6px; flex-wrap: wrap">${[['list', 'Who is online'], ['save-all', 'Save now'], ['weather clear', 'Clear weather'], ['time set day', 'Make it day']].map(([c, l]) => `<button class="chip" data-act="mc-quick" data-c="${c}">${l}</button>`).join('')}</div>
        <div class="row" style="gap: 6px; flex-wrap: wrap"><label class="sr" for="mc-player">Player name</label><input id="mc-player" data-input="mcPlayer" value="${esc(M.player || '')}" placeholder="Player name" maxlength="16" style="width: 160px; ${inp}">${[['whitelist add', 'Allowlist'], ['whitelist remove', 'Remove from allowlist'], ['op', 'Make operator'], ['deop', 'Remove operator'], ['kick', 'Kick'], ['ban', 'Ban'], ['pardon', 'Unban']].map(([c, l]) => `<button class="chip" data-act="mc-player" data-c="${c}">${l}</button>`).join('')}</div></div>
        ${local ? `<div class="card"><span class="h2">Server settings</span>${P?.ok ? Object.entries(P.descriptors).map(([k, d]) => `<div class="set"><label class="grow" for="mp-${k}">${esc(d.label)}${d.restart ? ' <span class="badge mute">restart</span>' : ''}</label>${propControl(k, d, (M.propEdits || {})[k] ?? P.values[k])}</div>`).join('') + (Object.keys(P.unknown).length ? `<span class="small">${Object.keys(P.unknown).length} other settings in the file are kept exactly as they are: ${esc(Object.keys(P.unknown).slice(0, 12).join(', '))}${Object.keys(P.unknown).length > 12 ? '…' : ''}</span>` : '') + `<button class="btn fillb" data-act="mc-save-props" style="align-self: flex-start" ${M.propEdits && Object.keys(M.propEdits).length ? '' : 'disabled'}>Save settings</button>` : '<span class="small">Loading…</span>'}</div>
        <div class="card"><span class="h2">Game rules for ${esc(sel.version)}</span><span class="small">Read from this version's own data generator, so the list matches the version exactly. Changes are sent to the running server.</span>${M.rules?.ok ? M.rules.rules.map(r => `<div class="set"><span class="grow mono small">${esc(r.name)}</span>${r.type === 'bool' ? `<button class="chip" data-act="mc-rule" data-n="${esc(r.name)}" data-v="true">true</button><button class="chip" data-act="mc-rule" data-n="${esc(r.name)}" data-v="false">false</button>` : r.type === 'int' ? `<input type="number" data-mcrule="${esc(r.name)}" ${r.min !== undefined ? `min="${r.min}"` : ''} ${r.max !== undefined ? `max="${r.max}"` : ''} aria-label="${esc(r.name)}" style="width: 90px"><button class="chip" data-act="mc-rule-int" data-n="${esc(r.name)}">Set</button>` : '<span class="badge mute">unknown type</span>'}</div>`).join('') : `<button class="btn tonal" data-act="mc-rules" style="align-self: flex-start">${ic('rule')}Read game rules</button>${M.rules && !M.rules.ok ? `<span class="badge err">${esc(mcErr(M.rules))}</span>` : ''}${jobHtml('mc-rules')}`}</div>
        <div class="card"><span class="h2">Generate world area</span><span class="small">Default 100 × 100 chunks around spawn. Drag the rectangle, or focus it and use the arrow keys (Shift resizes). The running server generates the chunks in batches with forceload, then the world is copied to a folder or a ZIP. Nothing is overwritten.</span>
          ${mcAreaCanvas()}
          <div class="row" style="gap: 8px; flex-wrap: wrap">${[['x', 'Start chunk X'], ['z', 'Start chunk Z'], ['w', 'Width (chunks)'], ['h', 'Height (chunks)']].map(([k, l]) => `<label class="small stack" style="gap: 2px">${l}<input type="number" data-mcarea-n="${k}" value="${M.area[k]}" ${k === 'w' || k === 'h' ? 'min="1" max="1000"' : ''} style="width: 100px; ${inp}"></label>`).join('')}</div>
          <div class="row" style="gap: 8px; flex-wrap: wrap"><span class="seg">${[['folder', 'Folder'], ['zip', 'ZIP']].map(([k, l]) => `<button class="${M.format === k ? 'on' : ''}" aria-pressed="${M.format === k}" data-act="mc-format" data-v="${k}">${l}</button>`).join('')}</span><button class="btn text" data-act="mc-browse">${ic('folder_open')}Browse…</button><span class="small mono" style="overflow-wrap: anywhere">${esc(M.dest || 'No destination chosen')}</span></div>
          <button class="btn fillb" data-act="mc-pregen" style="align-self: flex-start" ${M.dest ? '' : 'disabled'}>Generate ${M.area.w * M.area.h} chunks</button>${jobHtml('mc-pregen')}</div>
        <div class="card"><div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn tonal" data-act="mc-backup">${ic('backup')}Back up the world</button><button class="btn text" style="color: var(--err)" data-act="mc-remove">${ic('delete')}Remove server…</button></div>${jobHtml('mc-backup')}</div>` : `<div class="card"><span class="small">This server runs on ${esc(MC_TARGETS[sel.target.kind])}. Use the console and player controls; typed settings, game rules, backups and area generation run for servers on this computer.</span><button class="btn text" style="color: var(--err); align-self: flex-start" data-act="mc-remove">${ic('delete')}Remove server…</button></div>`}`;
    }
    return page('Game servers', '', `<div class="cols"><div class="side" style="flex: 1 1 360px">${create}<div class="card"><span class="h2">Servers</span><div class="list">${list}</div></div></div><div class="wide">${detail || `<div class="card empty"><span class="tile ac">${ic('dns', 'lg fill')}</span><span class="h2">No server selected</span><span class="sub">Create one on the left, or pick one from your servers to open its console, settings and world tools.</span><div class="empty-steps"><div><span class="n">1</span><span class="stack"><span style="font-weight: 600">Pick a version</span><span class="small">Live from the Mojang, PaperMC and Fabric catalogs</span></span></div><div><span class="n">2</span><span class="stack"><span style="font-weight: 600">Choose where it runs</span><span class="small">This computer, Docker or an SSH host</span></span></div><div><span class="n">3</span><span class="stack"><span style="font-weight: 600">Accept the EULA and start</span><span class="small">The download is checked before it runs</span></span></div></div></div>`}</div></div>`);
  }
  async function mcSelect(id) { S.mc.sel = id; S.mc.props = null; S.mc.propEdits = {}; S.mc.rules = null; S.mc.logs = await api.mc.logs(id); render(); const s = S.mc.list.find(x => x.id === id); if (s?.target.kind === 'local') { S.mc.props = await api.mc.properties(id); render(); } mcPoll(); }
  async function mcAct(a, t) {
    const M = S.mc, id = M.sel;
    switch (a) {
      case 'mc-flavour': M.form.flavour = t.dataset.v; M.form.version = ''; mcCatalog(t.dataset.v); break;
      case 'mc-channel': M.form.channel = t.dataset.v; break;
      case 'mc-vregex': M.form.vregex = !M.form.vregex; break;
      case 'mc-catalog-retry': delete M.catalog[M.form.flavour]; break;
      case 'mc-create': { const F = M.form; await startJob('mc-create', api.mc.create({ name: F.name, flavour: F.flavour, version: F.version, target: F.kind.startsWith('ssh') ? { kind: F.kind, host: F.host.trim() } : { kind: F.kind }, port: +F.port, memoryMb: +F.memoryMb, eula: F.eula }), `Creating ${F.name}`); return; }
      case 'mc-select': return mcSelect(t.dataset.id);
      case 'mc-start': { const r = await api.mc.start(id); if (!r.ok) toast(`Could not start: ${mcErr(r)}`, 'err'); else toast('Starting the server'); M.logs = await api.mc.logs(id); break; }
      case 'mc-stop': { const r = await api.mc.stop(id); toast(r.ok ? (r.forced ? 'The server did not stop in 30 seconds and was ended' : 'Server stopped') : `Could not stop: ${mcErr(r)}`, r.ok ? 'ok' : 'err'); break; }
      case 'mc-restart': { await api.mc.stop(id); const r = await api.mc.start(id); toast(r.ok ? 'Restarting' : `Could not restart: ${mcErr(r)}`, r.ok ? 'ok' : 'err'); break; }
      case 'mc-send': { const r = await api.mc.command(id, M.cmd); if (!r.ok) toast(mcErr(r), 'err'); else M.cmd = ''; break; }
      case 'mc-quick': { const r = await api.mc.command(id, t.dataset.c); if (!r.ok) toast(mcErr(r), 'err'); break; }
      case 'mc-player': { const p = (M.player || '').trim(); if (!/^[A-Za-z0-9_]{3,16}$/.test(p)) { toast('Player names are 3 to 16 letters, digits or underscores', 'err'); break; } const r = await api.mc.command(id, `${t.dataset.c} ${p}`); toast(r.ok ? `Sent: ${t.dataset.c} ${p}` : mcErr(r), r.ok ? 'ok' : 'err'); break; }
      case 'mc-prop-bool': { const k = t.dataset.k; M.propEdits[k] = !((M.propEdits[k] ?? M.props.values[k]) ?? M.props.descriptors[k].default); break; }
      case 'mc-save-props': { const r = await api.mc.setProperties(id, M.propEdits); if (!r.ok) { toast(`Not saved: ${r.key || ''} ${mcErr(r)}`, 'err'); break; } M.propEdits = {}; M.props = await api.mc.properties(id); toast(r.restartNeeded ? 'Saved. Restart the server for some changes to apply.' : 'Saved'); break; }
      case 'mc-rules': { const r = await api.mc.gameRules(id); if (r.ok) { S.jobs[r.op] = { slot: 'mc-rules', label: 'Reading game rules', result: null, onDone: res => { M.rules = res; } }; } break; }
      case 'mc-rule': { const r = await api.mc.command(id, `gamerule ${t.dataset.n} ${t.dataset.v}`); toast(r.ok ? `${t.dataset.n} set to ${t.dataset.v}` : mcErr(r), r.ok ? 'ok' : 'err'); break; }
      case 'mc-rule-int': { const v = root.querySelector(`[data-mcrule="${t.dataset.n}"]`).value; if (!/^-?\d+$/.test(v)) { toast('Enter a whole number', 'err'); break; } const r = await api.mc.command(id, `gamerule ${t.dataset.n} ${v}`); toast(r.ok ? `${t.dataset.n} set to ${v}` : mcErr(r), r.ok ? 'ok' : 'err'); break; }
      case 'mc-format': M.format = t.dataset.v; break;
      case 'mc-browse': { const r = await api.mc.pickFolder(); if (r.ok) M.dest = r.path; break; }
      case 'mc-pregen': await startJob('mc-pregen', api.mc.pregenerate(id, { ...M.area, destination: M.dest, format: M.format }), `Generating ${M.area.w * M.area.h} chunks`); return;
      case 'mc-backup': await startJob('mc-backup', api.mc.backup(id), 'Backing up the world'); return;
      case 'mc-remove': { const s = M.list.find(x => x.id === id); Kit.superConfirm({ title: `Remove the server "${s.name}"`, detail: s.target.kind === 'local' ? `Deletes its folder, worlds and backups: ${s.path}` : s.target.kind.endsWith('docker') ? `Removes the container ${s.container}. Its data volume ${s.container}-data is kept.` : `Forgets it here. The files stay on ${s.target.host} in ${s.path}.`, opener: t, onConfirm: async () => { const r = await api.mc.remove(id); if (r.ok) { M.sel = null; await mcLoad(); toast('Server removed'); } else toast(mcErr(r), 'err'); } }); return; }
    }
    render();
  }
  root.addEventListener('pointerdown', e => {
    const box = e.target.closest('[data-mcarea]'); if (!box) return;
    const A = S.mc.area, cell = parseFloat(getComputedStyle(box).getPropertyValue('--cell')), r = box.getBoundingClientRect(), span = 240 / cell;
    const start = { x: e.clientX, y: e.clientY, ax: A.x, az: A.z };
    const mv = ev => { A.x = Math.round(start.ax + (ev.clientX - start.x) / cell); A.z = Math.round(start.az + (ev.clientY - start.y) / cell); const rect = document.querySelector('.mc-rect'); if (rect) { rect.style.left = (A.x + span / 2) * cell + 'px'; rect.style.top = (A.z + span / 2) * cell + 'px'; } };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); render(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); e.preventDefault(); void r;
  });
  root.addEventListener('keydown', e => {
    if (!e.target.matches?.('[data-mcarea]')) return; const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return; e.preventDefault();
    const A = S.mc.area; if (e.shiftKey) { A.w = Math.max(1, Math.min(1000, A.w + d[0] * 5)); A.h = Math.max(1, Math.min(1000, A.h + d[1] * 5)); } else { A.x += d[0] * 5; A.z += d[1] * 5; } render(); document.querySelector('[data-mcarea]')?.focus();
  });

  // ---------- Local AI (Ollama) ----------
  S.ai = { status: null, catalog: null, q: '', regex: false, tags: {}, chats: null, cur: 0, input: '', model: '', system: '', temperature: 0.7, streaming: null };
  const AI_ERR = { OLLAMA_NOT_RUNNING: 'Ollama is not running. Start it here', OLLAMA_MISSING: 'Ollama is not installed', CATALOG_OFFLINE: 'The ollama.com library could not be reached; installed models still work', NOT_OWNED: 'This Ollama was started outside the app, so the app does not stop it', NOT_HEALTHY: 'Ollama started but did not answer in 20 seconds' };
  const aiErr = r => (AI_ERR[r?.error] || String(r?.error || 'Failed').toLowerCase().replace(/_/g, ' ')) + (r?.detail ? ` (${r.detail})` : '');
  async function aiLoad() { S.ai.status = await api.ollama.status(); if (!S.ai.chats) { const c = await api.ollama.chats(); S.ai.chats = c.sessions?.length ? c.sessions : [{ title: 'New chat', messages: [] }]; } if (!S.ai.model && S.ai.status.models?.length) S.ai.model = S.ai.status.models[0].name; render(); }
  const fit = (size, hw) => { if (!size || !hw) return { verdict: 'Unknown', why: 'Size or hardware not known' }; const need = size * 1.2; if (hw.vram && need <= hw.vram) return { verdict: 'Runs well', why: `Needs about ${(need / 2 ** 30).toFixed(1)} GB; graphics memory ${(hw.vram / 2 ** 30).toFixed(1)} GB` }; if (need <= hw.ram * 0.6) return { verdict: 'Runs with limits', why: `Needs about ${(need / 2 ** 30).toFixed(1)} GB; fits in system memory, slower without graphics memory` }; return { verdict: 'Unlikely', why: `Needs about ${(need / 2 ** 30).toFixed(1)} GB; this computer has ${(hw.ram / 2 ** 30).toFixed(1)} GB memory` }; };
  const fitBadge = f => `<span class="badge ${{ 'Runs well': 'ok', 'Runs with limits': 'warn', Unlikely: 'err' }[f.verdict] || 'mute'}" title="${esc(f.why)}">${f.verdict}</span>`;
  async function aiSaveChats() { await api.ollama.saveChats({ sessions: S.ai.chats }); }
  function viewAi() {
    const A = S.ai; if (!A.status) { aiLoad(); return page('Local AI', '', '<span class="small">Checking for Ollama…</span>'); }
    const st = A.status, hw = st.hardware;
    const head = !st.installed ? `<div class="card"><span class="h2">Ollama is not installed</span><span class="small">Local AI runs models on this computer with Ollama. One click installs it; Windows may ask for permission, and the app never answers that prompt for you.</span>${installBtn('ollama', 'Ollama')}${jobHtml('install-ollama')}</div>`
      : !st.running ? `<div class="card"><span class="h2">Ollama is installed but not running</span><span class="small">Start it here. The app runs it on 127.0.0.1:11434 only and stops it when you press Stop.</span><button class="btn fillb" data-act="ai-start" style="align-self: flex-start">${ic('play_arrow')}Start Ollama</button></div>`
      : `<div class="card"><div class="row" style="gap: 8px; flex-wrap: wrap"><span class="h2" style="flex: 1">Ollama ${esc(st.version)}</span><span class="badge ok">Running</span>${st.owned ? `<button class="btn text" data-act="ai-stop">Stop</button>` : ''}<button class="btn text" data-act="ai-refresh">${ic('refresh')}Refresh</button></div><span class="small">${hw ? `This computer: ${(hw.ram / 2 ** 30).toFixed(1)} GB memory${hw.gpu ? `, ${esc(hw.gpu)} with ${(hw.vram / 2 ** 30).toFixed(1)} GB` : ', no NVIDIA graphics card detected'}${hw.disk ? `, ${(hw.disk / 2 ** 30).toFixed(0)} GB free disk` : ''}.` : ''} Fit verdicts are estimates from real sizes, never promises.</span></div>`;
    const installed = (st.models || []).map(m => { const f = fit(m.size, hw); return `<div class="set"><span class="stack grow"><span class="t mono">${esc(m.name)}</span><span class="small">${(m.size / 2 ** 30).toFixed(1)} GB${m.details?.parameter_size ? ' · ' + esc(m.details.parameter_size) : ''}${m.details?.quantization_level ? ' · ' + esc(m.details.quantization_level) : ''}${(st.loaded || []).some(l => l.name === m.name) ? ' · loaded' : ''}</span></span>${fitBadge(f)}<button class="btn text" style="color: var(--err)" data-act="ai-remove" data-m="${esc(m.name)}">Remove…</button></div>`; }).join('') || '<span class="small">No models installed yet. Pick one from the library.</span>';
    const C = A.catalog, cr = C?.ok ? Lib.search(C.models.map(m => ({ ...m, label: m.name })), A.q, { regex: A.regex }) : null;
    const lib = !C ? `<button class="btn tonal" data-act="ai-catalog">${ic('travel_explore')}Load the model library</button>` : !C.ok ? `<span class="badge err">${esc(aiErr(C))}</span><button class="btn text" data-act="ai-catalog">Try again</button>` : `<div class="row" style="gap: 6px"><label class="sr" for="aiq">Search models</label><input id="aiq" class="mono" data-input="aiQ" value="${esc(A.q)}" placeholder="Search ${C.models.length} models" style="flex: 1; height: 36px"><button class="badge ${A.regex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="ai-regex" aria-pressed="${A.regex}">.*</button></div><span class="small">${C.models.length} models from ollama.com/library, read ${new Date(C.at).toLocaleTimeString()}${C.stale ? ' (offline now, last good copy)' : ''}. Page layout changes on ollama.com can hide entries; installed models always show.</span>
      <div class="list" style="max-height: 320px; overflow: auto">${(cr.ok ? cr.items : []).slice(0, 200).map(m => { const T2 = A.tags[m.name]; return `<div class="li static" style="flex-wrap: wrap"><span class="t mono grow" style="flex: 1">${esc(m.name)}</span><button class="btn text" data-act="ai-tags" data-m="${esc(m.name)}">${T2 ? 'Hide' : 'Variants'}</button>${T2 ? `<div class="stack" style="flex: 1 1 100%; gap: 4px">${T2.ok ? T2.tags.slice(0, 40).map(tg => { const f = fit(tg.size, hw); return `<span class="row" style="gap: 8px"><span class="mono small grow" style="flex: 1">${esc(m.name)}:${esc(tg.tag)}</span><span class="small">${tg.size ? (tg.size / 2 ** 30).toFixed(1) + ' GB' : 'size unknown'}</span>${fitBadge(f)}<button class="chip" data-act="ai-pull" data-m="${esc(m.name + ':' + tg.tag)}" ${st.running ? '' : 'disabled title="Start Ollama first"'}>Pull</button></span>`; }).join('') : `<span class="badge err">${esc(aiErr(T2))}</span>`}</div>` : ''}</div>`; }).join('')}</div>`;
    const chat = A.chats[A.cur] || A.chats[0];
    const chatCard = `<div class="card"><div class="row" style="gap: 6px; flex-wrap: wrap"><span class="h2" style="flex: 1">Chat</span><select data-input="aiModel" aria-label="Model" style="height: 34px">${(st.models || []).map(m => `<option ${m.name === A.model ? 'selected' : ''}>${esc(m.name)}</option>`).join('') || '<option value="">No models</option>'}</select><button class="btn text" data-act="ai-new">${ic('add')}New</button><button class="btn text" data-act="ai-export">${ic('download')}Export</button></div>
      <div class="row" style="gap: 6px; flex-wrap: wrap">${A.chats.map((c, i) => `<button class="badge ${i === A.cur ? 'ac' : 'mute'}" style="border: 0; cursor: pointer" data-act="ai-session" data-i="${i}">${esc(c.title)}</button>`).join('')}${A.chats.length > 1 ? `<button class="btn text" style="color: var(--err)" data-act="ai-del-session">Delete this chat…</button>` : ''}</div>
      <details><summary class="small">System prompt and temperature</summary><textarea data-input="aiSystem" rows="2" maxlength="8000" style="width: 100%; margin-top: 6px">${esc(A.system)}</textarea><label class="small">Temperature ${A.temperature} (0 precise, 2 creative)<input type="range" min="0" max="2" step="0.1" value="${A.temperature}" data-input="aiTemp" style="width: 100%"></label></details>
      <div class="ai-log" id="ai-log" role="log">${!chat.messages.length && !A.streaming ? `<div class="empty" style="padding: 28px 16px"><span class="tile ac">${ic('forum', 'lg fill')}</span><span class="h2">Ask the local model</span><span class="sub">Answers stream in here and stay on this computer.</span><div class="row" style="gap: 8px; flex-wrap: wrap; justify-content: center">${['Write a health check path for a Flask app', 'Explain what a NAT gateway costs', 'Turn this Dockerfile into a smaller image'].map(q => `<button class="chip" data-act="ai-suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>` : ''}${chat.messages.map(m => `<div class="bubble ${m.role === 'user' ? 'me' : 'ai'}">${m.role === 'user' ? esc(m.content) : Lib.markdown(m.content)}</div>`).join('')}${A.streaming ? `<div class="bubble ai"><span id="ai-stream">${esc(A.streaming.text)}</span><span class="caret"></span></div>` : ''}</div>
      <div class="row" style="gap: 6px"><label class="sr" for="ai-in">Message</label><textarea id="ai-in" data-input="aiInput" rows="2" maxlength="32000" placeholder="${st.running && A.model ? 'Ask the local model' : 'Start Ollama and pull a model first'}" style="flex: 1">${esc(A.input)}</textarea>${A.streaming ? `<button class="btn tonal" data-act="cancel-op" data-op="${A.streaming.op}">${ic('stop')}Stop</button>` : `<button class="btn fillb" data-act="ai-send" ${st.running && A.model ? '' : 'disabled'}>${ic('send')}Send</button>`}</div>
      <span class="small">Everything stays on this computer.</span></div>`;
    return page('Local AI', '', `${head}<div class="cols"><div class="wide">${chatCard}</div><div class="side"><div class="card"><span class="h2">Installed models</span>${installed}${jobHtml('ai-pull')}</div><div class="card"><span class="h2">Model library</span>${lib}</div></div></div>`);
  }
  async function aiAct(a, t) {
    const A = S.ai;
    switch (a) {
      case 'ai-start': { const r = await api.ollama.start(); if (!r.ok) toast(aiErr(r), 'err'); A.status = await api.ollama.status(); break; }
      case 'ai-stop': { const r = await api.ollama.stop(); if (!r.ok) toast(aiErr(r), 'err'); A.status = await api.ollama.status(); break; }
      case 'ai-refresh': A.status = await api.ollama.status(); break;
      case 'ai-catalog': A.catalog = { ok: true, models: [], at: Date.now() }; render(); A.catalog = await api.ollama.catalog(true); break;
      case 'ai-regex': A.regex = !A.regex; break;
      case 'ai-tags': { const m = t.dataset.m; if (A.tags[m]) delete A.tags[m]; else A.tags[m] = await api.ollama.tags(m); break; }
      case 'ai-pull': await startJob('ai-pull', api.ollama.pull(t.dataset.m), `Pulling ${t.dataset.m}`); return;
      case 'ai-remove': { const m = t.dataset.m; Kit.superConfirm({ title: `Remove the model ${m}`, detail: 'Deletes it from this computer. You can pull it again later.', opener: t, onConfirm: async () => { const r = await api.ollama.remove(m); toast(r.ok ? `Removed ${m}` : aiErr(r), r.ok ? 'ok' : 'err'); A.status = await api.ollama.status(); render(); } }); return; }
      case 'ai-suggest': A.input = t.dataset.q; render(); document.getElementById('ai-in')?.focus(); return;
      case 'ai-new': A.chats.push({ title: 'New chat', messages: [] }); A.cur = A.chats.length - 1; aiSaveChats(); break;
      case 'ai-session': A.cur = +t.dataset.i; break;
      case 'ai-del-session': Kit.superConfirm({ title: `Delete the chat "${A.chats[A.cur].title}"`, detail: 'Only on this computer.', opener: t, onConfirm: () => { A.chats.splice(A.cur, 1); A.cur = 0; aiSaveChats(); render(); } }); return;
      case 'ai-export': { const c = A.chats[A.cur]; const md = `# ${c.title}\n\n` + c.messages.map(m => `**${m.role === 'user' ? 'You' : A.model || 'Model'}:**\n\n${m.content}\n`).join('\n'); const r = await api.saveFile('chat.md', md); if (r.ok) toast('Chat saved'); return; }
      case 'ai-send': {
        const text = A.input.trim(); if (!text) break; const c = A.chats[A.cur]; c.messages.push({ role: 'user', content: text }); if (c.title === 'New chat') c.title = text.slice(0, 32); A.input = '';
        const r = await api.ollama.chat({ model: A.model, messages: c.messages, system: A.system, options: { temperature: A.temperature } });
        if (!r.ok) { toast(aiErr(r), 'err'); break; }
        A.streaming = { op: r.op, text: '' }; S.jobs[r.op] = { slot: 'ai-chat', label: 'Answering', result: null, onToken: d => { A.streaming.text += d; const el = document.getElementById('ai-stream'); if (el) { el.textContent = A.streaming.text; const log = document.getElementById('ai-log'); if (log) log.scrollTop = log.scrollHeight; } }, onDone: res => { const msg = res?.text || A.streaming?.text; if (msg) c.messages.push({ role: 'assistant', content: msg + (res?.ok && !res.partial ? '' : '\n\n_(stopped early)_') }); A.streaming = null; aiSaveChats(); }, quiet: true };
        break;
      }
    }
    render();
  }

  // ---------- Sketch (drawing and annotation) ----------
  const PENS = { pencil: ['Pencil', 2, 'speed', '1'], pen: ['Pen', 3, 'speed', '2'], fineliner: ['Fineliner', 2, 'const', '3'], marker: ['Marker', 8, 'const', '4'], highlighter: ['Highlighter', 18, 'const', '5'], brush: ['Brush', 10, 'speed', '6'], fountain: ['Fountain pen', 6, 'angle', '7'], eraser: ['Eraser', 24, 'const', 'E'] };
  S.sk = { tool: 'pen', color: '#6ea8ff', size: 1, strokes: null, redo: [], bg: null, min: false };
  function skLoad() { if (S.sk.strokes) return; try { S.sk.strokes = (S.settings.sketch?.strokes || []).slice(); S.sk.bg = S.settings.sketch?.bg || null; } catch { S.sk.strokes = []; } }
  let skSaveT; function skSave() { clearTimeout(skSaveT); skSaveT = setTimeout(() => api.setSetting('sketch', { strokes: S.sk.strokes.slice(-400), bg: S.sk.bg }).then(r => { if (!r.ok) toast('The drawing is too large to save; export it instead.', 'err'); }), 600); }
  function skDraw(ctx, strokes, scale = 1) {
    for (const s of strokes) {
      ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : s.tool === 'highlighter' ? 'multiply' : 'source-over';
      ctx.strokeStyle = s.tool === 'eraser' ? '#000' : s.color; ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : s.tool === 'pencil' ? 0.85 : 1; ctx.lineCap = s.tool === 'marker' ? 'square' : 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < s.p.length; i++) { const [x0, y0] = s.p[i - 1], [x1, y1, w] = s.p[i]; ctx.lineWidth = w * scale; ctx.beginPath(); ctx.moveTo(x0 * scale, y0 * scale); ctx.lineTo(x1 * scale, y1 * scale); ctx.stroke(); }
      if (s.p.length === 1) { ctx.lineWidth = s.p[0][2] * scale; ctx.beginPath(); ctx.moveTo(s.p[0][0] * scale, s.p[0][1] * scale); ctx.lineTo(s.p[0][0] * scale + 0.1, s.p[0][1] * scale); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function skRepaint() { const c = document.getElementById('sk-canvas'); if (!c) return; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); skDraw(ctx, S.sk.strokes, c.width / 1200); }
  function viewSketch() {
    skLoad(); const K = S.sk;
    const tools = Object.entries(PENS).map(([k, [l, , , key]]) => `<button class="chip ${K.tool === k ? 'on' : ''}" aria-pressed="${K.tool === k}" data-act="sk-tool" data-t="${k}" title="${l} (${key})" aria-keyshortcuts="${key}">${l}</button>`).join('');
    setTimeout(skRepaint, 0);
    return page('Sketch', '', `<div class="card sk-card"><div class="sk-bar ${K.min ? 'min' : ''}" role="toolbar" aria-label="Drawing tools">${K.min ? `<button class="chip on" data-act="sk-min" aria-label="Show tools">${esc(PENS[K.tool][0])}</button>` : `${tools}<label class="chip" title="Colour">${ic('palette', 'sm')}<input type="color" value="${K.color}" data-input="skColor" aria-label="Pen colour" style="width: 28px; height: 22px; border: 0; background: none"></label><label class="chip" title="Size">Size<input type="range" min="0.5" max="4" step="0.25" value="${K.size}" data-input="skSize" aria-label="Pen size" style="width: 90px"></label><button class="chip" data-act="sk-undo" title="Undo (Ctrl+Z)" ${K.strokes.length ? '' : 'disabled'}>Undo</button><button class="chip" data-act="sk-redo" title="Redo (Ctrl+Y)" ${K.redo.length ? '' : 'disabled'}>Redo</button><button class="chip" data-act="sk-clear" ${K.strokes.length ? '' : 'disabled'}>Clear…</button><label class="chip" title="Draw on an image">${ic('image', 'sm')}Image<input type="file" accept="image/png,image/jpeg,image/webp" data-file="skbg" class="sr"></label><button class="chip" data-act="sk-svg">SVG</button>${[1, 2, 3].map(x => `<button class="chip" data-act="sk-png" data-x="${x}">PNG ${x}x</button>`).join('')}<button class="chip" data-act="sk-min" aria-label="Minimise tools">${ic('expand_less', 'sm')}</button>`}</div>
      <div class="sk-stage" style="${K.bg ? `background-image: url(${K.bg})` : ''}"><canvas id="sk-canvas" width="1200" height="750" aria-label="Drawing surface. ${K.strokes.length} strokes." role="img" tabindex="0"></canvas></div>
      <span class="small">Hold Shift to lock a stroke to eight directions. Pencil, pen and brush thin as you move faster; the fountain pen changes with direction. Saved on this computer only.</span></div>`);
  }
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'mc-cmd') { e.preventDefault(); mcAct('mc-send', e.target); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'ai-in') { e.preventDefault(); aiAct('ai-send', e.target); }
  });
  let skCur = null;
  root.addEventListener('pointerdown', e => {
    const c = e.target.closest('#sk-canvas'); if (!c) return; e.preventDefault(); c.setPointerCapture(e.pointerId);
    const r = c.getBoundingClientRect(), k = 1200 / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    const [, base] = PENS[S.sk.tool]; skCur = { s: { tool: S.sk.tool, color: S.sk.color, p: [[Math.round(x), Math.round(y), base * S.sk.size]] }, last: { x, y, t: performance.now() }, origin: { x, y } }; S.sk.redo = [];
  });
  // Palette: the pointer moves the one highlighted command, as in menus, so hover never marks a second row.
  root.addEventListener('pointermove', e => {
    const P = S.palette; if (!P || e.pointerType === 'touch') return;
    const row = e.target.closest?.('#pal-list [id^="pal-o-"]'); if (!row) return;
    const n = +row.id.slice(6); if (n === P.sel) return;
    P.sel = n;
    document.querySelectorAll('#pal-list [id^="pal-o-"]').forEach(o => { const on = o === row; o.classList.toggle('sel', on); o.setAttribute('aria-selected', String(on)); });
    document.getElementById('pq')?.setAttribute('aria-activedescendant', row.id);
  });
  root.addEventListener('pointermove', e => {
    if (!skCur) return; const c = document.getElementById('sk-canvas'); if (!c) return;
    const r = c.getBoundingClientRect(), k = 1200 / r.width; let x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    if (e.shiftKey) { const dx = x - skCur.origin.x, dy = y - skCur.origin.y, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(dx, dy); x = skCur.origin.x + Math.cos(a) * d; y = skCur.origin.y + Math.sin(a) * d; }
    const L = skCur.last, dt = Math.max(1, performance.now() - L.t), dist = Math.hypot(x - L.x, y - L.y); if (dist < 1.5) return;
    const [, base, mode] = PENS[skCur.s.tool], speed = dist / dt; let w = base * S.sk.size;
    if (mode === 'speed') w *= Math.max(0.35, 1 - speed * 0.35);
    if (mode === 'angle') w *= 0.3 + 0.7 * Math.abs(Math.sin(Math.atan2(y - L.y, x - L.x) - Math.PI / 4));
    skCur.s.p.push([Math.round(x), Math.round(y), Math.round(w * 10) / 10]); skCur.last = { x, y, t: performance.now() };
    const ctx = c.getContext('2d'); skDraw(ctx, [{ ...skCur.s, p: skCur.s.p.slice(-2) }], c.width / 1200);
  });
  addEventListener('pointerup', () => { if (!skCur) return; S.sk.strokes.push(skCur.s); skCur = null; skRepaint(); skSave(); });
  function skSvg() {
    const segs = s => s.p.length === 1 ? `<circle cx="${s.p[0][0]}" cy="${s.p[0][1]}" r="${s.p[0][2] / 2}" fill="${s.tool === 'eraser' ? '#000' : s.color}"/>` : s.p.slice(1).map((p, i) => `<line x1="${s.p[i][0]}" y1="${s.p[i][1]}" x2="${p[0]}" y2="${p[1]}" stroke-width="${p[2]}"/>`).join('');
    let body = '', n = 0;
    for (const s of S.sk.strokes) {
      if (s.tool === 'eraser') { body = `<mask id="m${n}"><rect width="1200" height="750" fill="#fff"/><g stroke="#000" stroke-linecap="round">${segs(s)}</g></mask><g mask="url(#m${n})">${body}</g>`; n++; continue; }
      body += `<g stroke="${esc(s.color)}" stroke-linecap="${s.tool === 'marker' ? 'square' : 'round'}" opacity="${s.tool === 'highlighter' ? 0.35 : s.tool === 'pencil' ? 0.85 : 1}"${s.tool === 'highlighter' ? ' style="mix-blend-mode: multiply"' : ''}>${segs(s)}</g>`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">${S.sk.bg ? `<image href="${S.sk.bg}" width="1200" height="750" preserveAspectRatio="xMidYMid slice"/>` : ''}${body}</svg>\n`;
  }
  async function skAct(a, t) {
    const K = S.sk;
    switch (a) {
      case 'sk-tool': K.tool = t.dataset.t; break;
      case 'sk-min': K.min = !K.min; break;
      case 'sk-undo': if (K.strokes.length) { K.redo.push(K.strokes.pop()); skSave(); } break;
      case 'sk-redo': if (K.redo.length) { K.strokes.push(K.redo.pop()); skSave(); } break;
      case 'sk-clear': Kit.superConfirm({ title: `Clear ${K.strokes.length} strokes`, detail: 'Undo can bring them back while this window is open.', opener: t, onConfirm: () => { K.redo = K.strokes.reverse(); K.strokes = []; skSave(); render(); } }); return;
      case 'sk-svg': { const r = await api.saveFile('sketch.svg', skSvg()); if (r.ok) toast('Saved SVG'); return; }
      case 'sk-png': { const x = +t.dataset.x, c = document.createElement('canvas'); c.width = 1200 * x; c.height = 750 * x; const ctx = c.getContext('2d'); if (K.bg) { const img = new Image(); img.src = K.bg; await img.decode().catch(() => {}); const s = Math.max(c.width / img.width, c.height / img.height); ctx.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s); } const layer = document.createElement('canvas'); layer.width = c.width; layer.height = c.height; skDraw(layer.getContext('2d'), K.strokes, x); ctx.drawImage(layer, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const r = await api.saveFile(`sketch-${x}x.png`, new Uint8Array(await blob.arrayBuffer())); if (r.ok) toast(`Saved PNG at ${x}x`); return; }
    }
    render();
  }
  async function skBackground(file) {
    if (file.size > 1500000) { toast('Images up to 1.5 MB can be drawn on. Nothing changed.', 'err'); return; }
    const bytes = new Uint8Array(await file.arrayBuffer()), kind = Lib.imageKind(bytes); if (!kind) { toast('Only PNG, JPEG or WebP images. Nothing changed.', 'err'); return; }
    S.sk.bg = `data:image/${kind};base64,${Lib.b64encode(bytes)}`; skSave(); render();
  }
  document.addEventListener('keydown', e => {
    const tab = S.tabs.find(t => t.id === S.active); if (tab?.view !== 'sketch' || e.target.matches?.('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); skAct(e.shiftKey ? 'sk-redo' : 'sk-undo'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); skAct('sk-redo'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const hit = Object.entries(PENS).find(([, v]) => v[3].toLowerCase() === e.key.toLowerCase()); if (hit) { S.sk.tool = hit[0]; render(); }
  });

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
      <div class="field"><label for="tk-desc">Describe what happened</label><textarea id="tk-desc" data-tk="description" rows="3" maxlength="2000" >${esc(S.ticketDraft || '')}</textarea></div>
      <button class="btn fillb" data-act="tk-submit" style="align-self: flex-start">${ic('send')}Submit ticket</button>
      <span class="small" style="border-top: 1px solid var(--line); padding-top: 10px; color: var(--tx)">Nothing is sent anywhere. No ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading this.</span></div>
      <div class="card"><span class="h2">The only fix that works</span><span>Delete this app's data folder yourself. That removes every lock, along with your settings, history and these tickets.</span><span class="mono small" style="overflow-wrap: anywhere">${esc(S.appdata || '')}</span><div class="row" style="gap: 6px; flex-wrap: wrap"><button class="btn tonal" data-act="open-appdata">${ic('folder_open')}Open the app data folder</button><button class="btn text" data-act="copy-appdata">${ic('content_copy')}Copy path</button></div></div></div>
      <div class="side"><div class="row" style="gap: 6px"><label class="sr" for="tkq">Search tickets</label><input id="tkq" class="mono" data-input="ticketQ" value="${esc(q)}" placeholder="Search tickets" style="flex: 1; height: 36px"><button class="badge ${S.ticketRegex ? 'ac' : 'mute'} mono" style="border: 0; cursor: pointer" data-act="tk-regex" aria-pressed="${!!S.ticketRegex}">.*</button></div>
        <div class="row" style="gap: 6px"><button class="btn text" data-act="tk-export" ${tickets.length ? '' : 'disabled'}>${ic('download')}Export</button><button class="btn text" style="color: var(--err)" data-act="tk-clear" ${tickets.length ? '' : 'disabled'}>Remove all…</button></div>
        ${list.map(t => `<div class="card" style="gap: 6px"><div class="row"><span class="mono t" style="font-weight: 650">${esc(t.id)}</span><span class="badge ${ticketStatus(t).startsWith('Resolved') ? 'ok' : 'warn'}">${esc(ticketStatus(t))}</span></div><span class="small">${esc(t.category)} · Severity: ${esc(t.severity)}</span><span>${esc(t.description)}</span><span class="small" style="color: var(--tx)">“${esc(t.reply)}”</span></div>`).join('') || '<span class="small">No tickets yet.</span>'}</div></div>`);
  }

  // ---------- render ----------
  function vocabularize(node) {
    const v = S.settings?.vocabulary; if (!v || S.settings.school) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('.ms, .mono, input, textarea, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n; (n = walker.nextNode());) { const next = Lib.applyVocabulary(n.nodeValue, v); if (next !== n.nodeValue) n.nodeValue = next; }
  }
  function render() {
    if (!S.settings || (browser && !api.authenticated)) return;
    const focusId = document.activeElement?.id, caret = document.activeElement?.selectionStart, tabsLeft = root.querySelector('.tabs')?.scrollLeft || 0;
    const views = { setup: viewSetup, accounts: viewAccounts, deploys: viewDeploys, wizard: viewWizard, run: viewRun, result: viewResult, settings: viewSettings, help: viewHelp, history: viewHistory, changelog: viewChangelog, docs: viewDocs, support: viewSupport, tools: viewTools, servers: viewServers, ai: viewAi, sketch: viewSketch };
    const tab = S.tabs.find(t => t.id === S.active) || S.tabs[0];
    const v = tab.id === 'ws' ? S.view : tab.view;
    root.innerHTML = shell((views[v] || viewDeploys)(), { rail: v !== 'setup' }) + paletteHtml() + panelHtml() + dimsumHtml() + partyHtml();
    Kit.watchPanels(root, (id, box) => { const ui = S.settings.ui || { filtersOpen: {}, panels: {} }; api.setSetting('ui', { ...ui, panels: { ...ui.panels, [id]: box } }).then(r => r.ok && (S.settings.ui = r.value)); });
    if (S.view === 'settings' && S.settingsQuery) { const q = S.settingsQuery.toLowerCase(); root.querySelectorAll('[data-search]').forEach(el => { el.hidden = !el.dataset.search.toLowerCase().includes(q); }); }
    vocabularize(root);
    decorateLocks();
    keepTabInView(tabsLeft);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch { } } }
  }
  // A re-render rebuilds the tab strip, so restore where it was scrolled and nudge the active tab into view.
  function keepTabInView(left) {
    const strip = root.querySelector('.tabs'); if (!strip) return;
    strip.scrollLeft = left;
    const on = strip.querySelector('.tab.on'); if (!on) return;
    // 36 px clears the 32 px edge fade, so the active tab is never drawn faded.
    if (on.offsetLeft - 36 < strip.scrollLeft) strip.scrollLeft = on.offsetLeft - 36;
    else if (on.offsetLeft + on.offsetWidth + 36 > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = on.offsetLeft + on.offsetWidth - strip.clientWidth + 36;
    tabFade(strip);
  }
  function tabFade(strip) { const max = strip.scrollWidth - strip.clientWidth; strip.classList.toggle('more-l', strip.scrollLeft > 1); strip.classList.toggle('more-r', strip.scrollLeft < max - 1); }
  // Navigation crossfades the main area with a View Transition; reduced motion, calm mode and captures switch instantly.
  const motionOk = () => !(window.__capturing || S.settings?.reduceMotion || S.settings?.calm || matchMedia('(prefers-reduced-motion: reduce)').matches);
  function withTransition(fn) { if (document.startViewTransition && motionOk()) document.startViewTransition(fn); else fn(); }
  function go(view) { if (guard('go:' + view)) return; withTransition(() => { S.view = view; S.active = 'ws'; S.palette = null; if (['history', 'changelog', 'docs'].includes(view)) ensureData(view); render(); document.getElementById('main')?.focus?.(); }); }
  window.__ready = () => !!S.prereq && S.profiles !== null;
  window.__go = v => {
    if (v === 'palette') { S.palette = { q: 'dep', regex: false, sel: 0 }; render(); return; }
    if (v === 'a11y') { go('deploys'); openPanel('a11y'); return; }
    if (v === 'info') { go('settings'); openPanel('info:funnyLevels'); return; }
    if (v === 'tabs') { go('deploys'); ['history', 'docs', 'changelog'].forEach(x => { ensureData(x); openTab(x); }); S.active = S.tabs[1].id; render(); return; }
    if (v === 'export') { go('history'); openPanel('export:history'); return; }
    if (v === 'lockwiz') { go('deploys'); openLockWizard({ key: 'go:settings', label: 'Settings' }); S.lockWiz.policy = 'pin+totp'; api.lockTotp('Settings').then(x => { S.lockWiz.totp = x; S.lockWiz.pin = '2468'; render(); }); return; }
    if (v === 'unlock') { go('deploys'); S.capLock = 'go:help'; api.lockCreate('go:help', { label: 'Help', policy: 'pin', pin: '2468' }).then(async () => { await refreshLocks(); render(); openUnlock({ key: 'go:help', label: 'Help' }); S.unlock.pin = '24'; render(); }); return; }
    if (v === 'school') { go('settings'); S.schoolForm = null; openPanel('school'); return; }
    if (v === 'colour') { go('settings'); openColour(); S.colour.a = 0.8; S.colour.text = pickerHex(); render(); return; }
    if (v === 'schedules') { go('settings'); S.capSchedules = true; S.settings.schedules = [{ key: 'theme', value: 'dark', at: '19:00', days: [0, 1, 2, 3, 4, 5, 6] }, { key: 'calm', value: true, at: '22:00', days: [1, 2, 3, 4, 5] }]; applyOverlays(); applyAppearance(); render(); setTimeout(() => scrollToEl('schedules'), 50); return; }
    if (v === 'servers') { go('deploys'); openTab('servers'); return; }
    if (v === 'ai') { go('deploys'); openTab('ai'); return; }
    if (v === 'sketch') { go('deploys'); skLoad(); S.sk.strokes = [{ tool: 'pen', color: '#6ea8ff', p: Array.from({ length: 60 }, (_, i) => [100 + i * 15, 400 + Math.round(Math.sin(i / 6) * 160), 3 + (i % 10) / 4]) }, { tool: 'highlighter', color: '#f5b451', p: [[200, 200, 18], [700, 200, 18]] }, { tool: 'fountain', color: '#4ade9a', p: Array.from({ length: 40 }, (_, i) => [300 + Math.cos(i / 6) * 200, 380 + Math.sin(i / 6) * 200, 2 + 5 * Math.abs(Math.sin(i / 6 - 0.8))]) }, { tool: 'eraser', color: '#000', p: [[500, 380, 40], [620, 380, 40]] }]; openTab('sketch'); return; }
    if (v === 'tools') { go('deploys'); ensureData('tools'); openTab('tools'); S.tools.b64in = 'hello, har gow'; S.tools.b64out = { ok: true, text: Lib.b64encode('hello, har gow') }; S.tools.conv = { name: 'menu.yaml', text: 'x', note: '' }; render(); return; }
    if (v === 'party') { S.active = 'ws'; go('deploys'); celebrate('42 words applied'); return; }
    if (v === 'appearance') { go('deploys'); S.capAppearance = apData(); openAppearance({ key: 'go:accounts', label: 'Accounts' }); apSet('weight', 750); apSet('glow', 12); apSet('radius', 18); apSet('underline', true); render(); return; }
    if (v === 'support') { go('support'); S.ticketDraft = 'I locked Settings with a PIN and forgot it.'; render(); return; }
    const row = () => document.querySelector('[data-menu="deploy"]');
    if (v === 'menu') { go('deploys'); let r = row(); if (!r) { go('settings'); r = document.querySelector('[data-menu="setting"][data-key="theme"]'); } if (r) { const b = r.getBoundingClientRect(); Kit.openMenu(menuFor(r), { x: b.left + Math.min(240, b.width / 2), y: b.top + 20, opener: r }); } return; }
    if (v === 'confirm') { go('deploys'); const r = row(); if (r) { removeRecords([r.dataset.at], r); return; } __goInner('sketch'); const b = document.querySelector('[data-act="sk-clear"]'); if (b) skAct('sk-clear', b); return; }
    S.panel = null; Kit.closeMenu(false); go(v);
  };
  const __goInner = window.__go;
  // Captures leave nothing behind: undo the capture-only style, lock and schedule before the next screen.
  window.__go = v => {
    // Close an open confirmation through the kit, so its state ends too (removing only the element left keys blocked).
    window.__capturing = true; S.panel = null; S.ap = null; Kit.closeMenu(false); Kit.closeConfirm(false);
    if (S.capAppearance !== undefined) { apCommit(S.capAppearance, { record: false }); S.capAppearance = undefined; }
    if (S.capSchedules) { S.capSchedules = false; S.settings.schedules = []; applyOverlays(); applyAppearance(); }
    if (S.capLock) { const k = S.capLock; S.capLock = null; S.unlocked = {}; api.lockRemove(k, { pin: '2468' }).then(() => refreshLocks()).then(() => render()); }
    __goInner(v);
  };

  // The every-surface sweep (scripts/sweep) sets theme and language through the real settings path before each pass.
  window.__sweepPrep = async ({ theme, language }) => { S.tabs = [{ id: 'ws' }]; S.active = 'ws'; await set('theme', theme); if (!S.settings.school) await set('language', language); window.__capturing = true; };

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-go],[data-act],[data-win],[data-toggle],[data-set],[data-cmd],[data-panel-open],[data-info],[data-a11y],[data-tab-go],[data-tab-close],[data-doc-open],[data-doc]');
    if (!t) return;
    if (t.dataset.stop && e.target === t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.tabGo) return selectTab(t.dataset.tabGo);
    if (t.dataset.tabClose) return closeTabs([t.dataset.tabClose]);
    if (t.dataset.docOpen || t.dataset.doc) { e.preventDefault(); S.docF.id = t.dataset.docOpen || t.dataset.doc; render(); return; }
    if (t.dataset.panelOpen) return S.panel?.id === t.dataset.panelOpen ? closePanel() : openPanel(t.dataset.panelOpen, `[data-panel-open="${t.dataset.panelOpen}"]`);
    if (t.dataset.info) return openPanel('info:' + t.dataset.info, t.id ? '#' + t.id : `[data-info="${t.dataset.info}"]`);
    if (t.dataset.a11y) return setA11y({ [t.dataset.a11y]: !S.settings.a11y[t.dataset.a11y] });
    if (t.dataset.win) { const r = await api.window(t.dataset.win); S.maximized = r.maximized; return; }
    if (t.dataset.toggle) return set(t.dataset.toggle, !S.settings[t.dataset.toggle]);
    if (t.dataset.set) return set(t.dataset.set, t.dataset.val);
    if (t.dataset.cmd) { const c = COMMANDS.find(x => x.id === t.dataset.cmd); S.palette = null; render(); return c?.run(); }
    const a = t.dataset.act;
    if (a?.startsWith('ap-')) return apAction(a, t);
    if (a?.startsWith('mc-')) return mcAct(a, t);
    if (a?.startsWith('ai-')) return aiAct(a, t);
    if (a?.startsWith('sk-')) return skAct(a, t);
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
      case 'school-open': S.schoolForm = null; openPanel('school'); break;
      case 'school-kind': S.schoolForm.kind = t.dataset.k; S.schoolForm.value = ''; S.schoolForm.value2 = ''; render(); break;
      case 'school-rename': { const r = await api.schoolRename(S.schoolForm.name); if (!r.ok) { S.schoolForm.error = 'Use 1 to 40 characters, no angle brackets.'; render(); break; } S.schoolState = r; toast(`Renamed to ${r.name}`); render(); break; }
      case 'school-on': { const F = S.schoolForm; if (!S.schoolState.hasCredential && F.value !== F.value2) { F.error = 'The two entries differ.'; render(); break; } const r = await api.schoolEnable(S.schoolState.hasCredential ? null : { kind: F.kind, value: F.value }); if (!r.ok) { F.error = r.error === 'CREDENTIAL_NEEDED' ? (F.kind === 'pin' ? 'A PIN is 4 to 12 digits.' : 'A password is 6 to 200 characters.') : r.error; render(); break; } S.schoolState = r; S.schoolForm = null; S.panel = null; applyOverlays(); applyAppearance(); toast(`${r.name} is on`); render(); break; }
      case 'school-off': { const r = await api.schoolDisable(S.schoolForm.value); if (!r.ok) { S.schoolForm.error = r.error === 'WAIT' ? `Too many tries. Wait about ${Math.ceil(r.waitMs / 60000)} min.` : `That did not match.${r.attemptsBeforeWait ? ` ${r.attemptsBeforeWait} more tries before a wait.` : ''}`; S.schoolForm.value = ''; render(); break; } S.schoolState = r; S.schoolForm = null; S.panel = null; applyOverlays(); applyAppearance(); toast(`${r.name} is off. Your choices are back.`); render(); break; }
      case 'sch-day': { const F = S.schedForm, d = +t.dataset.d; F.days = F.days.includes(d) ? F.days.filter(x => x !== d) : [...F.days, d].sort(); render(); break; }
      case 'sch-add': { const F = S.schedForm, rule = { key: F.key, value: Lib.SCHEDULABLE[F.key].colour ? Lib.parseColor(String(F.value)) : F.value, at: F.at, days: F.days }; if (!Lib.validRule(rule)) { toast('That rule is not complete: pick a value, a time and at least one day.', 'err'); break; } await set('schedules', [...(S.settings.schedules || []), rule]); applyOverlays(); applyAppearance(); render(); break; }
      case 'sch-del': { const list = [...S.settings.schedules]; list.splice(+t.dataset.i, 1); await set('schedules', list); applyOverlays(); applyAppearance(); render(); break; }
      case 'ext-toggle': await set('externalSource', { ...S.settings.externalSource, enabled: !S.settings.externalSource.enabled }); scheduleExternal(); applyOverlays(); applyAppearance(); render(); break;
      case 'ext-save': { const url = root.querySelector('[data-ext="url"]').value.trim(), mapKey = root.querySelector('[data-ext="mapKey"]').value, token = root.querySelector('[data-ext="token"]').value; if (url && !/^https?:\/\//.test(url)) { toast('Use an http or https address', 'err'); break; } if (token) { const r = await api.externalToken(token); if (!r.ok) { toast('The token could not be stored: ' + r.error.toLowerCase().replace(/_/g, ' '), 'err'); break; } } await set('externalSource', { ...S.settings.externalSource, url, mapKey }); scheduleExternal(); toast('External source saved'); break; }
      case 'ext-now': await pollExternal(); render(); break;
      case 'pick-accent': openColour(); break;
      case 'cp-apply': { const hex = Lib.parseColor(S.colour.text) || pickerHex(); S.panel = null; await set('rainbow', false); await set('accent', hex); break; }
      case 'install-tool': { const tool = t.dataset.tool; startJob('install-' + tool, api.install([tool]), `Installing ${{ ffmpeg: 'FFmpeg', sevenzip: '7-Zip', java: 'Java 21', ollama: 'Ollama' }[tool]}`); break; }
      case 'media-go': { const p = await api.mediaPick('media'); if (!p.ok) break; startJob('media', api.mediaConvert(p.paths[0], S.mediaPreset || 'mp4'), MEDIA_PRESETS[S.mediaPreset || 'mp4']); break; }
      case 'archive-make': { const p = await api.mediaPick('any'); if (!p.ok) break; startJob('archive', api.archiveCreate(p.paths), `Making a .7z of ${p.paths.length} file${p.paths.length === 1 ? '' : 's'}`); break; }
      case 'archive-open': { const p = await api.mediaPick('archive'); if (!p.ok) break; startJob('archive', api.archiveExtract(p.paths[0]), 'Extracting the archive'); break; }
      case 'show-file': api.showFile(t.dataset.p); break;
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
    if (el.dataset.sf) { const m = { 'sf-value': 'value', 'sf-value2': 'value2', 'sf-name': 'name' }[el.dataset.sf]; S.schoolForm[m] = el.value; return; }
    if (el.dataset.cp) { const C = S.colour; if (el.dataset.cp === 'text') { C.text = el.value; const hx = Lib.parseColor(el.value); if (hx) { Object.assign(C, Lib.hexToHsv(hx), { a: Lib.rgba(hx).a }); } } else { if (el.dataset.cp === 'h') C.h = +el.value; else C.a = +el.value / 100; C.text = pickerHex(); } render(); return; }
    if (el.dataset.input === 'mediaPreset') { S.mediaPreset = el.value; return; }
    if (el.dataset.mcf && el.type !== 'checkbox' && el.tagName !== 'SELECT') { const k = el.dataset.mcf; S.mc.form[k] = ['port', 'memoryMb'].includes(k) ? +el.value : el.value; if (k === 'memoryMb') { const lb = el.previousElementSibling; if (lb) lb.textContent = `Memory: ${el.value} MB`; } return; }
    const mi = { mcVq: v => { S.mc.form.vq = v; render(); }, mcCmd: v => (S.mc.cmd = v), mcPlayer: v => (S.mc.player = v), aiQ: v => { S.ai.q = v; render(); }, aiSystem: v => (S.ai.system = v), aiInput: v => (S.ai.input = v), aiTemp: v => { S.ai.temperature = +v; }, skColor: v => (S.sk.color = v), skSize: v => (S.sk.size = +v) }[el.dataset.input];
    if (mi) { mi(el.value); return; }
    if (el.dataset.mcprop) { const d = S.mc.props.descriptors[el.dataset.mcprop]; S.mc.propEdits[el.dataset.mcprop] = d.type === 'int' ? parseInt(el.value, 10) : el.value; const b = root.querySelector('[data-act="mc-save-props"]'); if (b) b.disabled = false; return; }
    if (el.dataset.mcareaN) { const v = parseInt(el.value, 10); if (Number.isInteger(v)) { S.mc.area[el.dataset.mcareaN] = ['w', 'h'].includes(el.dataset.mcareaN) ? Math.max(1, Math.min(1000, v)) : v; } return; }
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
    if (el.dataset.sch) { const F = S.schedForm; if (el.dataset.sch === 'key') { F.key = el.value; const d = Lib.SCHEDULABLE[F.key]; F.value = d.values ? d.values[0][0] : ''; render(); } else if (el.dataset.sch === 'value') F.value = el.tagName === 'SELECT' ? JSON.parse(el.value) : el.value; else F.at = el.value; }
    if (el.dataset.voice) set('voices', { ...S.settings.voices, [el.dataset.voice]: el.value });
    if (el.dataset.file === 'logo' && el.files[0]) logoUpload(el.files[0]);
    if (el.dataset.input === 'logoBg') { const c = Lib.parseColor(el.value); if (c) set('logo', { ...logo(), bg: c }); }
    if (el.dataset.b64file && el.files[0]) b64File(el.files[0]);
    if (el.dataset.convfile && el.files[0]) convertFile(el.dataset.convfile, el.files[0]);
    if (el.dataset.dep) { el.checked ? S.depSel.add(el.dataset.dep) : S.depSel.delete(el.dataset.dep); render(); }
    if (el.dataset.note) { el.checked ? S.noteSel.add(el.dataset.note) : S.noteSel.delete(el.dataset.note); render(); }
    if (el.dataset.file === 'vocab' && el.files[0]) applyVocabFile(el.files[0]);
    if (el.dataset.file === 'style' && el.files[0]) apImport(el.files[0]);
    if (el.dataset.file === 'skbg' && el.files[0]) skBackground(el.files[0]);
    if (el.dataset.mcf && (el.type === 'checkbox' || el.tagName === 'SELECT')) { const k = el.dataset.mcf; S.mc.form[k] = el.type === 'checkbox' ? el.checked : el.value; render(); }
    if (el.dataset.input === 'aiModel') { S.ai.model = el.value; }
    if (el.dataset.mcareaN) render();
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
    if (S.palette && e.key === 'Tab') { e.preventDefault(); const pq = document.getElementById('pq'); (document.activeElement === pq ? document.querySelector('.dialog [data-act="regex"]') : pq)?.focus(); return; }
    if (S.palette && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
      e.preventDefault(); const P = S.palette;
      if (e.key === 'Enter') { const c = P.items?.[P.sel]; S.palette = null; render(); c?.run(); return; }
      P.sel = Math.max(0, Math.min((P.items?.length || 1) - 1, P.sel + (e.key === 'ArrowDown' ? 1 : -1))); render(); document.getElementById('pq')?.focus(); document.getElementById('pal-o-' + P.sel)?.scrollIntoView({ block: 'nearest' }); return;
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
    S.schoolState = (await api.schoolState?.()) || { enabled: false, name: 'School mode' }; applyOverlays(); scheduleExternal();
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
    if (ds.ok && ds.show && !S.run && !S.settings.school) { S.dimsum = ds.dish; render(); setTimeout(() => { S.dimsum = null; render(); }, 7000); }
  })();
})();
