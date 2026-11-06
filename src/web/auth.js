'use strict';
const crypto = require('node:crypto');
function equal(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function isolatedEnv(root, inherited = process.env) {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'AWS_CA_BUNDLE', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) if (inherited[key]) env[key] = inherited[key];
  return { ...env, HOME: root, USERPROFILE: root, AWS_CONFIG_FILE: `${root}/.aws/config`, AWS_SHARED_CREDENTIALS_FILE: `${root}/.aws/credentials`, AWS_EC2_METADATA_DISABLED: 'true', AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off', DOCKER_CONFIG: `${root}/.docker` };
}
function validLoginUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && /^(?:(?:[a-z]{2}(?:-[a-z]+)+-\d|\d{12})\.)?signin\.aws\.amazon\.com$/.test(u.hostname) && u.pathname === '/v1/authorize'; } catch { return false; }
}
module.exports = { equal, isolatedEnv, validLoginUrl };
