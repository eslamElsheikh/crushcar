import type { Prisma } from '@prisma/client'
import { dbDialect } from './prisma'

/**
 * Takes a row lock for the rest of the transaction.
 *
 * The reason this exists rather than a plain read-then-write: two requests
 * that both read a balance and then both write it can both believe they saw
 * the same number. Under the row lock the second one waits, and by the time it
 * reads, the first one's write is committed and visible.
 *
 * MariaDB/MySQL: SELECT ... FOR UPDATE takes an exclusive row lock.
 * SQLite: there is one writer, and a no-op UPDATE takes the write lock up
 * front instead of upgrading to it mid-transaction, which is where SQLite
 * answers SQLITE_BUSY. The two branches exist because the statement that
 * expresses the intent is not portable.
 *
 * The table name is interpolated, so it is checked against an allowlist: this
 * is not a place where a caller-supplied string may reach the query.
 */
const LOCKABLE_TABLES = new Set([
  'Company',
  'Trip',
  'Booking',
  'CompanyBooking',
  'PlatformWallet',
  'CompanyTripQuota',
  'CompanyRouteQuota',
])

export async function lockRow(
  tx: Prisma.TransactionClient,
  table: string,
  id: string,
): Promise<void> {
  if (!LOCKABLE_TABLES.has(table)) {
    throw new Error(`lockRow: ${table} is not a lockable table`)
  }
  if (dbDialect() === 'mysql') {
    await tx.$queryRawUnsafe(`SELECT id FROM \`${table}\` WHERE id = ? FOR UPDATE`, id)
  } else {
    await tx.$executeRawUnsafe(`UPDATE \`${table}\` SET id = id WHERE id = ?`, id)
  }
}
