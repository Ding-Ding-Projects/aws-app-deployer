'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBackend, createRunner, buildTemplate } = require('../../src/backend');
const selection = { profile: 'developer', region: 'us-east-1' };
const caller = { Account: '123456789012', Arn: 'arn:aws:sts::123456789012:assumed-role/Developer/session', UserId: 'ABC:session' };
test('login uses CLI browser default and verifies explicit identity after completion', async () => {
  const calls = [];
  const api = createBackend({ run: async (command, args) => { calls.push([command, args]); return { ok: true, stdout: args[0] === '--version' ? 'aws-cli/2.31.0' : JSON.stringify(caller), stderr: '' }; } });
  const result = await api.login(selection);
  assert.equal(result.identity.accountId, caller.Account);
  assert.deepEqual(calls[1], ['aws', ['sso', 'login', '--profile', 'developer']]);
  assert.deepEqual(calls[2][1], ['sts', 'get-caller-identity', '--profile', 'developer', '--region', 'us-east-1', '--output', 'json', '--no-cli-pager']);
  assert.equal((await api.verifyDeployment(selection, { ...result.identity, accountId: '999999999999' })).error, 'IDENTITY_CHANGED');
});
test('reject invalid or ambiguous selection before invoking process', async () => {
  const api = createBackend({ run: () => { throw Error('must not run'); } });
  assert.equal((await api.identity()).error, 'INVALID_INPUT');
  assert.equal((await api.login({ profile: '--endpoint-url', region: 'us-east-1' })).error, 'INVALID_INPUT');
  assert.equal((await api.verifyDeployment(selection)).error, 'INVALID_INPUT');
});
test('browser login requires AWS CLI supporting default PKCE', async () => {
  let calls = 0;
  const api = createBackend({ run: async () => { calls++; return { ok: true, stdout: 'aws-cli/2.21.0', stderr: '' }; } });
  assert.equal((await api.login(selection)).error, 'AWS_CLI_UPDATE_REQUIRED'); assert.equal(calls, 1);
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
test('runner sends credentials only through stdin and classifies sanitized AWS errors', async () => {
  const child = processStub(); child.stdin = new EventEmitter(); let data;
  child.stdin.end = value => { data = value; };
  const pending = createRunner((command, args, options) => { assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']); assert.ok(!args.includes('secret')); return child; })('aws', ['example'], { stdin: 'secret' });
  assert.equal(data, 'secret'); child.stderr.emit('data', 'AccessDenied: sensitive account details'); child.emit('close', 1);
  assert.deepEqual(await pending, { ok: false, error: 'AWS_PERMISSION_DENIED', exitCode: 1 });
});
test('runner recognizes service-specific absence and never treats arbitrary validation errors as missing resources', async () => {
  for (const [args, stderr, expected] of [
    [['cloudformation', 'describe-stacks'], 'An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id desktop-app does not exist', 'STACK_NOT_FOUND'],
    [['cloudformation', 'describe-stacks'], 'An error occurred (ValidationError): Invalid stack name', 'COMMAND_FAILED'],
    [['ecr', 'describe-repositories'], 'An error occurred (RepositoryNotFoundException)', 'ECR_REPOSITORY_NOT_FOUND'],
    [['cloudformation', 'describe-stacks'], 'AccessDenied: Stack with id desktop-app does not exist', 'AWS_PERMISSION_DENIED'],
  ]) {
    const child = processStub(); const pending = createRunner(() => child)('aws', args);
    child.stderr.emit('data', stderr); child.emit('close', 1); assert.equal((await pending).error, expected);
  }
});
const input = { name: 'example-app', accountId: '123456789012', region: 'us-east-1', domain: 'app.example.com', certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789abc', vpcId: 'vpc-12345678', publicSubnets: ['subnet-12345678', 'subnet-23456789'], privateSubnets: ['subnet-34567890', 'subnet-45678901'], image: '123456789012.dkr.ecr.us-east-1.amazonaws.com/example@sha256:' + 'a'.repeat(64) };
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
test('default template provisions network and public HTTP with private application tasks', () => {
  const { vpcId, publicSubnets, privateSubnets, certificateArn, domain, ...automatic } = input;
  const result = buildTemplate(automatic); assert.equal(result.ok, true);
  const r = result.template.Resources;
  assert.equal(r.Listener.Properties.Protocol, 'HTTP');
  assert.equal(r.Listener.Properties.Port, 80);
  assert.equal(r.Vpc.Type, 'AWS::EC2::VPC');
  assert.equal(r.NatGateway.Type, 'AWS::EC2::NatGateway');
  assert.equal(r.PrivateDefaultRoute.Properties.NatGatewayId.Ref, 'NatGateway');
  assert.equal(r.PublicSubnetA.Properties.MapPublicIpOnLaunch, false);
  assert.equal(r.TaskSecurityGroup.Properties.SecurityGroupIngress[0].SourceSecurityGroupId.Ref, 'LoadBalancerSecurityGroup');
  assert.equal(r.Service.Properties.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp, 'DISABLED');
  assert.equal(buildTemplate({ ...automatic, vpcId }).ok, false);
});
