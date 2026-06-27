#!/usr/bin/env node
/**
 * Build script: reads version from package.json, patches CDN_VERSION into
 * src/worker.js and GDI_VERSION into generator/worker.js, then minifies
 * app.js → src/app.min.js, homepage.js → assets/homepage.min.js,
 * and gdi.css → assets/gdi.min.css.
 *
 * Usage: npm run build
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── helpers ──────────────────────────────────────────────────────────────────

function minifyCss(src, dest) {
  const input = fs.readFileSync(src, 'utf8');
  const minified = input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{};:,>+~])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  fs.writeFileSync(dest, minified);
  const saved = (((input.length - minified.length) / input.length) * 100).toFixed(1);
  console.log(`  minified  gdi.css → assets/gdi.min.css (${saved}% smaller)`);
}

// ── Read version ──────────────────────────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
console.log(`\nBuilding GDI v${version}\n`);

// ── Patch CDN_VERSION in src/worker.js ───────────────────────────────────────

const workerPath = path.join(ROOT, 'src', 'worker.js');
const workerSrc = fs.readFileSync(workerPath, 'utf8');
const patchedWorker = workerSrc.replace(
  /const CDN_VERSION = '[^']*';/,
  `const CDN_VERSION = '${version}';`
);
if (patchedWorker !== workerSrc) {
  fs.writeFileSync(workerPath, patchedWorker);
  console.log(`  patched   src/worker.js → CDN_VERSION = '${version}'`);
} else {
  console.log(`  ok        src/worker.js CDN_VERSION already '${version}'`);
}

// ── Patch GDI_VERSION in generator/worker.js ─────────────────────────────────

const genPath = path.join(ROOT, 'generator', 'worker.js');
const genSrc = fs.readFileSync(genPath, 'utf8');
const patchedGen = genSrc
  .replace(/const GDI_VERSION = '[^']*';[^\n]*/, `const GDI_VERSION = '${version}'; // auto-updated by build script`)
  .replace(/v\d+\.\d+\.\d+/g, `v${version}`);
if (patchedGen !== genSrc) {
  fs.writeFileSync(genPath, patchedGen);
  console.log(`  patched   generator/worker.js → GDI_VERSION = '${version}'`);
} else {
  console.log(`  ok        generator/worker.js GDI_VERSION already '${version}'`);
}

// ── Minify JS & CSS ───────────────────────────────────────────────────────────

async function run() {
  // app.js → src/app.min.js
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'app.js')],
    outfile: path.join(ROOT, 'src', 'app.min.js'),
    minify: true,
    bundle: false,
    target: ['es2020'],
    logLevel: 'silent',
  });
  console.log(`  minified  src/app.js → src/app.min.js`);

  // homepage.js → assets/homepage.min.js
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'assets', 'homepage.js')],
    outfile: path.join(ROOT, 'assets', 'homepage.min.js'),
    minify: true,
    bundle: false,
    target: ['es2020'],
    logLevel: 'silent',
  });
  console.log(`  minified  assets/homepage.js → assets/homepage.min.js`);

  // gdi.css → assets/gdi.min.css
  minifyCss(
    path.join(ROOT, 'assets', 'gdi.css'),
    path.join(ROOT, 'assets', 'gdi.min.css')
  );

  // Copy sw.js from CDN repo if it exists there and not in main repo
  const swSrc = path.resolve(ROOT, '..', 'Google-Drive-Index-CDN', 'sw.js');
  const swDest = path.join(ROOT, 'sw.js');
  if (!fs.existsSync(swDest) && fs.existsSync(swSrc)) {
    fs.copyFileSync(swSrc, swDest);
    console.log(`  copied    sw.js from CDN repo`);
  } else if (fs.existsSync(swDest)) {
    console.log(`  ok        sw.js already in repo`);
  } else {
    console.warn(`  warning   sw.js not found — skipping`);
  }

  console.log(`\n✓ Build complete for v${version}`);
  console.log(`  CDN base: https://cdn.jsdelivr.net/npm/@googledrive/index@${version}/`);
  console.log(`\n  Next steps:`);
  console.log(`    1. git add src/app.min.js assets/gdi.min.css assets/homepage.min.js sw.js`);
  console.log(`    2. git add src/worker.js generator/worker.js assets/gdi.css package.json`);
  console.log(`    3. git commit -m "Release v${version}"`);
  console.log(`    4. git tag v${version} && git push && git push --tags`);
  console.log(`    5. npm publish --access public\n`);
}

run().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
