'use strict';
const { createRunner } = require('./runner');
const { buildTemplate } = require('./template');
const validProfile = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/.test(value);
const validRegion = (value) => typeof value === 'string' && /^[a-z]{2}(?:-[a-z]+)+-\d$/.test(value);
const invalid = () => ({ ok: false, error: 'INVALID_INPUT' });
function createBackend({ run = createRunner() } = {}) {
  async function aws(args, options) { return run('aws', args, options); }
  async function profiles(options) {
    const result = await aws(['configure', 'list-profiles'], options);
    if (!result.ok) return result;
    const values = [...new Set(result.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
    return values.every(validProfile) ? { ok: true, profiles: values } : { ok: false, error: 'INVALID_RESPONSE' };
  }
  async function profileRegion(profile, options) {
    if (!validProfile(profile)) return invalid();
    const result = await aws(['configure', 'get', 'region', '--profile', profile], options);
    if (!result.ok) return result;
    const region = result.stdout.trim();
    return validRegion(region) ? { ok: true, region } : { ok: false, error: 'REGION_REQUIRED' };
  }
  async function identity({ profile, region } = {}, options) {
    if (!validProfile(profile) || !validRegion(region)) return invalid();
    const result = await aws(['sts', 'get-caller-identity', '--profile', profile, '--region', region, '--output', 'json', '--no-cli-pager'], options);
    if (!result.ok) return result;
    try {
      const value = JSON.parse(result.stdout);
      if (!/^\d{12}$/.test(value.Account) || typeof value.Arn !== 'string' || !/^arn:[a-z-]+:(?:iam|sts)::\d{12}:.+$/.test(value.Arn) || value.Arn.split(':')[4] !== value.Account || typeof value.UserId !== 'string' || !value.UserId) throw Error();
      return { ok: true, identity: { accountId: value.Account, arn: value.Arn, userId: value.UserId, profile, region } };
    } catch { return { ok: false, error: 'INVALID_IDENTITY' }; }
  }
  async function login(selection, options = {}) {
    if (!validProfile(selection?.profile) || !validRegion(selection?.region)) return invalid();
    const result = await aws(['sso', 'login', '--profile', selection.profile], { ...options, timeoutMs: 300000 });
    return result.ok ? identity(selection, options) : result;
  }
  async function verifyDeployment(selection, expectedIdentity, options) {
    if (!expectedIdentity || !/^\d{12}$/.test(expectedIdentity.accountId) || !expectedIdentity.arn) return invalid();
    const result = await identity(selection || {}, options);
    if (!result.ok) return result;
    return result.identity.accountId === expectedIdentity.accountId && result.identity.arn === expectedIdentity.arn && result.identity.profile === expectedIdentity.profile && result.identity.region === expectedIdentity.region
      ? result : { ok: false, error: 'IDENTITY_CHANGED' };
  }
  async function prerequisites(options) {
    const [awsVersion, dockerVersion, dockerEngine] = await Promise.all([
      aws(['--version'], options), run('docker', ['--version'], options), run('docker', ['info', '--format', '{{json .ServerVersion}}'], options),
    ]);
    return { ok: true, aws: { available: awsVersion.ok && /aws-cli\/2\./.test(awsVersion.stdout + awsVersion.stderr), error: awsVersion.ok ? null : awsVersion.error }, docker: { available: dockerVersion.ok, running: dockerEngine.ok, error: dockerEngine.ok ? null : dockerEngine.error } };
  }
  return { profiles, profileRegion, identity, login, verifyDeployment, prerequisites };
}
module.exports = { createBackend, createRunner, buildTemplate, validProfile, validRegion };
