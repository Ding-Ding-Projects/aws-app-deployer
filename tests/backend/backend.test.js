'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBackend, createRunner, buildTemplate } = require('../../src/backend');
const selection = { profile: 'developer', region: 'us-east-1' };
const caller = { Account: '123456789012', Arn: 'arn:aws:sts::123456789012:assumed-role/Developer/session', UserId: 'ABC:session' };
test('login uses CLI browser default and verifies explicit identity after completion', async () => {
  const calls = [];
  const api = createBackend({ run: async (command, args) => { calls.push([command, args]); return { ok: true, stdout: JSON.stringify(caller) }; } });
  const result = await api.login(selection);
  assert.equal(result.identity.accountId, caller.Account);
  assert.deepEqual(calls[0], ['aws', ['sso', 'login', '--profile', 'developer']]);
  assert.deepEqual(calls[1][1], ['sts', 'get-caller-identity', '--profile', 'developer', '--region', 'us-east-1', '--output', 'json', '--no-cli-pager']);
  assert.equal((await api.verifyDeployment(selection, { ...result.identity, accountId: '999999999999' })).error, 'IDENTITY_CHANGED');
});
test('reject invalid or ambiguous selection before invoking process', async () => {
  const api = createBackend({ run: () => { throw Error('must not run'); } });
  assert.equal((await api.identity()).error, 'INVALID_INPUT');
  assert.equal((await api.login({ profile: '--endpoint-url', region: 'us-east-1' })).error, 'INVALID_INPUT');
  assert.equal((await api.verifyDeployment(selection)).error, 'INVALID_INPUT');
});
function processStub() {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kills = []; child.kill = s => child.kills.push(s); return child;
}
test('runner uses no shell and sanitizes command failure', async () => {
  const child = processStub();
  const run = createRunner((command, args, options) => { assert.equal(options.shell, false); return child; });
  const pending = run('aws', ['--version']); child.stderr.emit('data', 'SECRET'); child.emit('close', 1);
  assert.deepEqual(await pending, { ok: false, error: 'COMMAND_FAILED', exitCode: 1 });
});
test('runner bounds output, timeout and cancellation', async () => {
  for (const mode of ['output', 'timeout', 'cancel']) {
    const child = processStub(), controller = new AbortController();
    const pending = createRunner(() => child)('aws', [], { maxBytes: 2, timeoutMs: mode === 'timeout' ? 5 : 1000, signal: controller.signal });
    if (mode === 'output') child.stdout.emit('data', 'long');
    if (mode === 'cancel') controller.abort();
    assert.equal((await pending).error, { output: 'OUTPUT_LIMIT', timeout: 'TIMEOUT', cancel: 'CANCELLED' }[mode]);
    assert.equal(child.kills[0], 'SIGTERM');
  }
});
const input = { name: 'example-app', accountId: '123456789012', region: 'us-east-1', certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789abc', vpcId: 'vpc-12345678', publicSubnets: ['subnet-12345678', 'subnet-23456789'], privateSubnets: ['subnet-34567890', 'subnet-45678901'], image: '123456789012.dkr.ecr.us-east-1.amazonaws.com/example@sha256:' + 'a'.repeat(64) };
test('template requires immutable same-account regional image and creates private two-task HTTPS service', () => {
  const result = buildTemplate(input); assert.equal(result.ok, true);
  const r = result.template.Resources;
  assert.equal(r.Service.Properties.DesiredCount, 2);
  assert.deepEqual(r.Service.Properties.DeploymentConfiguration.DeploymentCircuitBreaker, { Enable: true, Rollback: true });
  assert.equal(r.Listener.Properties.Port, 443);
  assert.equal(r.Service.Properties.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp, 'DISABLED');
  assert.equal(r.TaskRole.Properties.Policies, undefined);
  assert.equal(buildTemplate({ ...input, image: input.image.split('@')[0] + ':latest' }).ok, false);
  assert.equal(buildTemplate({ ...input, certificateArn: input.certificateArn.replace('us-east-1', 'us-west-2') }).ok, false);
  assert.equal(buildTemplate({ ...input, publicSubnets: [input.publicSubnets[0], input.publicSubnets[0]] }).ok, false);
});
