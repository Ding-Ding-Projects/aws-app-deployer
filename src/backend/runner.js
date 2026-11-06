'use strict';
const { spawn } = require('node:child_process');

function createRunner(spawnProcess = spawn) {
  return function run(command, args, { signal, timeoutMs = 30000, maxBytes = 1024 * 1024 } = {}) {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve({ ok: false, error: 'CANCELLED' });
      let child;
      try { child = spawnProcess(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch { return resolve({ ok: false, error: 'UNAVAILABLE' }); }
      let settled = false, bytes = 0, stdout = '', stderr = '', timer, killTimer;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); clearTimeout(killTimer);
        signal?.removeEventListener('abort', cancel);
        resolve(result);
      };
      const stop = (error) => {
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 500);
        killTimer.unref?.();
        // Keep the forced termination scheduled even after returning a bounded result.
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
        resolve({ ok: false, error });
      };
      const cancel = () => { if (!settled) stop('CANCELLED'); };
      const collect = (kind) => (chunk) => {
        if (settled) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > maxBytes) return stop('OUTPUT_LIMIT');
        if (kind === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
      };
      child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
      child.on('error', () => finish({ ok: false, error: 'UNAVAILABLE' }));
      child.on('close', (code) => finish(code === 0 ? { ok: true, stdout, stderr } : { ok: false, error: 'COMMAND_FAILED', exitCode: Number.isInteger(code) ? code : null }));
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => { if (!settled) stop('TIMEOUT'); }, timeoutMs);
      if (signal?.aborted) cancel();
    });
  };
}
module.exports = { createRunner };
