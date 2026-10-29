// Assembles the FULL production app tree into deploy/standalone-app/, then zips
// it (forward slashes, .env excluded) into deploy/app.zip for the CI pipeline.
//
// Production deploys to TWO targets (see docs/deploy/PIPELINE.md):
//   travel-app/.next/standalone      <- Passenger runs server.js from here
//   public_html/_next/static/<id>/   <- Apache serves JS/CSS from here
// The agent extracts this zip to the first and mirrors .next/static/** to the
// second, so the .next/static subtree MUST be present in the zip (including its
// per-BUILD_ID directory) or pages 404 while /api/health stays green.
//
// One atomic zip, so the agent never extracts a half-consistent set:
//   standalone-app/
//     server.js, .next/**   <- .next/standalone/**   (server code)
//     .next/static/**       <- .next/static/**       (client assets; also
//                              mirrored to public_html/_next/static)
//     public/**             <- public/**
//     prisma/schema.prisma  <- prisma/schema.mysql.prisma (MySQL provider!)
//     node_modules/**       <- standalone node_modules (linux engines from CI)
//
// Usage: node scripts/assemble-standalone.mjs   (run after `next build`)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'deploy');
const appDir = path.join(outDir, 'standalone-app');

const standalone = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');
const mysqlSchema = path.join(root, 'prisma', 'schema.mysql.prisma');

function fail(msg) {
  console.error(`[assemble] FATAL: ${msg}`);
  process.exit(1);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// --- Preconditions (same guard rails as scripts/deploy.mjs) -----------------
if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  fail(`missing ${path.relative(root, standalone)}/server.js — run \`next build\` first (output: standalone)`);
}
if (!fs.existsSync(path.join(staticDir, 'chunks'))) {
  fail(`missing ${path.relative(root, staticDir)}/chunks — client assets not built`);
}
if (!fs.existsSync(mysqlSchema)) {
  fail('missing prisma/schema.mysql.prisma');
}
const buildId = fs.readFileSync(path.join(root, '.next', 'BUILD_ID'), 'utf8').trim();
if (!buildId) fail('empty .next/BUILD_ID');

// Prisma schema provider sanity (the Windows/MySQL mixup class of bug).
const schemaText = fs.readFileSync(mysqlSchema, 'utf8');
if (!/provider\s*=\s*"mysql"/.test(schemaText)) {
  fail('prisma/schema.mysql.prisma does not declare provider = "mysql"');
}
if (/provider\s*=\s*"sqlite"/.test(schemaText)) {
  fail('prisma/schema.mysql.prisma contains a sqlite provider');
}

// --- Assemble ---------------------------------------------------------------
rmrf(appDir);
fs.mkdirSync(appDir, { recursive: true });

// 1. standalone tree (server code + node_modules). The standalone dir contains
//    its own .next/ (server chunks) — copy it first, then overlay static.
copyDir(standalone, appDir);

// standalone ships a stub public/ and may ship a stub .next/static; replace them.
rmrf(path.join(appDir, 'public'));
rmrf(path.join(appDir, '.next', 'static'));

copyDir(publicDir, path.join(appDir, 'public'));
copyDir(staticDir, path.join(appDir, '.next', 'static'));

// 2. MySQL Prisma schema under the path Prisma Client resolves at runtime.
copyFile(mysqlSchema, path.join(appDir, 'prisma', 'schema.prisma'));

// 3. Prune: never let a stray env file reach the server (zip step re-checks).
const strayEnv = path.join(appDir, '.env');
if (fs.existsSync(strayEnv)) {
  console.warn('[assemble] removing stray .env from assembled tree');
  fs.rmSync(strayEnv);
}

// --- Report -----------------------------------------------------------------
function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += countFiles(p);
    else n += 1;
  }
  return n;
}
const files = countFiles(appDir);
for (const marker of ['server.js', '.next/BUILD_ID', '.next/static', 'public', 'prisma/schema.prisma', 'node_modules']) {
  if (!fs.existsSync(path.join(appDir, marker))) fail(`assembled tree missing ${marker}`);
}
const shippedId = fs.readFileSync(path.join(appDir, '.next', 'BUILD_ID'), 'utf8').trim();
if (shippedId !== buildId) fail(`assembled BUILD_ID ${shippedId} != build BUILD_ID ${buildId}`);

console.log(`[assemble] ok: build=${buildId} files=${files} -> ${path.relative(root, appDir)}`);
