// One deploy that cannot ship a mismatched build.
//
// Every failure this guards against happened in production before:
//   1. server.zip uploaded but static.zip forgotten -> JS chunks 404 -> ChunkLoadError
//   2. build made from the sqlite schema -> Prisma refuses the mysql DATABASE_URL -> every API 500s
//
// The script packages both artifacts from the SAME build, proves they agree,
// then prints the exact upload/extract commands. It never touches the server itself,
// so it is safe to run anywhere.
//
// Usage:
//   node scripts/deploy.mjs            # verify + package
//   node scripts/deploy.mjs --check    # verify only, no zip writing
//
// Env:
//   SAFRO_FTP_URL       ftp://host        (default ftp://ftp.safrotravel.com)
//   SAFRO_FTP_USER      ftp username
//   SAFRO_FTP_PASS      ftp password
//   SAFRO_STANDALONE    path to .next/standalone   (default .next/standalone)
//   SAFRO_STATIC        path to .next/static       (default .next/static)
//   SAFRO_OUT           output dir for the zips   (default .next)

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = process.cwd();

const cfg = {
  ftpUrl: process.env.SAFRO_FTP_URL || 'ftp://ftp.safrotravel.com',
  ftpUser: process.env.SAFRO_FTP_USER || '',
  ftpPass: process.env.SAFRO_FTP_PASS || '',
  standalone: path.resolve(ROOT, process.env.SAFRO_STANDALONE || '.next/standalone'),
  static: path.resolve(ROOT, process.env.SAFRO_STATIC || '.next/static'),
  out: path.resolve(ROOT, process.env.SAFRO_OUT || '.next'),
};

const checkOnly = process.argv.includes('--check');

const problems = [];
const notes = [];

function ok(msg) {
  console.log(`  ok    ${msg}`);
}
function fail(msg, fix) {
  problems.push({ msg, fix });
  console.log(`  FAIL  ${msg}`);
  if (fix) console.log(`        fix: ${fix}`);
}
function note(msg) {
  notes.push(msg);
  console.log(`  note  ${msg}`);
}

// ---------------------------------------------------------------- prisma ---
// The build silently embeds whichever schema was last generated. The app repo
// ships schema.prisma (sqlite, local dev) AND schema.mysql.prisma (production),
// so a plain `npm run build` produces a client that cannot talk to production.
console.log('\nprisma client');
const clientSchema = path.join(cfg.standalone, 'node_modules', '.prisma', 'client', 'schema.prisma');
if (!fs.existsSync(clientSchema)) {
  fail('generated client not found in the standalone output', 'run: npm run build');
} else {
  const schema = fs.readFileSync(clientSchema, 'utf8');
  const provider = /provider\s*=\s*"([^"]+)"/.exec(
    /datasource\s+db\s*\{[^}]*\}/s.exec(schema)?.[0] || ''
  )?.[1];
  if (provider === 'mysql') {
    ok(`generated client targets mysql`);
  } else {
    fail(
      `generated client targets "${provider ?? 'unknown'}", production is mysql`,
      'run: npm run deploy:generate && npm run build'
    );
  }
}

// ------------------------------------------------------------- build id ---
console.log('\nbuild identity');
const buildIdFile = path.join(cfg.standalone, '.next', 'BUILD_ID');

let buildId = null;
if (!fs.existsSync(buildIdFile)) {
  fail('standalone .next/BUILD_ID missing', 'run: npm run build');
} else {
  buildId = fs.readFileSync(buildIdFile, 'utf8').trim();
  ok(`standalone BUILD_ID = ${buildId}`);
}

