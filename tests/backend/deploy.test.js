'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDeployer, translateCompose } = require('../../src/backend');
const identity = { accountId: '123456789012', arn: 'arn:aws:sts::123456789012:assumed-role/Developer/session', userId: 'id', profile: 'developer', region: 'us-east-1' };
const success = data => ({ ok: true, stdout: typeof data === 'string' ? data : JSON.stringify(data) });
const compose = { name: 'app', services: { web: { image: 'nginx:alpine', ports: [{ target: 80, published: '8080', protocol: 'tcp', mode: 'ingress' }], networks: { default: null }, environment: { GREETING: 'hello' } } }, networks: { default: { name: 'app_default' } } };
test('Compose translates one service and rejects every unsupported feature without dropping services', () => {
  const result = translateCompose(compose, '/project/compose.yaml');
  assert.equal(result.source.image, 'nginx:alpine');
  assert.equal(result.source.containerPort, 80);
  assert.deepEqual(result.source.environment, { GREETING: 'hello' });
  const rejected = translateCompose({ services: { web: { ...compose.services.web, privileged: true, volumes: ['/home:/data'], devices: ['/dev/kvm'], network_mode: 'host' }, worker: { image: 'worker:latest' } } }, '/project/compose.yaml');
  assert.equal(rejected.error, 'UNSUPPORTED_COMPOSE');
  for (const feature of ['multiple-or-no-services', 'privileged', 'volumes', 'devices', 'network_mode', 'one-tcp-port-required']) assert.ok(rejected.reasons.some(r => r.feature === feature));
  const built = translateCompose({ services: { web: { ...compose.services.web, build: { context: './app', dockerfile: 'Containerfile' } } } }, '/project/compose.yaml');
  assert.equal(built.source.dockerfilePath, '/project/app/Containerfile');
  assert.equal(translateCompose({ services: { web: { ...compose.services.web, build: { context: 'https://example.com/app.git' } } } }, '/project/compose.yaml').error, 'UNSUPPORTED_COMPOSE');
  assert.equal(translateCompose({ services: { web: { image: 'nginx', ports: [null] } } }, '/project/compose.yaml').error, 'UNSUPPORTED_COMPOSE');
});
async function fixture(t, override = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'deploy-test-'));
  await fs.writeFile(path.join(directory, 'Dockerfile'), 'FROM nginx:alpine\nEXPOSE 80\n');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const calls = [], events = []; let clock = 0, probeCount = 0, verifiedCount = 0, template, deployed = false, repositoryCreated = false;
  const ownershipTags = [{ Key: 'ManagedBy', Value: 'AWSAppDeployer' }, { Key: 'Project', Value: 'example-app' }];
  const input = { name: 'example-app', profile: identity.profile, region: identity.region, expectedIdentity: identity, source: { kind: 'dockerfile', contextPath: directory, dockerfilePath: path.join(directory, 'Dockerfile') } };
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    const custom = await override.run?.(command, args, options, calls);
    if (custom) return custom;
    if (command === 'docker') {
      if (args.includes('compose')) return success(compose);
      if (args.includes('inspect')) return success({ '80/tcp': {} });
      return success('');
    }
    if (args[0] === 'ecr') {
      if (args[1] === 'describe-repositories') return repositoryCreated || override.repositoryExists ? success({ repositories: [{ repositoryArn: 'arn:aws:ecr:us-east-1:123456789012:repository/desktop-apps/example-app' }] }) : { ok: false, error: 'ECR_REPOSITORY_NOT_FOUND' };
      if (args[1] === 'list-tags-for-resource') return success({ tags: ownershipTags });
      if (args[1] === 'create-repository') {
        if (override.repositoryExists) return { ok: false, error: 'ECR_REPOSITORY_EXISTS' };
        repositoryCreated = true; return success({});
      }
      if (args[1] === 'get-login-password') return success('sensitive-password');
      if (args[1] === 'describe-images') return success({ imageDetails: [{ imageDigest: 'sha256:' + 'a'.repeat(64) }] });
      return success({});
    }
    if (args[1] === 'deploy') {
      deployed = true;
      template = JSON.parse(await fs.readFile(args[args.indexOf('--template-file') + 1], 'utf8'));
      return success('');
    }
    if (args[1] === 'describe-stacks') return deployed || override.stackExists ? success({ Stacks: [{ Tags: ownershipTags, StackStatus: 'CREATE_COMPLETE', Outputs: [{ OutputKey: 'LoadBalancerDnsName', OutputValue: 'app-123.us-east-1.elb.amazonaws.com' }, { OutputKey: 'TargetGroupArn', OutputValue: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/app/123' }] }] }) : { ok: false, error: 'STACK_NOT_FOUND' };
    if (args[1] === 'describe-target-health') return success({ TargetHealthDescriptions: [{ TargetHealth: { State: 'healthy' } }, { TargetHealth: { State: 'healthy' } }] });
    throw Error('Unexpected command');
  };
  const api = createDeployer({ run, backend: { prerequisites: async () => override.prerequisites || { ok: true, aws: { available: true }, docker: { available: true, running: true } }, verifyDeployment: async () => { verifiedCount++; return override.identity || { ok: true, identity }; } }, uuid: () => 'test-unique-tag', now: () => clock, pause: async ms => { clock += ms; }, fetchUrl: async url => { probeCount++; assert.equal(url, 'http://app-123.us-east-1.elb.amazonaws.com/'); return { status: override.httpStatus || 200 }; } });
  return { input, calls, events, api, get template() { return template; }, get probeCount() { return probeCount; }, get verifiedCount() { return verifiedCount; } };
}
test('Dockerfile builds and pushes unique image, deploys template, returns only verified healthy actual URL', async t => {
  const f = await fixture(t);
  const result = await f.api.deploy(f.input, { onProgress: event => f.events.push(event.stage) });
  assert.equal(result.ok, true); assert.equal(result.url, 'http://app-123.us-east-1.elb.amazonaws.com');
  assert.equal(f.verifiedCount, 3); assert.equal(f.probeCount, 1);
  assert.equal(f.template.Resources.Task.Properties.ContainerDefinitions[0].PortMappings[0].ContainerPort, 80);
  assert.match(result.image, /@sha256:a{64}$/);
  const login = f.calls.find(c => c.args.includes('login'));
  assert.equal(login.options.stdin, 'sensitive-password\n'); assert.ok(!login.args.join(' ').includes('sensitive-password'));
  const configPath = login.args[1]; await assert.rejects(fs.stat(configPath), { code: 'ENOENT' });
  assert.equal(f.events.at(-1), 'complete');
  for (const c of f.calls.filter(c => c.command === 'aws')) {
    assert.equal(c.args[c.args.indexOf('--profile') + 1], identity.profile);
    assert.equal(c.args[c.args.indexOf('--region') + 1], identity.region);
  }
});
test('build failure stops before any AWS mutation and never returns URL', async t => {
  const f = await fixture(t, { run: (command, args) => args.includes('build') ? { ok: false, error: 'COMMAND_FAILED' } : null });
  const result = await f.api.deploy(f.input);
  assert.equal(result.error, 'BUILD_FAILED'); assert.equal(result.url, undefined); assert.equal(result.resourcesMayExist, false);
  assert.equal(f.calls.some(c => c.command === 'aws' && ['create-repository', 'deploy'].includes(c.args[1])), false);
});
test('identity mismatch stops all process execution', async t => {
  const f = await fixture(t, { identity: { ok: false, error: 'IDENTITY_CHANGED' } });
  assert.equal((await f.api.deploy(f.input)).error, 'IDENTITY_CHANGED'); assert.equal(f.calls.length, 0);
});
test('missing prerequisites stop before building and provide installation guidance', async t => {
  const f = await fixture(t, { prerequisites: { ok: true, aws: { available: false }, docker: { available: false, running: false } } });
  const result = await f.api.deploy(f.input); assert.equal(result.error, 'PREREQUISITE_FAILED'); assert.ok(result.remediation); assert.equal(f.calls.length, 0);
});
test('cancellation after stack mutation preserves resources and cannot return URL', async t => {
  const f = await fixture(t, { run: (command, args) => args[1] === 'deploy' ? { ok: false, error: 'CANCELLED' } : null });
  const result = await f.api.deploy(f.input); assert.equal(result.error, 'CANCELLED'); assert.equal(result.resourcesMayExist, true); assert.equal(result.url, undefined); assert.equal(f.probeCount, 0);
});
test('unhealthy targets preserve stack and cannot produce success URL', async t => {
  const f = await fixture(t, { run: (command, args) => args[1] === 'describe-target-health' ? success({ TargetHealthDescriptions: [{ TargetHealth: { State: 'unhealthy' } }] }) : null });
  const result = await f.api.deploy(f.input);
  assert.equal(result.error, 'TARGETS_NOT_HEALTHY'); assert.equal(result.url, undefined); assert.equal(result.resourcesMayExist, true); assert.equal(f.probeCount, 0);
  assert.equal(f.calls.some(c => c.args.some(a => a.startsWith('delete'))), false);
});
test('healthy targets still cannot return a URL when public endpoint fails', async t => {
  const f = await fixture(t, { httpStatus: 503 });
  const result = await f.api.deploy(f.input); assert.equal(result.error, 'ENDPOINT_NOT_READY'); assert.equal(result.url, undefined); assert.equal(f.probeCount, 6);
});
test('single-service Compose image goes through complete deploy pipeline', async t => {
  const f = await fixture(t);
  f.input.source = { kind: 'compose', composePath: '/project/compose.yaml' };
  const result = await f.api.deploy(f.input); assert.equal(result.ok, true);
  assert.ok(f.calls.some(c => c.args.includes('pull')));
  assert.equal(f.template.Resources.Task.Properties.ContainerDefinitions[0].Environment[0].Name, 'GREETING');
});
test('read-only throttling retries but permission failures and mutations do not', async t => {
  let reads = 0;
  const f = await fixture(t, { run: (command, args) => args[1] === 'describe-images' && reads++ === 0 ? { ok: false, error: 'AWS_THROTTLED' } : null });
  assert.equal((await f.api.deploy(f.input)).ok, true); assert.equal(reads, 2);
  const denied = await fixture(t, { run: (command, args) => args[1] === 'create-repository' ? { ok: false, error: 'AWS_PERMISSION_DENIED' } : null });
  const result = await denied.api.deploy(denied.input); assert.equal(result.error, 'AWS_PERMISSION_DENIED'); assert.ok(result.remediation);
  assert.equal(denied.calls.filter(c => c.args[1] === 'create-repository').length, 1);
  assert.equal(denied.calls.some(c => c.args.includes('push')), false);
});
test('unrelated or untagged existing stacks are rejected before build and mutation', async t => {
  for (const Tags of [undefined, [{ Key: 'ManagedBy', Value: 'AWSAppDeployer' }, { Key: 'Project', Value: 'another-project' }]]) {
    const f = await fixture(t, { run: (command, args) => args[1] === 'describe-stacks' ? success({ Stacks: [{ Tags }] }) : null });
    const result = await f.api.deploy(f.input); assert.equal(result.error, 'STACK_OWNERSHIP_CONFLICT');
    assert.equal(f.calls.some(c => c.args.includes('build') || c.args.includes('push') || c.args[1] === 'create-repository' || c.args[1] === 'deploy'), false);
  }
});
test('unowned existing repository is rejected before build and any AWS mutation', async t => {
  const f = await fixture(t, { repositoryExists: true, run: (command, args) => args[1] === 'list-tags-for-resource' ? success({ tags: [{ Key: 'ManagedBy', Value: 'AnotherApp' }] }) : null });
  const result = await f.api.deploy(f.input); assert.equal(result.error, 'REPOSITORY_OWNERSHIP_CONFLICT');
  assert.equal(f.calls.some(c => c.args.includes('build') || c.args.includes('login') || c.args.includes('push') || c.args[1] === 'create-repository' || c.args[1] === 'deploy'), false);
});
test('owned stack and repository support repeat deploys and retain ownership tags', async t => {
  const f = await fixture(t, { stackExists: true, repositoryExists: true });
  const result = await f.api.deploy(f.input); assert.equal(result.ok, true);
  assert.equal(f.calls.filter(c => c.args[1] === 'list-tags-for-resource').length, 2);
  const deployment = f.calls.find(c => c.args[1] === 'deploy');
  assert.deepEqual(deployment.args.slice(deployment.args.indexOf('--tags') + 1, deployment.args.indexOf('--profile')), ['ManagedBy=AWSAppDeployer', 'Project=example-app']);
  const creation = f.calls.find(c => c.args[1] === 'create-repository');
  assert.deepEqual(JSON.parse(creation.args[creation.args.indexOf('--tags') + 1]), [{ Key: 'ManagedBy', Value: 'AWSAppDeployer' }, { Key: 'Project', Value: 'example-app' }]);
});
test('repository collision after preflight cannot trigger login or push', async t => {
  let repositoryReads = 0;
  const f = await fixture(t, { run: (command, args) => {
    if (args[1] === 'describe-repositories') return repositoryReads++ === 0 ? { ok: false, error: 'ECR_REPOSITORY_NOT_FOUND' } : success({ repositories: [{ repositoryArn: 'arn:aws:ecr:us-east-1:123456789012:repository/desktop-apps/example-app' }] });
    if (args[1] === 'create-repository') return { ok: false, error: 'ECR_REPOSITORY_EXISTS' };
    if (args[1] === 'list-tags-for-resource') return success({ tags: [] });
  } });
  const result = await f.api.deploy(f.input); assert.equal(result.error, 'REPOSITORY_OWNERSHIP_CONFLICT');
  assert.equal(f.calls.some(c => c.args.includes('login') || c.args.includes('push') || c.args[1] === 'deploy'), false);
});
test('unknown ownership inspection failure is not mistaken for absent stack', async t => {
  const f = await fixture(t, { run: (command, args) => args[1] === 'describe-stacks' ? { ok: false, error: 'COMMAND_FAILED' } : null });
  assert.equal((await f.api.deploy(f.input)).error, 'COMMAND_FAILED');
  assert.equal(f.calls.some(c => c.args.includes('build') || c.args[1] === 'create-repository' || c.args[1] === 'deploy'), false);
});
