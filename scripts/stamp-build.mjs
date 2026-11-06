// Writes src/build-info.json, the provenance bound to this build. Run in CI before packaging.
//   node scripts/stamp-build.mjs <version> [codeName.json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [version, codeNameFile] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('usage: stamp-build.mjs <x.y.z> [codeName.json]');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const committedAt = execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
let codeName = null;
if (codeNameFile && fs.existsSync(codeNameFile)) codeName = JSON.parse(fs.readFileSync(codeNameFile, 'utf8'));
const info = { version, commit, committedAt, builtAt: new Date().toISOString(), codeName };
fs.writeFileSync(path.join(root, 'src/build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(JSON.stringify(info));