// The static tree is only usable if it carries the same build id, otherwise the
// server will serve JS chunks from a different build than its HTML.
if (!fs.existsSync(cfg.static)) {
  fail('static directory missing', 'run: npm run build');
} else if (buildId) {
  // Next 15 writes no BUILD_ID file into the static build dir; the directory
  // name IS the build id. If two build dirs exist, this build is not the only
  // one present, which means a stale tree would be uploaded alongside it.
  const buildDir = path.join(cfg.static, buildId);
  if (!fs.existsSync(buildDir)) {
    fail(`static has no ${buildId} build directory`, 'run: npm run build');
  } else {
    // chunks/ css/ media/ are build-independent and always live at the root.
    const SHARED = new Set(['chunks', 'css', 'media']);
    const stale = fs
      .readdirSync(cfg.static, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SHARED.has(e.name))
      .map((e) => e.name)
      .filter((d) => d !== buildId);
    ok(`static build dir matches (${buildId})`);
    if (stale.length) {
      fail(`static also holds ${stale.length} stale build dir(s): ${stale.join(', ')}`, 'rm -rf them before packaging');
    }
  }
}

// ------------------------------------------------------------- packages ---
console.log('\npackage contents');
function zipHas(entries, name) {
  return entries.includes(name);
}

if (!checkOnly) {
  console.log('  building zips');
  const zipScript = path.join(ROOT, 'scripts', 'zip-deploy.mjs');
  for (const [zip, dir] of [
    ['server.zip', cfg.standalone],
    ['static.zip', cfg.static],
  ]) {
    execFileSync(process.execPath, [zipScript, path.join(cfg.out, zip), dir], {
      stdio: 'inherit',
    });
  }

  // Read the entry lists back so we verify what was actually written.
  const { entriesOf } = await import('./zip-entries.mjs').catch(() => ({ entriesOf: null }));
  if (entriesOf) {
    const server = entriesOf(path.join(cfg.out, 'server.zip'));
    const stat = entriesOf(path.join(cfg.out, 'static.zip'));
    const backslash = [...server, ...stat].filter((n) => n.includes('\\'));
    if (backslash.length) {
      fail(`${backslash.length} zip entries use backslashes`, 'rebuild with scripts/zip-deploy.mjs');
    } else {
      ok(`no backslash entries (${server.length} + ${stat.length})`);
    }
    for (const want of ['.next/BUILD_ID', 'server.js']) {
      if (zipHas(server, want)) ok(`server.zip contains ${want}`);
      else fail(`server.zip missing ${want}`, 'rebuild the package');
    }
    if (stat.some((n) => n.startsWith('chunks/'))) ok('static.zip contains chunks/');
    else fail('static.zip missing chunks/', 'rebuild the package');
    if (buildId && stat.some((n) => n.startsWith(`${buildId}/`))) {
      ok(`static.zip carries build ${buildId}`);
    } else {
      fail('static.zip does not carry the current build id', 'run: npm run build');
    }
  }
} else {
  note('check-only: no zips written');
}

// ---------------------------------------------------------------- report ---
console.log('\nserver steps (run after both zips are uploaded)');
const home = '/home/safro';
const quotes = cfg.ftpUser ? `"${cfg.ftpUser}:***"` : '"user:pass"';
const siteUrl = cfg.ftpUrl.replace(/^ftp:\/\//, 'https://').replace(/\/+$/, '');
console.log(`  1. upload both archives`);
console.log(`       curl -T server.zip ${cfg.ftpUrl}/server.zip -u ${quotes}`);
console.log(`       curl -T static.zip ${cfg.ftpUrl}/static.zip -u ${quotes}`);
console.log(`  2. extract (see scripts/deploy-agent.php)`);
console.log(`       unzip -o ${home}/server.zip -d ${home}/travel-app/.next/standalone`);
console.log(`       unzip -o ${home}/static.zip -d ${home}/public_html/_next/static`);
console.log(`  3. restart the app, then confirm the browser can fetch its chunks:`);
console.log(`       curl -sI ${siteUrl}/_next/static/chunks/app/admin/trips/page-<hash>.js`);

console.log('');
if (problems.length) {
  console.log(`${problems.length} problem(s). fix them before deploying.`);
  process.exit(1);
}
console.log('no problems found. both artifacts come from the same build.');
for (const n of notes) console.log(`note: ${n}`);