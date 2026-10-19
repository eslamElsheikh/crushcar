/**
 * Seat limits for company bookings.
 *
 * Two separate ceilings, and they compose:
 *
 *   maxSeatsPerBooking — how many seats one company booking may cover. A
 *   company that wants more makes another booking. Set per company, with a
 *   default.
 *
 *   CompanyTripQuota — how many seats one company may hold on one trip. The
 *   count is made live from the bookings, so a cancelled booking gives its
 *   seats back on its own and the number cannot drift.
 *
 * Neither applies to a platform-funded booking: those seats belong to nobody's
 * allowance, and the platform has no allowance of its own to spend.
 */

/** Seats one company booking may cover when the company has no override. */
export const DEFAULT_MAX_SEATS_PER_BOOKING = 10

/**
 * Statuses that still hold a seat.
 *
 * A PENDING company booking holds its seat, so it counts against the quota
 * until it is cancelled or paid. This mirrors the allow-lists the seat
 * availability queries use.
 */
export const SEAT_HOLDING_STATUSES = ['PENDING', 'PAID', 'BOARDED'] as const

export interface CompanyLimitFields {
  maxSeatsPerBooking?: number | null
}

/**
 * The ceiling for one booking, in seats.
 *
 * A stored 0 is not a valid ceiling — it would mean "no seats at all", which
 * is how a company is switched off, not a limit. It falls back to the default
 * rather than silently blocking every booking.
 */
export function effectiveMaxSeatsPerBooking(company: CompanyLimitFields | null | undefined): number {
  const stored = company?.maxSeatsPerBooking
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 1) {
    return Math.floor(stored)
  }
  return DEFAULT_MAX_SEATS_PER_BOOKING
}

export interface TripQuotaFields {
  maxSeats?: number | null
}

/**
 * The ceiling for one company on one trip, or null when there is no limit.
 *
 * A quota row with a null or unusable maxSeats means "no limit", which is
 * different from "no row at all" only in where the fact is recorded.
 */
export function effectiveTripQuota(quota: TripQuotaFields | null | undefined): number | null {
  const stored = quota?.maxSeats
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 1) {
    return Math.floor(stored)
  }
  return null
}

export interface QuotaUsage {
  /** Seats the company already holds on the trip. */
  used: number
  /** The ceiling, or null when unlimited. */
  limit: number | null
  /** Seats still available, or null when unlimited. */
  remaining: number | null
}

/**
 * What is left of a company's trip allowance.
 *
 * The used count is the number of seats the company holds right now, taken
 * from the bookings themselves rather than from a stored counter.
 */
export function quotaUsage(used: number, limit: number | null): QuotaUsage {
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
  }
}

/**
 * Whether a booking of `requested` more seats fits inside the allowance.
 *
 * `used` is what the company already holds, so the check is against the total
 * after this booking, not just this booking.
 */
export function fitsQuota(used: number, limit: number | null, requested: number): boolean {
  if (limit === null) return true
  return used + requested <= limit
}
