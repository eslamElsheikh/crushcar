#!/usr/bin/env node
/**
 * Fails when a route is rendered with its operands reversed for RTL, or with an
 * arrow that ignores the direction.
 *
 * In an RTL context the bidi algorithm already lays the text out right-to-left,
 * so `${origin} ← ${destination}` reads correctly with nothing but the glyph
 * changed. Writing `${destination} ← ${origin}` instead does not "fix" the
 * direction, it inverts it: the card title then reads Mansoura ← Hurghada while
 * the stop list printed underneath it on the same card reads the opposite way.
 *
 * Twenty-six copies of that mistake existed before this check. Every screen now
 * builds its label through src/lib/route-label.ts; this fails if the inline
 * form comes back.
 *
 * Usage: node scripts/check-route-labels.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const SRC = 'src'

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

// `${...destination...} ← ${...origin...}`
const REVERSED_TRIP =
  /\$\{[^}]*\bdestination\b[^}]*\}\s*←\s*\$\{[^}]*\borigin\b[^}]*\}/g
// `${...toStation...} ← ${...fromStation...}`
const REVERSED_STATION =
  /\$\{[^}]*\btoStation\b[^}]*\}\s*←\s*\$\{[^}]*\bfromStation\b[^}]*\}/g
// `{something.origin} → {something.destination}` with no direction flag
const IGNORED_DIRECTION =
  /\.origin\}\s*→\s*\{[^}]*destination/g
// `origin → destination` as plain JSX text
const PLAIN_TEXT_ARROW =
  /origin\s*→\s*destination\b/g

const CHECKS = [
  { re: REVERSED_TRIP, label: 'destination before origin (reversed)' },
  { re: REVERSED_STATION, label: 'toStation before fromStation (reversed)' },
  { re: IGNORED_DIRECTION, label: 'arrow between origin and destination with no direction flag' },
  { re: PLAIN_TEXT_ARROW, label: 'plain "origin → destination" instead of a direction-aware label' },
]

/**
 * Blanks out comments while keeping every newline, so reported line numbers
 * still match the file. Without this the check fires on prose — including the
 * doc comment in route-label.ts that documents the exact mistake it forbids —
 * and a guard that cries wolf gets switched off.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, lead) => lead)
}

const findings = []
let scanned = 0

for (const file of walk(SRC)) {
  scanned++
  const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/)
  for (const { re, label } of CHECKS) {
    lines.forEach((line, i) => {
      re.lastIndex = 0
      if (re.test(line)) {
        findings.push(`${label}\n    ${relative('.', file)}:${i + 1}\n      ${line.trim()}`)
      }
    })
  }
}

if (findings.length) {
  console.error(`\n✗ ${findings.length} route label(s) rendered the wrong way round:\n`)
  console.error(findings.join('\n\n'))
  console.error(
    '\nBuild route text with routeLabel(origin, destination, isRTL) from src/lib/route-label.ts.\n' +
      'Operands stay in logical order; only the arrow glyph changes with the direction.\n',
  )
  process.exit(1)
}

console.log(`✓ route labels are direction-correct across ${scanned} source files`)
