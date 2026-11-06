'use strict';
const { spawn } = require('node:child_process');

function createRunner(spawnProcess = spawn) {
  return function run(command, args, { signal, timeoutMs = 30000, maxBytes = 1024 * 1024, stdin, cwd } = {}) {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve({ ok: false, error: 'CANCELLED' });
      let child;
      try { child = spawnProcess(command, args, { shell: false, windowsHide: true, cwd, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }); }
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
      child.on('close', (code) => {
        let error = 'COMMAND_FAILED';
        if (command === 'aws') {
          if (/AccessDenied|UnauthorizedOperation|not authorized to perform/i.test(stderr)) error = 'AWS_PERMISSION_DENIED';
          else if (/ExpiredToken|InvalidClientTokenId|SSO session.*expired|Token has expired/i.test(stderr)) error = 'AWS_LOGIN_REQUIRED';
          else if (/ThrottlingException|RequestLimitExceeded|TooManyRequestsException/i.test(stderr)) error = 'AWS_THROTTLED';
          else if (/ServiceUnavailable|InternalFailure|InternalServerError/i.test(stderr)) error = 'AWS_TRANSIENT';
          else if (/RepositoryAlreadyExistsException/i.test(stderr)) error = 'ECR_REPOSITORY_EXISTS';
          else if (args[0] === 'ecr' && /RepositoryNotFoundException/i.test(stderr)) error = 'ECR_REPOSITORY_NOT_FOUND';
          else if (args[0] === 'cloudformation' && args[1] === 'describe-stacks' && /\(ValidationError\)/.test(stderr) && /Stack with id [^\r\n]+ does not exist/.test(stderr)) error = 'STACK_NOT_FOUND';
          else if (/OptInRequired|SubscriptionRequired|account.*(?:suspended|not.*verified)/i.test(stderr)) error = 'AWS_ACCOUNT_SETUP_REQUIRED';
        }
        finish(code === 0 ? { ok: true, stdout, stderr } : { ok: false, error, exitCode: Number.isInteger(code) ? code : null });
      });
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => { if (!settled) stop('TIMEOUT'); }, timeoutMs);
      if (stdin !== undefined) {
        child.stdin.on('error', () => {}); // EPIPE is reported through process failure.
        child.stdin.end(stdin);
      }
      if (signal?.aborted) cancel();
    });
  };
}
module.exports = { createRunner };
