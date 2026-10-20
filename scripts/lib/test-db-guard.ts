/**
 * The guard that keeps a verification script off production.
 *
 * The verification scripts write rows, and some of them delete rows they did
 * not create: the platform wallet check clears the ledger, because the chain
 * check only means something against a ledger that starts empty. Against the
 * production database that would erase the record of every movement of the
 * platform's money. There is no undo for that.
 *
 * So the scripts refuse to run unless the database is unmistakably a test one.
 * The check is on the *name* of the database, not on a flag somebody might
 * forget to pass, and not on a comment.
 *
 * A test database is one whose name contains "test". Production's is
 * `safro_travel_db`, which does not, so it cannot pass. Names that look
 * production-ish are rejected outright even if they contain "test", so
 * "safro_travel_test_prod" cannot pass either.
 */

/** Name fragments that mean "this is the real thing" whatever else it says. */
const PRODUCTION_MARKERS = ['prod', 'live', 'safro_travel_db', 'safrotravel']

export class NotATestDatabaseError extends Error {
  constructor(readonly database: string, readonly reason: string) {
    super(
      `Refusing to run against "${database}": ${reason}.\n` +
        `These scripts create and delete rows, and some of them clear the\n` +
        `platform ledger, which cannot be undone. Point DATABASE_URL at a test\n` +
        `database — its name has to contain "test" — and run it again.`,
    )
    this.name = 'NotATestDatabaseError'
  }
}

/** The database name and kind, read from DATABASE_URL. */
export function describeDatabase(url = process.env.DATABASE_URL): { kind: 'mysql' | 'sqlite'; name: string } {
  if (!url) {
    throw new Error('DATABASE_URL is not set, so there is nothing to check')
  }

  if (url.startsWith('file:') || url.includes('.db') || url.includes('.sqlite')) {
    // A SQLite file. The whole path is kept, not just the file name: a file
    // under .scratch is a test file, and the directory is what says so.
    const raw = url.replace(/^file:/, '')
    return { kind: 'sqlite', name: raw }
  }

  const mysqlMatch = /^mysql:\/\/(?:[^@/]*@)?([^/?]*)\/([^?]*)/.exec(url)
  if (mysqlMatch) {
    return { kind: 'mysql', name: decodeURIComponent(mysqlMatch[2]) }
  }

  throw new Error(`Cannot tell what database "${url}" points at`)
}

/**
 * Whether the database is safe to write to and clear.
 *
 * This is the rule, and it is deliberately narrow.
 */
export function isTestDatabase(url = process.env.DATABASE_URL): { ok: boolean; reason: string; name: string } {
  let described: { kind: 'mysql' | 'sqlite'; name: string }
  try {
    described = describeDatabase(url)
  } catch (err) {
    return { ok: false, reason: (err as Error).message, name: '' }
  }

  const { kind, name } = described
  const lower = name.toLowerCase()

  if (!lower) {
    return { ok: false, reason: 'the database has no name', name }
  }

  if (PRODUCTION_MARKERS.some((marker) => lower.includes(marker))) {
    return { ok: false, reason: 'the name looks like a production database', name }
  }

  if (kind === 'mysql') {
    if (!lower.includes('test')) {
      return { ok: false, reason: 'a MySQL test database has to have "test" in its name', name }
    }
    return { ok: true, reason: '', name }
  }

  // SQLite: a file under .scratch, or a file whose name says it is a test.
  if (lower.includes('test') || lower.includes('.scratch')) {
    return { ok: true, reason: '', name }
  }
  return { ok: false, reason: 'a SQLite test file has to be under .scratch or have "test" in its name', name }
}

/**
 * Refuses to continue unless the database is a test one.
 *
 * Call this at the top of any script that writes to the database. It throws,
 * so the script stops before it has done anything.
 */
export function assertTestDatabase(url = process.env.DATABASE_URL): void {
  const result = isTestDatabase(url)
  if (!result.ok) {
    throw new NotATestDatabaseError(result.name, result.reason)
  }
}
