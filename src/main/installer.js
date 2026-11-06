'use strict';
// One-click dependency installer for Windows. Installs AWS CLI v2 and Docker Desktop from their
// publishers, verifies Authenticode signatures before running anything it downloaded, and repairs
// the common failures automatically. It never answers the Windows permission (UAC) prompt: that
// prompt belongs to the user, and declining it is reported as ELEVATION_DECLINED.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const TOOLS = {
  aws: {
    name: 'AWS CLI v2',
    winget: 'Amazon.AWSCLI',
    url: 'https://awscli.amazonaws.com/AWSCLIV2.msi',
    file: 'AWSCLIV2.msi',
    signer: /Amazon(\.com)?/i,
    install: file => ['msiexec', ['/i', file, '/qn', '/norestart']],
  },
  docker: {
    name: 'Docker Desktop',
    winget: 'Docker.DockerDesktop',
    url: 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe',
    file: 'DockerDesktopInstaller.exe',
    signer: /Docker Inc/i,
    install: file => [file, ['install', '--quiet', '--accept-license', '--backend=wsl-2']],
  },
};
const DOWNLOAD_HOSTS = new Set(['awscli.amazonaws.com', 'desktop.docker.com']);
// Windows Installer and UAC exit codes that mean the user or a policy stopped the install.
const DECLINED = new Set([1223, 1602]);
const POLICY = new Set([1625, 1260, 1643]);
const REBOOT = new Set([3010, 1641]);

function classify(result) {
  if (result.ok) return null;
  if (DECLINED.has(result.exitCode)) return 'ELEVATION_DECLINED';
  if (POLICY.has(result.exitCode)) return 'POLICY_BLOCKED';
  if (REBOOT.has(result.exitCode)) return 'REBOOT_REQUIRED';
  return result.error || 'INSTALL_FAILED';
}

