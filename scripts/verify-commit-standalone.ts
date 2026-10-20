/**
 * Checks that each commit stands on its own.
 *
 * Two things can go wrong when a change is split across commits:
 *
 *   1. a file imports something that only arrives in a later commit, so the
 *      earlier commit does not build;
 *   2. a file uses a database model that only arrives in a later commit, so
 *      the earlier commit does not typecheck.
 *
 * Both are checked here, for every commit, against that commit's own tree.
 * No build and no database are needed.
 *
 *   npx tsx scripts/verify-commit-standalone.ts <base> <commit> [<commit>...]
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('usage: verify-commit-standalone.ts <base> <commit> [<commit>...]')
  process.exit(2)
}

let failures = 0
function fail(msg: string) {
  failures++
  console.error(`  FAIL  ${msg}`)
}

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Every .ts/.tsx file in the tree, relative to it. */
function sourceFiles(root: string): string[] {
  const out: string[] = []
  const skip = new Set(['node_modules', '.git', '.next', '.next-dev', 'public', 'node_modules'])
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue
      const full = path.join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
        out.push(path.relative(root, full))
      }
    }
  }
  walk(root)
  return out
}

/** The models a Prisma schema declares. */
function modelsIn(schema: string): Set<string> {
  const text = readFileSync(schema, 'utf8')
  const out = new Set<string>()
  for (const m of text.matchAll(/^model\s+(\w+)\s*\{/gm)) out.add(m[1])
  return out
}

/** The prisma.<model> accesses a file makes. */
function modelsUsed(files: string[], root: string): Map<string, string[]> {
  const used = new Map<string, string[]>()
  for (const rel of files) {
    const text = readFileSync(path.join(root, rel), 'utf8')
    for (const m of text.matchAll(/\bprisma\.([a-zA-Z]\w*)\./g)) {
      const list = used.get(m[1]) ?? []
      list.push(rel)
      used.set(m[1], list)
    }
  }
  return used
}

const base = args[0]
const commits = args.slice(1)

console.log(`checking ${commits.length} commit(s) for standalone-ness against ${base}\n`)

for (const commit of commits) {
  const subject = git(['log', '-1', '--format=%s', commit]).trim()
  const hash = git(['rev-parse', '--short', commit]).trim()
  console.log(`${hash}  ${subject}`)

  const root = mkdtempSync(path.join(tmpdir(), 'commit-check-'))
  try {
    // The tree as it is at this commit.
    git(['archive', '--format=tar', commit], process.cwd())
    const tar = execFileSync('git', ['archive', '--format=tar', '-o', path.join(root, 'tree.tar'), commit])
    void tar
    execFileSync('tar', ['-xf', path.join(root, 'tree.tar'), '-C', root])
    rmSync(path.join(root, 'tree.tar'))

    const files = sourceFiles(root)
    // One spelling for every path: forward slashes, relative to the root.
    const fileSet = new Set(files.map((f) => f.split(path.sep).join('/')))

    // 1. Relative imports must resolve inside this tree.
    const unresolved: string[] = []
    for (const rel of files) {
      const text = readFileSync(path.join(root, rel), 'utf8')
      const relPosix = rel.split(path.sep).join('/')
      for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const spec = m[1]
        // Resolve the spec against the importing file, in posix terms.
        const dir = path.posix.dirname(relPosix)
        const resolvedPosix = path.posix.normalize(path.posix.join(dir, spec))
        const candidates = [
          `${resolvedPosix}.ts`,
          `${resolvedPosix}.tsx`,
          `${resolvedPosix}.mts`,
          `${resolvedPosix}/index.ts`,
          `${resolvedPosix}/index.tsx`,
        ]
        if (!candidates.some((c) => fileSet.has(c))) {
          unresolved.push(`${relPosix} -> ${spec}`)
        }
      }
    }
    if (unresolved.length === 0) {
      console.log(`  PASS  every relative import resolves in this tree`)
    } else {
      for (const u of unresolved.slice(0, 10)) fail(`unresolved import: ${u}`)
      if (unresolved.length > 10) fail(`... and ${unresolved.length - 10} more`)
    }

    // 2. The prisma models a file touches must exist in this tree's schema.
    const schemaPath = ['prisma/schema.prisma', 'prisma/schema.mysql.prisma'].find((p) =>
      existsSync(path.join(root, p)),
    )
    if (!schemaPath) {
      fail('no prisma schema in this tree')
    } else {
      const models = modelsIn(path.join(root, schemaPath))
      // Prisma's client lower-cases the first letter of the model name:
      // `model Booking` is `prisma.booking`. So the comparison is on the
      // lower-cased form of both sides.
      const lowerModels = new Set([...models].map((m) => m.toLowerCase()))
      const used = modelsUsed(files, root)
      // Prisma's own API surface, not models.
      const notModels = new Set(['$transaction', '$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe', '$disconnect', '$connect', '$on', '$extends'])
      const missing: string[] = []
      for (const [name, where] of used) {
        if (notModels.has(name)) continue
        if (lowerModels.has(name.toLowerCase())) continue
        missing.push(`${name} (used in ${where[0]})`)
      }
      if (missing.length === 0) {
        console.log(`  PASS  every prisma model it uses exists in this tree's schema`)
      } else {
        for (const m of missing.slice(0, 10)) fail(`model not in schema: ${m}`)
        if (missing.length > 10) fail(`... and ${missing.length - 10} more`)
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  console.log('')
}

console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
