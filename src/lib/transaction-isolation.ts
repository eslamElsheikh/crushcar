import { Prisma } from '@prisma/client'
import { dbDialect } from './prisma'

/**
 * The isolation level the booking and money transactions run at.
 *
 * The default on MariaDB is REPEATABLE READ, and under it a transaction
 * reads a snapshot taken at its first read and keeps it for the rest of its
 * life. That is the wrong shape for a limit check.
 *
 * The seat counters are ordinary reads — a count of the bookings a company
 * already holds on a route. Under a snapshot they do not see a booking that
 * another transaction committed a moment earlier, so two bookings made at the
 * same time can both see the same free seats and both take them. The row
 * locks are in place and they do serialise the transactions; the problem is
 * that the count behind the lock is still looking at the old snapshot, taken
 * before the lock was acquired.
 *
 * READ COMMITTED makes every statement read the latest committed data. The
 * count then happens after the quota row has been locked, so it sees the
 * transaction that held the lock before us, and the limit is the limit.
 *
 * This is not a performance trade: the rows that matter are the ones already
 * locked, so the extra reads are of rows nobody else is changing.
 *
 * SQLite has no READ COMMITTED — its transactions serialise by design — and
 * the local client generated from prisma/schema.prisma rejects the value the
 * moment this module is imported, which took every route below down with a
 * module-load error before it could answer even an unauthenticated request.
 * Local therefore omits the option; the MariaDB client behind
 * prisma/schema.mysql.prisma keeps READ COMMITTED exactly as before. This is
 * the same dbDialect() split the raw-SQL booking-reference counter follows.
 */
type IsolationLevel =
  (typeof Prisma.TransactionIsolationLevel)[keyof typeof Prisma.TransactionIsolationLevel]

export const BOOKING_ISOLATION: { isolationLevel?: IsolationLevel } =
  dbDialect() === 'mysql'
    ? { isolationLevel: (Prisma.TransactionIsolationLevel as any).ReadCommitted }
    : {}