function createInstaller({ run, fetchUrl = globalThis.fetch, platform = process.platform, env = process.env, pause = sleep, tempDir = os.tmpdir(), exists = p => fs.existsSync(p) } = {}) {
  const ps = (script, options) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], options);

  async function hasWinget(options) {
    const r = await run('winget', ['--version'], { ...options, timeoutMs: 20000 });
    return r.ok;
  }

  async function refreshPath(options) {
    const r = await ps("[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')", options);
    if (r.ok && r.stdout.trim()) env.Path = env.PATH = r.stdout.trim();
    return r.ok;
  }

  async function download(tool, { signal, onProgress }) {
    const url = new URL(tool.url);
    if (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(url.hostname)) return { ok: false, error: 'UNTRUSTED_SOURCE' };
    const target = path.join(tempDir, `aws-app-deployer-${tool.file}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const have = exists(target) ? (await fsp.stat(target)).size : 0;
        const response = await fetchUrl(tool.url, { signal, headers: have ? { Range: `bytes=${have}-` } : {} });
        if (!response.ok && response.status !== 206) throw new Error('HTTP ' + response.status);
        const append = response.status === 206;
        const total = Number(response.headers.get('content-length') || 0) + (append ? have : 0);
        const out = fs.createWriteStream(target, { flags: append ? 'a' : 'w' });
        let done = append ? have : 0;
        try {
          for await (const chunk of response.body) {
            if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
            done += chunk.length;
            onProgress?.({ step: 'download', done, total });
          }
        } finally { await new Promise(r => out.end(r)); }
        return { ok: true, file: target };
      } catch (error) {
        if (signal?.aborted) return { ok: false, error: 'CANCELLED' };
        onProgress?.({ step: 'repair', repair: 'download-retry', attempt: attempt + 1 });
        await pause(2000 * (attempt + 1));
      }
    }
    return { ok: false, error: 'DOWNLOAD_FAILED' };
  }

  async function verifySignature(tool, file, options) {
    const quoted = file.replace(/'/g, "''");
    const r = await ps(`$s = Get-AuthenticodeSignature -LiteralPath '${quoted}'; @{ status = [string]$s.Status; subject = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress`, options);
    if (!r.ok) return { ok: false, error: 'SIGNATURE_CHECK_FAILED' };
    try {
      const v = JSON.parse(r.stdout);
      return v.status === 'Valid' && tool.signer.test(v.subject) ? { ok: true, subject: v.subject } : { ok: false, error: 'SIGNATURE_INVALID' };
    } catch { return { ok: false, error: 'SIGNATURE_CHECK_FAILED' }; }
  }

  async function ensureWsl(options, onProgress) {
    const status = await run('wsl.exe', ['--status'], { ...options, timeoutMs: 30000 });
    if (status.ok) return { ok: true };
    onProgress?.({ step: 'repair', repair: 'wsl-enable' });
    const install = await run('wsl.exe', ['--install', '--no-distribution'], { ...options, timeoutMs: 600000 });
    const code = classify(install);
    if (code && code !== 'REBOOT_REQUIRED') return { ok: false, error: code };
    await run('wsl.exe', ['--update'], { ...options, timeoutMs: 600000 });
    return { ok: true, rebootRequired: code === 'REBOOT_REQUIRED' };
  }

  async function startDocker(options, onProgress) {
    const exe = path.join(env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe');
    if (!(await run('docker', ['info', '--format', '{{json .ServerVersion}}'], { ...options, timeoutMs: 20000 })).ok) {
      onProgress?.({ step: 'repair', repair: 'docker-start' });
      if (exists(exe)) await ps(`Start-Process -FilePath '${exe.replace(/'/g, "''")}'`, options);
      for (let i = 0; i < 40; i++) {
        if (options.signal?.aborted) return { ok: false, error: 'CANCELLED' };
        await pause(3000);
        if ((await run('docker', ['info', '--format', '{{json .ServerVersion}}'], { ...options, timeoutMs: 20000 })).ok) return { ok: true };
      }
      return { ok: false, error: 'DOCKER_NOT_RUNNING' };
    }
    return { ok: true };
  }

  async function installOne(key, { signal, onProgress } = {}) {
    const tool = TOOLS[key];
    if (!tool) return { ok: false, error: 'INVALID_INPUT' };
    if (platform !== 'win32') return { ok: false, error: 'UNSUPPORTED_PLATFORM' };
    const options = { signal };
    let rebootRequired = false;
    if (key === 'docker') {
      const wsl = await ensureWsl(options, onProgress);
      if (!wsl.ok) return { ...wsl, tool: key };
      rebootRequired = !!wsl.rebootRequired;
    }
    let installed = false;
    if (await hasWinget(options)) {
      for (let attempt = 0; attempt < 2 && !installed; attempt++) {
        onProgress?.({ step: 'install', via: 'winget', attempt: attempt + 1 });
        const r = await run('winget', ['install', '--id', tool.winget, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { signal, timeoutMs: 1800000 });
        const code = classify(r);
        if (!code || code === 'REBOOT_REQUIRED') { installed = true; rebootRequired ||= code === 'REBOOT_REQUIRED'; }
        else if (code === 'ELEVATION_DECLINED' || code === 'POLICY_BLOCKED' || code === 'CANCELLED') return { ok: false, error: code, tool: key };
        else onProgress?.({ step: 'repair', repair: 'winget-retry' });
      }
      if (!installed) onProgress?.({ step: 'repair', repair: 'publisher-installer' });
    } else onProgress?.({ step: 'repair', repair: 'publisher-installer' });
    if (!installed) {
      const file = await download(tool, { signal, onProgress });
      if (!file.ok) return { ...file, tool: key };
      onProgress?.({ step: 'verify' });
      const sig = await verifySignature(tool, file.file, options);
      if (!sig.ok) { await fsp.rm(file.file, { force: true }).catch(() => {}); return { ...sig, tool: key }; }
      onProgress?.({ step: 'install', via: 'publisher' });
      const [cmd, args] = tool.install(file.file);
      const r = await run(cmd, args, { signal, timeoutMs: 1800000 });
      const code = classify(r);
      if (code && code !== 'REBOOT_REQUIRED') return { ok: false, error: code, tool: key };
      rebootRequired ||= code === 'REBOOT_REQUIRED';
      await fsp.rm(file.file, { force: true }).catch(() => {});
    }
    onProgress?.({ step: 'repair', repair: 'path-refresh' });
    await refreshPath(options);
    if (key === 'docker' && !rebootRequired) {
      const started = await startDocker(options, onProgress);
      if (!started.ok) return { ...started, tool: key };
    }
    onProgress?.({ step: 'done' });
    return { ok: true, tool: key, rebootRequired };
  }

  async function installMissing(missing, { signal, onProgress } = {}) {
    const results = [];
    for (const key of missing) {
      const result = await installOne(key, { signal, onProgress: p => onProgress?.({ tool: key, ...p }) });
      results.push(result);
      if (result.error === 'CANCELLED') break;
    }
    return { ok: results.every(r => r.ok), results };
  }

  return { installOne, installMissing, hasWinget };
}

module.exports = { createInstaller, TOOLS, classify };
