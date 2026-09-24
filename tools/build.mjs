// Production build: bundles the game's JavaScript into one file with esbuild
// and copies content, assets and styles into dist/. The result is a static
// folder that can be served from anywhere or dropped into an iOS wrapper
// (Capacitor/WKWebView) as its web directory.
//   npm run build            -> dist/
import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib/node-content.mjs';

const out = path.join(ROOT, process.argv[2] || 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  target: ['safari15', 'chrome100'],
  outfile: path.join(out, 'game.js'),
  legalComments: 'none',
});

for (const dir of ['content', 'styles']) await cp(path.join(ROOT, dir), path.join(out, dir), { recursive: true });
// assets: copy everything except source-only files
await cp(path.join(ROOT, 'assets'), path.join(out, 'assets'), { recursive: true });
await cp(path.join(ROOT, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));

let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace('<script type="module" src="src/main.js"></script>', '<script type="module" src="game.js"></script>');
await writeFile(path.join(out, 'index.html'), html);

// A variant page for hosts that wrap the page in their own <html>/<head>
// (e.g. a claude.ai Artifact preview): no document skeleton, fonts also from
// Google Fonts in case the host only allows that font source.
const fonts = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=Jost:wght@400..800&family=Special+Elite&family=Yellowtail&display=swap';
await writeFile(path.join(out, 'postcard-perfect.html'), `<title>Postcard Perfect</title>
<meta name="theme-color" content="#22302c">
<link rel="stylesheet" href="${fonts}">
<link rel="stylesheet" href="styles/main.css">
<link rel="stylesheet" href="styles/screens.css">
<link rel="stylesheet" href="styles/layout.css">
<div id="app">
  <canvas id="scene"></canvas>
  <div id="ui"></div>
</div>
<script type="module" src="game.js"></script>
`);

async function size(dir) {
  let total = 0, files = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const s = await size(p); total += s.total; files += s.files; } else { total += (await stat(p)).size; files++; }
  }
  return { total, files };
}
const s = await size(out);
console.log(`dist ready: ${s.files} files, ${(s.total / 1e6).toFixed(1)} MB -> ${path.relative(ROOT, out)}/`);
