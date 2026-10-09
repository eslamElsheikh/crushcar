#!/usr/bin/env node
/**
 * Fails when a `t('some.key')` call in src/ references a key that lang.ts does
 * not define. Missing keys render as the raw key ("company.noBookings") because
 * t() falls back to returning its input — that is a user-visible bug, not a
 * cosmetic one, so it is checked in CI instead of being rediscovered by eye.
 *
 * Usage: node scripts/check-lang-keys.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const SRC = 'src'
const LANG = join(SRC, 'lib', 'lang.ts')

const defined = new Set()
const langSrc = readFileSync(LANG, 'utf8')
for (const m of langSrc.matchAll(/'([a-zA-Z][\w.]*)':\s*\{/g)) defined.add(m[1])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      out.push(...walk(full))
    } else if (['.ts', '.tsx'].includes(extname(full))) {
      out.push(full)
    }
  }
  return out
}

// t('key') and t('key', ...) — ignore t(`...`) template calls, they are dynamic.
const used = new Map()
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
    const key = m[1]
    if (!key.includes('.')) continue // status codes like t('PAID')
    if (!used.has(key)) used.set(key, new Set())
    used.get(key).add(file)
  }
}

const missing = [...used.entries()]
  .filter(([key]) => !defined.has(key))
  .map(([key, files]) => `${key}\n    ${[...files].join('\n    ')}`)

if (missing.length) {
  console.error(`\n✗ ${missing.length} missing translation key(s):\n`)
  console.error(missing.join('\n\n'))
  console.error('\nAdd them to src/lib/lang.ts with { ar, en } for both languages.\n')
  process.exit(1)
}

console.log(`✓ all ${used.size} translation keys used in src/ are defined in lang.ts`)