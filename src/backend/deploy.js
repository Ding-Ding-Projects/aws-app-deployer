'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { Resolver } = require('node:dns/promises');
const { createRunner } = require('./runner');
const { buildTemplate } = require('./template');
const { translateCompose } = require('./compose');

const REMEDIATION = {
  UNAVAILABLE: 'Install AWS CLI v2.22 or later and Docker, and ensure both commands are available to the desktop application.',
  PREREQUISITE_FAILED: 'Install AWS CLI v2.22 or later and Docker with Compose v2, and start the Docker engine.',
  AWS_PERMISSION_DENIED: 'Grant the selected identity the required ECR, CloudFormation, ECS, EC2, ELB, IAM and CloudWatch permissions, then retry.',
  AWS_LOGIN_REQUIRED: 'Sign in to the selected AWS profile again.',
  AWS_ACCOUNT_SETUP_REQUIRED: 'Complete AWS account activation, billing and region access in AWS.',
  BUILD_FAILED: 'Check the Dockerfile, build context and Docker build locally.',
  CONTAINER_PORT_REQUIRED: 'Expose exactly one TCP port in the Dockerfile, or select the application listening port explicitly.',
  SOURCE_NOT_FOUND: 'Select an existing local build context and Dockerfile.',
  TARGETS_NOT_HEALTHY: 'Check ECS task events, application logs, listening port and health check path.',
  ENDPOINT_NOT_READY: 'Check application responses and, for HTTPS, the custom domain DNS and certificate.',
  DOMAIN_DNS_NOT_READY: 'Point the custom domain to the returned load balancer DNS name, allow DNS propagation, then retry.',
  STACK_OWNERSHIP_CONFLICT: 'Choose a different project name. The existing stack is not tagged as belonging to this AWS App Deployer project.',
  REPOSITORY_OWNERSHIP_CONFLICT: 'Choose a different project name. The existing repository is not tagged as belonging to this AWS App Deployer project.',
};
async function boundedResolve(hostname, { signal } = {}) {
  signal?.throwIfAborted();
  const resolver = new Resolver({ timeout: 5000, tries: 1 });
  const cancel = () => resolver.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try { return await resolver.resolve4(hostname); }
  finally { signal?.removeEventListener('abort', cancel); }
}
function createDeployer({ run = createRunner(), backend, pause = sleep, fetchUrl = globalThis.fetch, resolveDns = boundedResolve, uuid = randomUUID, now = Date.now } = {}) {
  backend ||= require('./index').createBackend({ run });
  async function inspectCompose(composePath, options = {}) {
    if (typeof composePath !== 'string' || !path.isAbsolute(composePath)) return { ok: false, error: 'INVALID_INPUT' };
    const result = await run('docker', ['compose', '-f', composePath, 'config', '--format', 'json'], { signal: options.signal, timeoutMs: 30000 });
    if (!result.ok) return { ...result, stage: 'compose' };
    try { return translateCompose(JSON.parse(result.stdout), composePath); }
    catch { return { ok: false, error: 'INVALID_COMPOSE', stage: 'compose' }; }
  }
  async function deploy(input, { signal, onProgress } = {}) {
    let stage = 'validation', tempDir, resourcesMayExist = false;
    const mark = value => { stage = value; onProgress?.({ stage }); };
    const fail = (error, details = {}) => { throw Object.assign(new Error(error), { code: error, details }); };
    const check = result => { if (!result.ok) fail(result.error, result.reasons ? { reasons: result.reasons } : {}); return result; };
    const selection = { profile: input?.profile, region: input?.region };
    async function aws(args, { readOnly = false, timeoutMs = 30000 } = {}) {
      for (let attempt = 0; ; attempt++) {
        const result = await run('aws', [...args, '--profile', selection.profile, '--region', selection.region, '--no-cli-pager'], { signal, timeoutMs });
        if (result.ok || !readOnly || !['AWS_THROTTLED', 'AWS_TRANSIENT'].includes(result.error) || attempt >= 2) return result;
        await pause(1000 * 2 ** attempt, undefined, { signal });
      }
    }
    const json = result => { check(result); try { return JSON.parse(result.stdout); } catch { fail('INVALID_RESPONSE'); } };
    try {
      if (!input || !input.expectedIdentity || typeof input.name !== 'string') fail('INVALID_INPUT');
      if (input.secrets !== undefined) fail('UNSUPPORTED_FEATURE', { reasons: [{ service: null, feature: 'secrets' }] });
      mark('identity'); const verified = check(await backend.verifyDeployment(selection, input.expectedIdentity, { signal }));
      mark('prerequisites');
      const prerequisites = check(await backend.prerequisites({ signal }));
      if (!prerequisites.aws.available || !prerequisites.docker.available || !prerequisites.docker.running) fail('PREREQUISITE_FAILED', { prerequisites });
      let source;
      if (input.source?.kind === 'compose') source = check(await inspectCompose(input.source.composePath, { signal })).source;
      else if (input.source?.kind === 'dockerfile') {
        if (Object.keys(input.source).some(k => !['kind', 'contextPath', 'dockerfilePath'].includes(k))) fail('UNSUPPORTED_FEATURE');
        source = { ...input.source, containerPort: input.containerPort ?? 3000, environment: input.environment || {} };
      }
      else fail('INVALID_INPUT');
      if (source.kind === 'dockerfile') {
        if (typeof source.contextPath !== 'string' || !path.isAbsolute(source.contextPath) || typeof source.dockerfilePath !== 'string' || !path.isAbsolute(source.dockerfilePath)) fail('INVALID_INPUT');
        try {
          if (!(await fs.stat(source.contextPath)).isDirectory() || !(await fs.stat(source.dockerfilePath)).isFile()) fail('SOURCE_NOT_FOUND');
        } catch { fail('SOURCE_NOT_FOUND'); }
      }
      const { accountId } = verified.identity;
      const suffix = selection.region.startsWith('cn-') ? 'amazonaws.com.cn' : 'amazonaws.com';
      const registry = `${accountId}.dkr.ecr.${selection.region}.${suffix}`;
      const repo = `desktop-apps/${input.name}`;
      const stackName = `desktop-${input.name}`;
      const partition = selection.region.startsWith('cn-') ? 'aws-cn' : selection.region.startsWith('us-gov-') ? 'aws-us-gov' : 'aws';
      const repositoryArn = `arn:${partition}:ecr:${selection.region}:${accountId}:repository/${repo}`;
      const ownershipTags = [{ Key: 'ManagedBy', Value: 'AWSAppDeployer' }, { Key: 'Project', Value: input.name }];
      const owned = tags => Array.isArray(tags) && ownershipTags.every(expected => tags.filter(tag => tag.Key === expected.Key && tag.Value === expected.Value).length === 1) && ownershipTags.every(expected => tags.filter(tag => tag.Key === expected.Key).length === 1);
      async function inspectStackOwnership() {
        const result = await aws(['cloudformation', 'describe-stacks', '--stack-name', stackName, '--output', 'json'], { readOnly: true });
        if (!result.ok && result.error === 'STACK_NOT_FOUND') return false;
        const stacks = json(result).Stacks;
        if (!Array.isArray(stacks) || stacks.length !== 1) fail('INVALID_RESPONSE');
        if (!owned(stacks[0].Tags)) fail('STACK_OWNERSHIP_CONFLICT');
        return true;
      }
      async function inspectRepositoryOwnership() {
        const result = await aws(['ecr', 'describe-repositories', '--registry-id', accountId, '--repository-names', repo, '--output', 'json'], { readOnly: true });
        if (!result.ok && result.error === 'ECR_REPOSITORY_NOT_FOUND') return false;
        const repositories = json(result).repositories;
        if (!Array.isArray(repositories) || repositories.length !== 1 || repositories[0].repositoryArn !== repositoryArn) fail('INVALID_RESPONSE');
        const tags = json(await aws(['ecr', 'list-tags-for-resource', '--resource-arn', repositoryArn, '--output', 'json'], { readOnly: true })).tags;
        if (!owned(tags)) fail('REPOSITORY_OWNERSHIP_CONFLICT');
        return true;
      }
      const imageTag = `${registry}/${repo}:deploy-${uuid()}`;
      const templateInput = { ...input, ...selection, accountId, containerPort: source.containerPort, environment: source.environment, image: `${registry}/${repo}@sha256:${'0'.repeat(64)}` };
      // Validate the complete deployment before building or mutating AWS resources.
      check(buildTemplate(templateInput));
      mark('ownership');
      await inspectStackOwnership();
      await inspectRepositoryOwnership();
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-app-deployer-'));
      await fs.chmod(tempDir, 0o700);
      const docker = async (args, options = {}) => run('docker', ['--config', tempDir, ...args], { signal, ...options });
      mark('build');
      if (source.kind === 'dockerfile') {
        const result = await docker(['build', '--platform', 'linux/amd64', '-f', source.dockerfilePath, '-t', imageTag, '--', source.contextPath], { timeoutMs: 20 * 60 * 1000 });
        if (!result.ok) fail(result.error === 'COMMAND_FAILED' ? 'BUILD_FAILED' : result.error);
      } else {
        check(await docker(['pull', '--platform', 'linux/amd64', source.image], { timeoutMs: 10 * 60 * 1000 }));
        check(await docker(['tag', source.image, imageTag]));
      }
      if (input.source.kind === 'dockerfile' && input.containerPort === undefined) {
        const exposed = json(await docker(['image', 'inspect', '--format', '{{json .Config.ExposedPorts}}', imageTag]));
        const ports = Object.keys(exposed || {});
        if (ports.length !== 1 || !/^\d+\/tcp$/.test(ports[0]) || Number(ports[0].split('/')[0]) < 1 || Number(ports[0].split('/')[0]) > 65535) fail('CONTAINER_PORT_REQUIRED');
        templateInput.containerPort = Number(ports[0].split('/')[0]);
      }
      mark('identity'); check(await backend.verifyDeployment(selection, input.expectedIdentity, { signal }));
      mark('repository'); resourcesMayExist = true;
      const created = await aws(['ecr', 'create-repository', '--repository-name', repo, '--image-tag-mutability', 'IMMUTABLE', '--image-scanning-configuration', 'scanOnPush=true', '--tags', JSON.stringify(ownershipTags), '--output', 'json']);
      if (!created.ok) {
        if (created.error !== 'ECR_REPOSITORY_EXISTS') check(created);
        if (!await inspectRepositoryOwnership()) fail('REPOSITORY_OWNERSHIP_CONFLICT');
      }
      mark('push');
      let password = check(await aws(['ecr', 'get-login-password'], { readOnly: true })).stdout.trim();
      if (!password || password.length > 65536) fail('INVALID_RESPONSE');
      try { check(await docker(['login', '--username', 'AWS', '--password-stdin', registry], { stdin: password + '\n' })); }
      finally { password = undefined; }
      check(await docker(['push', imageTag], { timeoutMs: 15 * 60 * 1000 }));
      const imageInfo = json(await aws(['ecr', 'describe-images', '--registry-id', accountId, '--repository-name', repo, '--image-ids', `imageTag=${imageTag.split(':').at(-1)}`, '--output', 'json'], { readOnly: true }));
      const digest = imageInfo.imageDetails?.[0]?.imageDigest;
      if (!/^sha256:[a-f0-9]{64}$/.test(digest || '') || imageInfo.imageDetails.length !== 1) fail('INVALID_RESPONSE');
      const image = `${registry}/${repo}@${digest}`;
      const template = check(buildTemplate({ ...templateInput, image })).template;
      const templatePath = path.join(tempDir, 'stack.json');
      await fs.writeFile(templatePath, JSON.stringify(template), { mode: 0o600 });
      // Recheck immediately before stack mutation, including account, role, profile and region.
      mark('identity'); check(await backend.verifyDeployment(selection, input.expectedIdentity, { signal }));
      mark('ownership'); await inspectStackOwnership();
      mark('stack');
      check(await aws(['cloudformation', 'deploy', '--stack-name', stackName, '--template-file', templatePath, '--capabilities', 'CAPABILITY_IAM', '--no-fail-on-empty-changeset', '--tags', 'ManagedBy=AWSAppDeployer', `Project=${input.name}`], { timeoutMs: 30 * 60 * 1000 }));
      const stack = json(await aws(['cloudformation', 'describe-stacks', '--stack-name', stackName, '--output', 'json'], { readOnly: true })).Stacks;
      if (!Array.isArray(stack) || stack.length !== 1 || !['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stack[0].StackStatus)) fail('STACK_NOT_READY');
      const outputs = Object.fromEntries((stack[0].Outputs || []).map(x => [x.OutputKey, x.OutputValue]));
      if (typeof outputs.LoadBalancerDnsName !== 'string' || !/^[a-zA-Z0-9-]+\.[a-z0-9-]+\.elb\.amazonaws\.com(?:\.cn)?$/.test(outputs.LoadBalancerDnsName) || !outputs.TargetGroupArn?.includes(`:${selection.region}:${accountId}:targetgroup/`)) fail('INVALID_RESPONSE');
      mark('health');
      let healthy = false;
      const deadline = now() + 5 * 60 * 1000;
      for (let attempt = 0; attempt < 61 && now() < deadline; attempt++) {
        const targets = json(await aws(['elbv2', 'describe-target-health', '--target-group-arn', outputs.TargetGroupArn, '--output', 'json'], { readOnly: true })).TargetHealthDescriptions;
        if (Array.isArray(targets) && targets.length >= 2 && targets.every(t => t.TargetHealth?.State === 'healthy')) { healthy = true; break; }
        await pause(5000, undefined, { signal });
      }
      if (!healthy) fail('TARGETS_NOT_HEALTHY');
      const url = input.certificateArn ? `https://${input.domain}` : `http://${outputs.LoadBalancerDnsName}`;
      mark('endpoint');
      if (input.certificateArn) {
        // HTTPS success also requires the user's domain to point at this ALB.
        let matchingDns = false;
        try {
          const [customIps, albIps] = await Promise.all([resolveDns(input.domain, { signal }), resolveDns(outputs.LoadBalancerDnsName, { signal })]);
          matchingDns = customIps.length > 0 && customIps.every(ip => albIps.includes(ip));
        } catch { signal?.throwIfAborted(); /* Missing/propagating DNS is actionable. */ }
        if (!matchingDns) fail('DOMAIN_DNS_NOT_READY', { loadBalancerDnsName: outputs.LoadBalancerDnsName });
      }
      let reachable = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        signal?.throwIfAborted();
        try {
          const response = await fetchUrl(url + (input.healthCheckPath || '/'), { redirect: 'manual', signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]) });
          response.body?.cancel().catch(() => {});
          if (response.status >= 200 && response.status < 400) { reachable = true; break; }
        } catch { signal?.throwIfAborted(); }
        await pause(5000, undefined, { signal });
      }
      if (!reachable) fail('ENDPOINT_NOT_READY');
      mark('complete');
      return { ok: true, url, image, stackName, identity: verified.identity, resourcesMayExist: true };
    } catch (error) {
      const code = signal?.aborted ? 'CANCELLED' : error.code || 'DEPLOYMENT_FAILED';
      return { ok: false, error: code, stage, resourcesMayExist, ...(REMEDIATION[code] ? { remediation: REMEDIATION[code] } : {}), ...(error.details || {}) };
    } finally {
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return { deploy, inspectCompose };
}
module.exports = { createDeployer };
