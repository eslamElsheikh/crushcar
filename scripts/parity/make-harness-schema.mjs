// Builds the harness schema: a copy of prisma/schema.prisma whose client is
// emitted next to the parity harness instead of into node_modules.
//
// The copy is generated rather than committed on purpose. A committed copy would
// silently drift from the real schema, and the harness exists precisely to catch
// drift. node_modules keeps the MySQL client that production builds with.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = join(root, 'prisma', 'schema.prisma');
const out = join(root, 'prisma', 'schema.harness.prisma');

const GENERATOR_RE = /generator client \{[^}]*\}/;
const replacement = [
  'generator client {',
  '  provider = "prisma-client-js"',
  '  output   = "../scripts/parity/.generated"',
  '}',
].join('\n');

const schema = readFileSync(src, 'utf8');
if (!GENERATOR_RE.test(schema)) {
  console.error(`No generator block found in ${src}`);
  process.exit(1);
}
writeFileSync(out, schema.replace(GENERATOR_RE, replacement));
console.log(`wrote ${out}`);

// execSync rather than execFileSync: npx is a .cmd shim on Windows, which
// execFileSync refuses to spawn directly.
execSync('npx prisma generate --schema=prisma/schema.harness.prisma', {
  cwd: root,
  stdio: 'inherit',
});