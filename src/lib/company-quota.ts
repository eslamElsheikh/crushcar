import type { Prisma, PrismaClient } from '@prisma/client'
import { lockRow } from './row-lock'
import {
  SEAT_HOLDING_STATUSES,
  effectiveMaxSeatsPerBooking,
  effectiveTripQuota,
  fitsQuota,
  type CompanyLimitFields,
} from './booking-limits'
import { resolveRouteIdentity } from './route-key'

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
  /** Which allowance was hit, so the message can say so. */
  readonly kind = 'ROUTE' as const
  constructor(readonly remaining: number) {
    super('Route quota exceeded')
    this.name = 'RouteQuotaExceededError'
  }
}

export class TripQuotaExceededError extends Error {
  readonly code = 'TRIP_QUOTA_EXCEEDED'
  /** Which allowance was hit, so the message can say so. */
  readonly kind = 'TRIP' as const
  constructor(readonly remaining: number) {
    super('Trip quota exceeded')
    this.name = 'TripQuotaExceededError'
  }
}

/**
 * The trip cannot be placed in a route bucket, so the daily allowance cannot
 * be enforced against it.
 *
 * This is deliberately a refusal rather than a pass. A trip with no stops has
 * no route, and a trip whose stored key disagrees with its own stops is in a
 * state nobody can interpret; filing either of them under "no bucket" would
 * put it outside every daily allowance, which is exactly the outcome the
 * quota exists to prevent.
 *
 * The message says what to do about it.
 */
export class UnresolvedRouteError extends Error {
  readonly code = 'UNRESOLVED_ROUTE'
  constructor(
    readonly problem: 'NO_STOPS' | 'STORED_MISMATCH',
    readonly tripId: string,
  ) {
    super(
      problem === 'NO_STOPS'
        ? 'This trip has no stops, so it has no route identity and the daily company quota cannot be applied to it'
        : 'This trip\'s stored route key disagrees with its own stops, so its daily company quota cannot be applied to it',
    )
    this.name = 'UnresolvedRouteError'
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
 * The route bucket a trip belongs to, and the trips that share it.
 *
 * This is the one place the bucket is worked out. Both the lookup of the
 * quota row and the count of the seats already held go through it, so the key
 * a quota is filed under and the key the seats are counted by are the same
 * key — they used to be two different ones, which let a company hold more
 * seats on a route than its daily allowance allowed.
 *
 * The bucket is the key derived from the trip's own stops. The stored column
 * is compared against it, and a trip whose stored key is missing is still
 * placed by the derived one.
 *
 * The trips that share the bucket are found in two parts:
 *
 *   - trips whose stored key is the bucket key. These are the trips the
 *     application has written since the column was added.
 *   - trips with no stored key at all, whose own stops derive to the bucket
 *     key. These are the legacy trips, from before the column existed.
 *
 * The second part is what stops a legacy trip from being quietly left out of
 * the count. It is found by looking at the trips that have no stored key —
 * a set that the backfill empties and that is empty afterwards for good.
 */
export async function resolveRouteBucket(
  tx: Prisma.TransactionClient | PrismaClient,
  trip: {
    id: string
    routeKey?: string | null
    travelDate?: string | null
    tripStops?: { stationId: string; stopOrder: number }[]
    departure?: Date | string | null
  },
): Promise<{ routeKey: string; travelDate: string; legacyTripIds: string[] }> {
  const identity = resolveRouteIdentity(trip)
  if (identity.problem) {
    throw new UnresolvedRouteError(identity.problem, trip.id)
  }

  const { routeKey, travelDate } = identity

  // The legacy set: trips with no stored key whose own stops put them in this
  // same bucket. They are counted explicitly, because the stored column on
  // them is still null and a filter on it would match nothing.
  const unkeyed = await tx.trip.findMany({
    where: { routeKey: null },
    select: {
      id: true,
      travelDate: true,
      departure: true,
      tripStops: { select: { stationId: true, stopOrder: true } },
    },
  })

  const legacyTripIds: string[] = []
  for (const other of unkeyed) {
    const otherIdentity = resolveRouteIdentity(other)
    if (otherIdentity.problem) continue
    if (otherIdentity.routeKey === routeKey && otherIdentity.travelDate === travelDate) {
      legacyTripIds.push(other.id)
    }
  }

  return { routeKey, travelDate, legacyTripIds }
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
    trip: {
      id?: string
      routeKey?: string | null
      travelDate?: string | null
      tripStops?: { stationId: string; stopOrder: number }[]
      departure?: Date | string | null
    }
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
  // The bucket is worked out once, here, and used for both the lookup of the
  // quota row and the count of the seats already held. They used to be worked
  // out separately — the lookup from the trip's stops, the count from the
  // stored column — and a legacy trip, whose stored column is still null, was
  // counted as holding nothing.
  const bucket = await resolveRouteBucket(tx, { ...trip, id: trip.id ?? tripId })
  const { routeKey, travelDate, legacyTripIds } = bucket

  let routeLimit: number | null = null
  let routeUsed = 0

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
  // point of the bucket. The legacy trips are included by id, because their
  // stored route key is still null and the column filter would miss them.
  routeUsed = await tx.companyBooking.count({
    where: {
      companyId: company.id,
      status: { in: [...SEAT_HOLDING_STATUSES] },
      OR: [
        { trip: { routeKey, travelDate } },
        { tripId: { in: legacyTripIds } },
      ],
    },
  })
  if (!fitsQuota(routeUsed, routeLimit, requestedSeats)) {
    throw new RouteQuotaExceededError(Math.max(0, (routeLimit ?? 0) - routeUsed))
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
    trip: {
      id?: string
      routeKey?: string | null
      travelDate?: string | null
      tripStops?: { stationId: string; stopOrder: number }[]
      departure?: Date | string | null
    }
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

  // The same bucket the booking path uses, so the preview and the booking
  // agree on which bucket the trip is in.
  const bucket = await resolveRouteBucket(db, {
    ...trip,
    id: trip.id ?? tripId,
  })
  const { routeKey, travelDate, legacyTripIds } = bucket

  const routeQuota = await db.companyRouteQuota.findUnique({
    where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
  })
  const routeLimit = effectiveTripQuota(routeQuota)
  const routeUsed = await db.companyBooking.count({
    where: {
      companyId: company.id,
      status: { in: [...SEAT_HOLDING_STATUSES] },
      OR: [
        { trip: { routeKey, travelDate } },
        { tripId: { in: legacyTripIds } },
      ],
    },
  })

  return { maxSeats, tripLimit, routeLimit, tripUsed, routeUsed, inBooking: 0 }
}
