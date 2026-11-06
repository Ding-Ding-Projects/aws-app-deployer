'use strict';
const path = require('node:path');
// Deliberately small: every unsupported service/feature is reported, never dropped.
function translateCompose(config, composeFile) {
  const reasons = [];
  const reject = (service, feature) => reasons.push({ service, feature });
  if (!config || typeof config !== 'object' || Array.isArray(config) || !config.services || typeof config.services !== 'object' || Array.isArray(config.services)) return { ok: false, error: 'INVALID_COMPOSE' };
  const entries = Object.entries(config.services);
  if (entries.length !== 1) reject(null, 'multiple-or-no-services');
  for (const key of Object.keys(config)) {
    if (!['name', 'services', 'networks'].includes(key)) reject(null, key);
  }
  if (config.networks && (Object.keys(config.networks).some(k => k !== 'default') || Object.keys(config.networks.default || {}).some(k => k !== 'name'))) reject(null, 'custom-networks');
  let source;
  for (const [name, service] of entries) {
    if (!service || typeof service !== 'object' || Array.isArray(service)) { reject(name, 'invalid-service'); continue; }
    for (const key of Object.keys(service)) if (!['build', 'image', 'ports', 'environment', 'networks'].includes(key)) reject(name, key);
    if (service.networks && (Object.keys(service.networks).some(k => k !== 'default') || (service.networks.default && Object.keys(service.networks.default).length))) reject(name, 'custom-networks');
    const ports = service.ports;
    if (!Array.isArray(ports) || ports.length !== 1 || !ports[0] || typeof ports[0] !== 'object' || !Number.isInteger(ports[0].target) || ports[0].target < 1 || ports[0].target > 65535 || (ports[0].protocol && ports[0].protocol !== 'tcp') || ports[0].host_ip || (ports[0].mode && ports[0].mode !== 'ingress') || Object.keys(ports[0] || {}).some(k => !['target', 'published', 'protocol', 'mode'].includes(k))) reject(name, 'one-tcp-port-required');
    if (service.environment && (typeof service.environment !== 'object' || Array.isArray(service.environment) || Object.entries(service.environment).some(([k, v]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== 'string'))) reject(name, 'unresolved-environment');
    const build = service.build;
    if (build) {
      if (typeof build !== 'object' || Object.keys(build).some(k => !['context', 'dockerfile'].includes(k)) || typeof build.context !== 'string' || /(?:^[a-z]+:\/\/|^git@)/i.test(build.context) || (build.dockerfile !== undefined && typeof build.dockerfile !== 'string')) reject(name, 'unsupported-build');
      else {
        const contextPath = path.resolve(path.dirname(composeFile), build.context);
        source = { kind: 'dockerfile', contextPath, dockerfilePath: path.resolve(contextPath, build.dockerfile || 'Dockerfile') };
      }
    } else if (typeof service.image === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,1023}$/.test(service.image)) source = { kind: 'image', image: service.image };
    else reject(name, 'image-or-build-required');
    if (source) source = { ...source, service: name, containerPort: ports?.[0]?.target, environment: service.environment || {} };
  }
  return reasons.length ? { ok: false, error: 'UNSUPPORTED_COMPOSE', reasons } : { ok: true, source };
}
module.exports = { translateCompose };
