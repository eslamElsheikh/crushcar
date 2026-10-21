import { Prisma } from '@prisma/client'

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
 */
export const BOOKING_ISOLATION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const
