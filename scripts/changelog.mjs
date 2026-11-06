// Builds src/changelog.json from Git: every tag v* is a released version with its date, full
// commit SHA and the commits since the previous tag, grouped by kind. Commits after the last
// tag are listed as unreleased. Run with full history: git fetch --tags --unshallow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const kind = s => (/^(fix|resolve|correct|repair)/i.test(s) ? 'Fixed' : /^(add|ship|build|introduce|create)/i.test(s) ? 'Added' : /^(remove|drop)/i.test(s) ? 'Removed' : 'Changed');
const tags = git('tag', '--list', 'v*', '--sort=creatordate').split('\n').filter(Boolean);
const commits = range => (git('log', '--format=%H%x1f%cI%x1f%s', ...(range ? [range] : [])) || '').split('\n').filter(Boolean).map(l => { const [sha, date, subject] = l.split('\x1f'); return { sha, date, subject, kind: kind(subject) }; });
const versions = [];
let prev = null;
for (const tag of tags) {
  const sha = git('rev-list', '-n', '1', tag);
  versions.push({ version: tag.replace(/^v/, ''), tag, sha, date: git('show', '-s', '--format=%cI', sha), changes: commits(prev ? `${prev}..${tag}` : tag) });
  prev = tag;
}
const unreleased = commits(prev ? `${prev}..HEAD` : 'HEAD');
const out = { repository: 'https://github.com/Ding-Ding-Projects/aws-app-deployer', generatedAt: new Date().toISOString(), versions: versions.reverse(), unreleased };
fs.writeFileSync(path.join(root, 'src/changelog.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`changelog: ${versions.length} versions, ${unreleased.length} unreleased commits`);
