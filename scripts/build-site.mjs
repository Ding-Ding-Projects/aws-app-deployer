// Copies the shared renderer library into the landing page and bundles the feature articles,
// so the site and the app use the same code and the same docs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.copyFileSync(path.join(root, 'src/renderer/lib.js'), path.join(root, 'site/lib.js'));
fs.copyFileSync(path.join(root, 'src/renderer/kit.js'), path.join(root, 'site/kit.js'));
const dir = path.join(root, 'docs/features');
const articles = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => {
  const body = fs.readFileSync(path.join(dir, f), 'utf8');
  return { id: f.replace(/\.md$/, ''), title: (body.match(/^# (.+)$/m) || [, f])[1].trim(), body };
});
fs.writeFileSync(path.join(root, 'site/docs.json'), JSON.stringify({ schema: 'aws-app-deployer.docs/1', articles }) + '\n');
console.log(`site: lib.js and kit.js copied, ${articles.length} articles bundled`);
