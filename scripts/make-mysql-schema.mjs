// Derives prisma/schema.mysql.prisma from prisma/schema.prisma (SQLite dev schema).
// - provider sqlite -> mysql
// - @db.Text on long free-text String fields (MySQL VARCHAR(191) default is too
//   small for answers/notes/reasons/descriptions; TEXT has no such trap).
// - binaryTargets: configurable via MYSQL_BINARY_TARGETS env (comma-separated,
//   e.g. "native,debian-openssl-3.0.x"). Default ["native","debian-openssl-3.0.x"].
//   PROD OS IS UNKNOWN until `cat /etc/os-release; openssl version` output is
//   provided — do NOT assume debian. Candidates: debian-openssl-1.1.x,
//   debian-openssl-3.0.x, rhel-openssl-1.0.x, rhel-openssl-3.0.x
//   (CloudLinux is RHEL-family: if OpenSSL is 1.1 use rhel-openssl-1.0.x,
//   if 3.0 use rhel-openssl-3.0.x; `native` always resolves on the generating
//   host). The binding mechanism remains server-side `prisma generate`
//   (DEPLOY.md step 6), which resolves `native` automatically.
// - Everything else (Boolean->TINYINT(1), DateTime->DATETIME(3), Json->JSON,
//   Float->DOUBLE) is mapped natively by Prisma: no schema edits needed.
// Run: node scripts/make-mysql-schema.mjs [--check]
// --check exits non-zero when the two schemas drift (models/fields mismatch).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const SRC = path.join(rootDir, 'prisma', 'schema.prisma');
const DST = path.join(rootDir, 'prisma', 'schema.mysql.prisma');

// Long free-text fields that must be TEXT on MySQL (name -> reason).
const TEXT_FIELDS = new Map([
  ['answerAr', 'FAQ answers can exceed 191 chars'],
  ['answerEn', 'FAQ answers can exceed 191 chars'],
  ['notes', 'free-text notes'],
  ['adminNotes', 'free-text admin notes'],
  ['cancellationReason', 'free-text reason'],
  ['description', 'wallet/ledger descriptions'],
  ['metadata', 'audit JSON metadata can exceed 191 chars'],
]);

function convert(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const adjusted = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*provider\s*=\s*"prisma-client-js"\s*$/.test(line)) {
      out.push(line);
      const targets = (process.env.MYSQL_BINARY_TARGETS || 'native,debian-openssl-3.0.x')
        .split(',').map((s) => s.trim()).filter(Boolean);
      out.push(`  binaryTargets = [${targets.map((t) => `"${t}"`).join(', ')}]`);
      continue;
    }
    if (/^\s*provider\s*=\s*"sqlite"\s*$/.test(line)) {
      line = line.replace('"sqlite"', '"mysql"');
    } else {
      const m = line.match(/^(\s*)(\w+)(\s+String)(\?)?(.*)$/);
      if (m && TEXT_FIELDS.has(m[2]) && !line.includes('@db.Text')) {
        const [, indent, name, type, opt, rest] = m;
        // NOTE: @default(...) is KEPT in the Prisma schema (client-side
        // defaults keep working). MySQL ERROR 1101 forbids DEFAULT on TEXT,
        // so the generated init-mysql.sql is post-processed to drop DEFAULT
        // clauses on TEXT columns only (see strip-text-defaults step).
        line = `${indent}${name}${type}${opt || ''} @db.Text${rest}`;
        adjusted.push({ line: i + 1, field: name, reason: TEXT_FIELDS.get(name) });
      }
    }
    out.push(line);
  }
  return { text: out.join('\n'), adjusted };
}

