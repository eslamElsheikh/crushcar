import type { Prisma, PrismaClient } from '@prisma/client'
import { lockRow } from './row-lock'
import {
  SEAT_HOLDING_STATUSES,
  effectiveMaxSeatsPerBooking,
  effectiveTripQuota,
  fitsQuota,
  type CompanyLimitFields,
} from './booking-limits'
import { routeDayKeyOfTrip } from './route-key'

/**
 * The seat limits that apply to one company booking, and the decision about
 * whether it fits.
 *
 * Both booking paths go through here — a company booking its own seats and a
 * super admin booking on a company's behalf. The rules are the rules; having
 * one copy of them is what stops the two paths from drifting apart, which is
 * exactly how the same status ended up with two different colours and two
 * different refund policies in this codebase before.
 *
 * Three ceilings, and the effective limit is the smallest that applies:
 *
 *   1. the hard per-booking rule (ten seats),
 *   2. the company's own lower ceiling, if it has one,
 *   3. the per-trip cap, if one is set for this trip,
 *   4. the daily route+date allowance, if one is set.
 *
 * The counts are made live from the bookings, so a cancelled booking returns
 * its seats by itself and no stored counter can drift away from reality.
 */

export class SeatCapExceededError extends Error {
  readonly code = 'SEAT_CAP_EXCEEDED'
  constructor(readonly max: number) {
    super('Seat cap exceeded')
    this.name = 'SeatCapExceededError'
  }
}

export class RouteQuotaExceededError extends Error {
  readonly code = 'TRIP_QUOTA_EXCEEDED'
  constructor(readonly remaining: number) {
    super('Route quota exceeded')
    this.name = 'RouteQuotaExceededError'
  }
}

export class TripQuotaExceededError extends Error {
  readonly code = 'TRIP_QUOTA_EXCEEDED'
  constructor(readonly remaining: number) {
    super('Trip quota exceeded')
    this.name = 'TripQuotaExceededError'
  }
}

export interface BookingLimitResult {
  /** The per-booking ceiling that was applied. */
  maxSeats: number
  /** The per-trip cap, or null when the trip is uncapped. */
  tripLimit: number | null
  /** The daily route+date allowance, or null when there is none. */
  routeLimit: number | null
  /** Seats the company already holds on this trip. */
  tripUsed: number
  /** Seats the company already holds on this route and day, across every bus. */
  routeUsed: number
  /** Seats already in this booking, from the other leg of a round trip. */
  inBooking: number
}

/**
 * Makes sure a quota row exists and then holds it.
 *
 * The row has to exist before it can be locked, and creating it races — two
 * requests for the same company and route would both try to insert. The
 * upsert is written as raw SQL because Prisma's upsert is a read followed by
 * a write on MySQL and MariaDB, which is exactly the race this needs to
 * avoid. The no-op update also takes the row lock, so the caller gets both
 * the row and the lock in one statement.
 */
async function ensureAndLockQuota(
  tx: Prisma.TransactionClient,
  table: 'CompanyTripQuota' | 'CompanyRouteQuota',
  where: { companyId: string; tripId?: string; routeKey?: string; travelDate?: string },
): Promise<{ id: string; maxSeats: number | null } | null> {
  if (table === 'CompanyTripQuota') {
    await tx.$executeRawUnsafe(
      `INSERT INTO \`CompanyTripQuota\` (\`id\`, \`companyId\`, \`tripId\`, \`maxSeats\`, \`createdAt\`, \`updatedAt\`)
       VALUES (UUID(), ?, ?, NULL, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE \`updatedAt\` = \`updatedAt\``,
      where.companyId,
      where.tripId,
    )
  } else {
    await tx.$executeRawUnsafe(
      `INSERT INTO \`CompanyRouteQuota\` (\`id\`, \`companyId\`, \`routeKey\`, \`travelDate\`, \`maxSeats\`, \`createdAt\`, \`updatedAt\`)
       VALUES (UUID(), ?, ?, ?, NULL, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE \`updatedAt\` = \`updatedAt\``,
      where.companyId,
      where.routeKey,
      where.travelDate,
    )
  }

  const row = table === 'CompanyTripQuota'
    ? await tx.companyTripQuota.findUnique({
        where: { companyId_tripId: { companyId: where.companyId!, tripId: where.tripId! } },
      })
    : await tx.companyRouteQuota.findUnique({
        where: {
          companyId_routeKey_travelDate: {
            companyId: where.companyId!,
            routeKey: where.routeKey!,
            travelDate: where.travelDate!,
          },
        },
      })

  if (!row) return null
  await lockRow(tx, table, row.id)
  return { id: row.id, maxSeats: row.maxSeats }
}

/**
 * Works out whether a booking of `requestedSeats` fits, and refuses it if not.
 *
 * The trip row must already be locked by the caller, and so must the company
 * row. The order is always Company → Trip → quota rows, because two
 * transactions taking the same two rows in opposite orders is a deadlock.
 */
