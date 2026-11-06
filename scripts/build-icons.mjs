// Generate the packaged icons from the master SVG. Run: node scripts/build-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'));
const out = path.join(root, 'build');
fs.mkdirSync(out, { recursive: true });
const render = size => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map(render);
fs.writeFileSync(path.join(out, 'icon.png'), render(512));
fs.writeFileSync(path.join(out, 'icon.ico'), await pngToIco(pngs));
fs.writeFileSync(path.join(root, 'src/renderer/icon.png'), render(64));
fs.copyFileSync(path.join(out, 'icon.png'), path.join(root, 'site/icon.png'));
console.log('icons written:', sizes.join(', '), 'px ico; 512 px png');