function parseModels(text) {
  // model Name { ... } -> Map(fieldName -> {type, required, default})
  const models = new Map();
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const fields = new Map();
    for (const raw of m[2].split('\n')) {
      const line = raw.split('//')[0];
      const f = line.match(/^\s*(\w+)\s+(\w+)(\?|\[\])?/);
      if (!f) continue;
      const [, name, type, mod] = f;
      if (['@@index', '@@unique', '@@map', '@@id'].some((k) => name.startsWith(k.replace(/[@]/g, '')) && raw.includes('@@'))) continue;
      if (raw.trim().startsWith('@@')) continue;
      fields.set(name, { type, required: !mod, def: /@default\(([^)]*)\)/.exec(line)?.[1] ?? null });
    }
    models.set(m[1], fields);
  }
  return models;
}

const srcText = fs.readFileSync(SRC, 'utf8');
const { text, adjusted } = convert(srcText);

if (process.argv.includes('--check')) {
  if (!fs.existsSync(DST)) {
    console.error('MISSING: prisma/schema.mysql.prisma (run without --check first)');
    process.exit(2);
  }
  const dstText = fs.readFileSync(DST, 'utf8');
  const a = parseModels(srcText);
  const b = parseModels(dstText);
  let drift = 0;
  for (const [model, fields] of a) {
    if (!b.has(model)) { console.error(`DRIFT: model ${model} missing in mysql schema`); drift++; continue; }
    for (const [name, f] of fields) {
      const g = b.get(model).get(name);
      if (!g) { console.error(`DRIFT: ${model}.${name} missing in mysql schema`); drift++; continue; }
      const defOk = (g.def || null) === (f.def || null);
      if (g.type !== f.type || g.required !== f.required || !defOk) {
        console.error(`DRIFT: ${model}.${name} differs: ${JSON.stringify(f)} vs ${JSON.stringify(g)}`);
        drift++;
      }
    }
    for (const name of b.get(model).keys()) {
      if (!fields.has(name)) { console.error(`DRIFT: ${model}.${name} extra in mysql schema`); drift++; }
    }
  }
  for (const model of b.keys()) {
    if (!a.has(model)) { console.error(`DRIFT: model ${model} extra in mysql schema`); drift++; }
  }
  if (!dstText.includes('provider = "mysql"')) { console.error('DRIFT: mysql provider missing'); drift++; }
  console.log(drift === 0 ? 'SCHEMAS IN SYNC' : `DRIFT FOUND: ${drift} issue(s)`);
  process.exit(drift === 0 ? 0 : 1);
}

fs.writeFileSync(DST, text);
console.log(`wrote ${path.relative(rootDir, DST)}`);
console.log('provider: sqlite -> mysql');
console.log(`@db.Text adjustments (${adjusted.length}):`);
for (const adj of adjusted) console.log(`  line ${adj.line}: ${adj.field} — ${adj.reason}`);

// Post-process a migrate-diff SQL file: drop DEFAULT clauses on TEXT columns
// only (MySQL ERROR 1101). Prisma client-side @defaults keep working, so
// runtime behavior is unchanged.
export function stripTextDefaults(sql) {
  const textCols = new Set([...TEXT_FIELDS.keys()].map((n) => n.toLowerCase()));
  return sql.split('\n').map((line) => {
    const m = line.match(/^\s*`(\w+)`\s+TEXT\b(.*)$/);
    if (m && textCols.has(m[1].toLowerCase())) {
      return line.replace(/\s+DEFAULT\s+('[^']*'|"[^"]*"|[^\s,]+)/, '');
    }
    return line;
  }).join('\n');
}

if (process.argv.includes('--fix-sql')) {
  const idx = process.argv.indexOf('--fix-sql');
  const sqlPath = process.argv[idx + 1];
  if (!sqlPath) { console.error('usage: --fix-sql <path>'); process.exit(2); }
  const before = fs.readFileSync(sqlPath, 'utf8');
  const after = stripTextDefaults(before);
  fs.writeFileSync(sqlPath, after);
  const removed = (before.match(/TEXT[^\n]*DEFAULT/gi) || []).length;
  console.log(`stripped ${removed} TEXT DEFAULT clause(s) in ${sqlPath}`);
}
