/**
 * Exercises the production startup guard without booting a server.
 *
 * Run: npx tsx scripts/verify-env-guard.ts   (or: npm run check:env-guard)
 *
 * Covers the branches that are invisible in review: a missing secret, a short
 * one, the .env.example placeholder, an aliased name, and the fact that dev
 * and test never trip the guard at all.
 */
import {
  assertProductionSecrets,
  checkSecret,
  collectSecretProblems,
  describeFailure,
  EXAMPLE_SECRETS,
  MIN_SECRET_LENGTH,
} from '../src/lib/env-guard'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const GOOD = 'a'.repeat(44)

function main() {
  console.log('checkSecret — one value')
  check('accepts a long random secret', checkSecret('A', GOOD) === null)
  check(
    'rejects an empty value',
    checkSecret('A', '')?.reason === 'missing'
  )
  check(
    'rejects undefined',
    checkSecret('A', undefined)?.reason === 'missing'
  )
  check(
    'rejects whitespace only',
    checkSecret('A', '   ')?.reason === 'missing'
  )
  check(
    `rejects under ${MIN_SECRET_LENGTH} chars`,
    checkSecret('A', 'short')?.reason.includes('only 5 characters') === true,
    JSON.stringify(checkSecret('A', 'short'))
  )
  for (const example of EXAMPLE_SECRETS) {
    check(
      `rejects the example value "${example.slice(0, 24)}…"`,
      checkSecret('A', example)?.reason.includes('example') === true
    )
    // Case-insensitive, and it must not slip through with whitespace around it.
    check(
      `rejects the example value padded/cased oddly`,
      checkSecret('A', `  ${example.toUpperCase()}  `)?.reason.includes('example') === true
    )
  }

  console.log('collectSecretProblems — which names are read')
  check(
    'no secret at all reports AUTH_SECRET once',
    JSON.stringify(collectSecretProblems({})) ===
      JSON.stringify([{ name: 'AUTH_SECRET', reason: 'missing' }])
  )
  check(
    'AUTH_SECRET alone is enough',
    collectSecretProblems({ AUTH_SECRET: GOOD }).length === 0
  )
  check(
    'NEXTAUTH_SECRET alias alone is enough',
    collectSecretProblems({ NEXTAUTH_SECRET: GOOD }).length === 0
  )
  check(
    'a set-but-short AUTH_SECRET is reported',
    collectSecretProblems({ AUTH_SECRET: 'tooshort' }).length === 1
  )
  check(
    'AUTH_SECRET good + NEXTAUTH_SECRET bad is reported (both are set)',
    collectSecretProblems({ AUTH_SECRET: GOOD, NEXTAUTH_SECRET: 'x' }).length === 1
  )

  console.log('assertProductionSecrets — when it fires')
  // The three environments that must never trip it.
  for (const nodeEnv of ['development', 'test', undefined]) {
    const label = nodeEnv ?? '(unset)'
    let threw = false
    try {
      assertProductionSecrets({ NODE_ENV: nodeEnv, AUTH_SECRET: undefined })
    } catch {
      threw = true
    }
    check(`production-only: NODE_ENV=${label} boots without a secret`, threw === false)
  }

  // And the one that must.
  let prodError: Error | null = null
  try {
    assertProductionSecrets({ NODE_ENV: 'production', AUTH_SECRET: undefined })
  } catch (e) {
    prodError = e as Error
  }
  check('production + missing secret refuses to boot', prodError !== null)

  let placeholderError: Error | null = null
  try {
    assertProductionSecrets({
      NODE_ENV: 'production',
      AUTH_SECRET: EXAMPLE_SECRETS[0],
    })
  } catch (e) {
    placeholderError = e as Error
  }
  check(
    'production + .env.example placeholder refuses to boot',
    placeholderError !== null
  )

  let goodBoot = true
  try {
    assertProductionSecrets({ NODE_ENV: 'production', AUTH_SECRET: GOOD })
  } catch {
    goodBoot = false
  }
  check('production + real secret boots', goodBoot)

  console.log('describeFailure — what the operator sees')
  const message = describeFailure([
    { name: 'AUTH_SECRET', reason: 'missing' },
  ])
  check('names the variable', message.includes('AUTH_SECRET'))
  check('names the reason', message.includes('missing'))
  check('shows how to generate one', message.includes('randomBytes'))

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all checks passed')
}

main()