export async function resolveBookingLimits(
  tx: Prisma.TransactionClient,
  args: {
    company: CompanyLimitFields & { id: string }
    tripId: string
    trip: { tripStops?: { stationId: string; stopOrder: number }[]; departure?: Date | string | null }
    requestedSeats: number
    roundTripGroupId?: string | null
  },
): Promise<BookingLimitResult> {
  const { company, tripId, trip, requestedSeats } = args

  // ── 1 and 2: the per-booking ceiling ────────────────────────────────
  const maxSeats = effectiveMaxSeatsPerBooking(company)
  if (requestedSeats > maxSeats) {
    throw new SeatCapExceededError(maxSeats)
  }

  // A round trip is two requests, so the booking total is measured across
  // both legs using the group id they share.
  let inBooking = 0
  if (args.roundTripGroupId) {
    inBooking = await tx.companyBooking.count({
      where: {
        companyId: company.id,
        roundTripGroupId: args.roundTripGroupId,
        status: { in: [...SEAT_HOLDING_STATUSES] },
      },
    })
  }
  if (inBooking + requestedSeats > maxSeats) {
    throw new SeatCapExceededError(maxSeats)
  }

  // ── 3: the per-trip cap ────────────────────────────────────────────
  await ensureAndLockQuota(tx, 'CompanyTripQuota', { companyId: company.id, tripId })
  const tripQuota = await tx.companyTripQuota.findUnique({
    where: { companyId_tripId: { companyId: company.id, tripId } },
  })
  const tripLimit = effectiveTripQuota(tripQuota)
  const tripUsed = await tx.companyBooking.count({
    where: {
      companyId: company.id,
      tripId,
      status: { in: [...SEAT_HOLDING_STATUSES] },
    },
  })
  if (!fitsQuota(tripUsed, tripLimit, requestedSeats)) {
    throw new TripQuotaExceededError(Math.max(0, (tripLimit ?? 0) - tripUsed))
  }

  // ── 4: the daily allowance for the route, across every bus ─────────
  const { routeKey, travelDate } = routeDayKeyOfTrip(trip)
  let routeLimit: number | null = null
  let routeUsed = 0
  if (routeKey && travelDate) {
    await ensureAndLockQuota(tx, 'CompanyRouteQuota', {
      companyId: company.id,
      routeKey,
      travelDate,
    })
    const routeQuota = await tx.companyRouteQuota.findUnique({
      where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
    })
    routeLimit = effectiveTripQuota(routeQuota)
    // Counted across every bus serving the route on that day, which is the
    // point of the bucket.
    routeUsed = await tx.companyBooking.count({
      where: {
        companyId: company.id,
        status: { in: [...SEAT_HOLDING_STATUSES] },
        trip: { routeKey, travelDate },
      },
    })
    if (!fitsQuota(routeUsed, routeLimit, requestedSeats)) {
      throw new RouteQuotaExceededError(Math.max(0, (routeLimit ?? 0) - routeUsed))
    }
  }

  return { maxSeats, tripLimit, routeLimit, tripUsed, routeUsed, inBooking }
}

/**
 * The same numbers as `resolveBookingLimits`, read without writing.
 *
 * The booking page shows the admin how many seats the company has left before
 * anything is booked. That is a preview, so it must not take row locks and
 * must not create quota rows — a page that is merely opened should not change
 * anything or block a real booking.
 *
 * The numbers can be a moment out of date by the time the booking is made.
 * That is fine: the booking path re-checks everything under lock and refuses
 * if the allowance has gone. This is for showing the admin, not for deciding.
 */
export async function readBookingLimits(
  db: Prisma.TransactionClient | PrismaClient,
  args: {
    company: CompanyLimitFields & { id: string }
    tripId: string
    trip: { tripStops?: { stationId: string; stopOrder: number }[]; departure?: Date | string | null }
  },
): Promise<BookingLimitResult> {
  const { company, tripId, trip } = args

  const maxSeats = effectiveMaxSeatsPerBooking(company)

  const tripQuota = await db.companyTripQuota.findUnique({
    where: { companyId_tripId: { companyId: company.id, tripId } },
  })
  const tripLimit = effectiveTripQuota(tripQuota)
  const tripUsed = await db.companyBooking.count({
    where: {
      companyId: company.id,
      tripId,
      status: { in: [...SEAT_HOLDING_STATUSES] },
    },
  })

  const { routeKey, travelDate } = routeDayKeyOfTrip(trip)
  let routeLimit: number | null = null
  let routeUsed = 0
  if (routeKey && travelDate) {
    const routeQuota = await db.companyRouteQuota.findUnique({
      where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
    })
    routeLimit = effectiveTripQuota(routeQuota)
    routeUsed = await db.companyBooking.count({
      where: {
        companyId: company.id,
        status: { in: [...SEAT_HOLDING_STATUSES] },
        trip: { routeKey, travelDate },
      },
    })
  }

  return { maxSeats, tripLimit, routeLimit, tripUsed, routeUsed, inBooking: 0 }
}
