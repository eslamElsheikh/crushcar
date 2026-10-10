// Vendor sharp's linux-x64 binaries into .next/standalone/node_modules/@img.
//
// sharp resolves its native binding from @img/sharp-<platform>, which npm
// installs as an *optional* dependency. When the build runs on Windows it gets
// @img/sharp-win32-x64 instead, so server.zip ships a binary that cannot load
// on Linux and the payment-proof upload endpoint 500s on every request.
//
// This downloads the linux-x64 packages (architecture-independent of the build
// host) into the standalone tree so the artifact is deployable from any OS.
//
// Usage: node scripts/vendor-sharp-linux.mjs
// Reads the sharp version from the packaged client; override with SHARP_VERSION.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = process.cwd();
const STANDALONE = path.resolve(ROOT, process.env.SAFRO_STANDALONE || '.next/standalone');
const IMG = path.join(STANDALONE, 'node_modules', '@img');
const SHARP_DIR = path.join(STANDALONE, 'node_modules', 'sharp');

// libvips version is pinned per sharp release; these match the ones the
// installed sharp declares as optionalDependencies for linux-x64.
const LIBVIPS_BY_SHARP = {
  '0.35.5': '1.3.4',
  '0.34.4': '1.2.4',
  '0.33.5': '1.0.4',
  '0.32.6': '1.0.2',
};

function sharpVersion() {
  if (process.env.SHARP_VERSION) return process.env.SHARP_VERSION;
  try {
    return JSON.parse(fs.readFileSync(path.join(SHARP_DIR, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

const version = sharpVersion();
if (!version) {
  console.error('cannot read the packaged sharp version; run npm run build first');
  process.exit(2);
}

const libvips = LIBVIPS_BY_SHARP[version];
if (!libvips) {
  console.error(
    `sharp ${version} is not in the known table. Add its libvips version to LIBVIPS_BY_SHARP, or set SHARP_VERSION/LIBVIPS_VERSION.`
  );
  process.exit(2);
}

const packages = [
  { name: 'sharp-linux-x64', version },
  { name: 'sharp-libvips-linux-x64', version: libvips },
];

const TMP = path.join(ROOT, '.next', '.sharp-tmp');
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(IMG, { recursive: true });

for (const pkg of packages) {
  const tarball = path.join(TMP, `${pkg.name}.tgz`);
  const url = `https://registry.npmjs.org/@img/${pkg.name}/-/${pkg.name}-${pkg.version}.tgz`;

  console.log(`fetching ${pkg.name}@${pkg.version}`);
  execFileSync('curl', ['-sL', '--fail', '-o', tarball, url], { stdio: 'inherit' });

  const dest = path.join(IMG, pkg.name);
  fs.mkdirSync(dest, { recursive: true });
  // npm tarballs have a single "package/" root; strip it.
  execFileSync('tar', ['-xzf', tarball, '-C', dest, '--strip-components=1'], { stdio: 'inherit' });
  console.log(`  -> ${path.relative(ROOT, dest)}`);
}

fs.rmSync(TMP, { recursive: true, force: true });

// Prove it loads, so a broken download fails here rather than in production.
// Resolved from the package's own main field, not guessed.
console.log('\nverifying the vendored binaries load');
const sharpMain = JSON.parse(fs.readFileSync(path.join(SHARP_DIR, 'package.json'), 'utf8')).main;
const probe = path.join(ROOT, '.next', '.sharp-probe.cjs');
fs.writeFileSync(
  probe,
  `const sharp = require(${JSON.stringify(path.join(SHARP_DIR, sharpMain))});\n` +
    `sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })\n` +
    `  .webp().toBuffer()\n` +
    `  .then(b => { console.log('  sharp works, ' + b.length + ' bytes'); })\n` +
    `  .catch(e => { console.error('  sharp FAILED: ' + e.message.split('\\n')[0]); process.exit(1); });\n`
);
try {
  execFileSync(process.execPath, [probe], { stdio: 'inherit' });
} finally {
  fs.rmSync(probe, { force: true });
}

console.log('\nsharp linux-x64 binaries vendored into the standalone output.');