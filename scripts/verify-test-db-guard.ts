/**
 * Proves the test-database guard actually refuses production.
 *
 * The guard is the only thing standing between a verification script and the
 * deletion of the platform's cash record, so it is tested rather than
 * trusted. A guard that has never been seen to refuse is not known to
 * refuse.
 *
 *   npx tsx scripts/verify-test-db-guard.ts
 *
 * It needs no database — it only inspects the URL.
 */
import { isTestDatabase, describeDatabase, NotATestDatabaseError } from './lib/test-db-guard'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function main() {
  // ── The production database must be refused ──────────────────────────
  const production = 'mysql://safro_user:s3cret@localhost:3306/safro_travel_db'
  check(
    'the production database is refused',
    !isTestDatabase(production).ok,
    `reason: ${isTestDatabase(production).reason}`
  )

  // ── A test database must be allowed ──────────────────────────────────
  for (const url of [
    'mysql://root:pass@127.0.0.1:3399/testdb',
    'mysql://root:pass@127.0.0.1:3306/safro_travel_test',
    'mysql://root:pass@db:3306/TEST_DB',
  ]) {
    check(`${url} is allowed`, isTestDatabase(url).ok, isTestDatabase(url).reason)
  }

  // ── The sneaky cases ─────────────────────────────────────────────────
  check(
    'a production-looking name is refused even with "test" in it',
    !isTestDatabase('mysql://u:p@h:3306/safro_travel_test_prod').ok
  )
  check(
    'a name containing "prod" is refused',
    !isTestDatabase('mysql://u:p@h:3306/mytest_production_copy').ok
  )
  check(
    'a name containing "live" is refused',
    !isTestDatabase('mysql://u:p@h:3306/livetest').ok
  )
  check(
    'a MySQL database without "test" in the name is refused',
    !isTestDatabase('mysql://u:p@h:3306/safro_travel_db').ok
  )
  check(
    'a MySQL database without "test" in the name is refused even if it is local',
    !isTestDatabase('mysql://root:pass@127.0.0.1:3306/walletdb').ok
  )

  // ── SQLite ───────────────────────────────────────────────────────────
  check(
    'a SQLite file under .scratch is allowed',
    isTestDatabase('file:../.scratch/e2e.db').ok
  )
  check(
    'a SQLite file with "test" in the name is allowed',
    isTestDatabase('file:../.scratch/test.db').ok
  )
  check(
    'a SQLite file outside .scratch without "test" is refused',
    !isTestDatabase('file:../prisma/dev.db').ok
  )
  check(
    'a SQLite file that looks like production is refused',
    !isTestDatabase('file:../prisma/prod.db').ok
  )

  // ── Missing or unreadable URLs ───────────────────────────────────────
  check('a missing URL is refused', !isTestDatabase('').ok)
  check('an unreadable URL is refused', !isTestDatabase('not-a-url').ok)

  // ── The error message says why ───────────────────────────────────────
  let thrown: unknown = null
  try {
    // The guard has to throw, not merely return false, or a script that
    // forgets to check the return value would carry on regardless.
    const { assertTestDatabase } = require('./lib/test-db-guard')
    assertTestDatabase(production)
  } catch (err) {
    thrown = err
  }
  check(
    'assertTestDatabase throws on production',
    thrown instanceof NotATestDatabaseError,
    String(thrown)
  )
  check(
    'the error names the database and the reason',
    thrown instanceof NotATestDatabaseError &&
      thrown.message.includes('safro_travel_db') &&
      thrown.message.includes('test')
  )

  // ── The database name is read correctly ──────────────────────────────
  check(
    'the MySQL database name is read from the URL',
    describeDatabase(production).name === 'safro_travel_db'
  )
  check(
    'a URL with no port still yields the name',
    describeDatabase('mysql://u:p@h/db_test').name === 'db_test'
  )
  check(
    'the SQLite path is read from the URL',
    describeDatabase('file:../.scratch/e2e.db').name.endsWith('e2e.db')
  )

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
