/**
 * Seat limits for company bookings.
 *
 * Three separate ceilings, and they compose — the effective limit is the
 * smallest that applies:
 *
 *   MAX_SEATS_PER_BOOKING — the hard business rule: one booking covers at most
 *   ten seats. A company that wants more makes another booking.
 *
 *   maxSeatsPerBooking — a company may be given a *lower* ceiling than the
 *   rule. It may never raise it: the hard maximum stands whatever is stored.
 *
 *   CompanyRouteQuota — how many seats a company may hold on one route on one
 *   travel date, shared by every bus serving that route. This is the daily
 *   allowance.
 *
 *   CompanyTripQuota — how many seats a company may hold on one single trip.
 *   A stricter, per-bus cap that also applies.
 *
 * The counts are made live from the bookings, so a cancelled booking gives its
 * seats back on its own and no number can drift.
 *
 * None of this applies to a platform-funded booking: those seats belong to
 * nobody's allowance, and the platform has no allowance of its own to spend.
 */

/** The hard business rule: one booking may cover at most this many seats. */
export const MAX_SEATS_PER_BOOKING = 10

/**
 * The largest overall daily cap that can be set for a company.
 *
 * This is a bound on the *setting*, not on the business. A company that runs
 * a fleet can hold more than ten seats in a day; what it cannot do is hold
 * them in one booking, which is what MAX_SEATS_PER_BOOKING is about. The two
 * are separate limits and the smaller of the applicable ones is what applies.
 */
export const MAX_DAILY_SEATS = 10000

/** Seats one company booking may cover when the company has no override. */
export const DEFAULT_MAX_SEATS_PER_BOOKING = MAX_SEATS_PER_BOOKING

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
  /**
   * The overall daily cap: how many seats the company may hold on one
   * travel date, across every trip, route, direction and bus on that date.
   */
  maxDailySeats?: number | null
}

/**
 * The ceiling for one booking, in seats.
 *
 * A company's stored value may only lower the ceiling. It can never raise it
 * above MAX_SEATS_PER_BOOKING, because the rule is ten seats and a stored
 * value is not a decision to change that.
 *
 * A stored 0 is not a valid ceiling either — it would mean "no seats at all",
 * which is how a company is switched off, not a limit. It falls back to the
 * default rather than silently blocking every booking.
 */
export function effectiveMaxSeatsPerBooking(company: CompanyLimitFields | null | undefined): number {
  const stored = company?.maxSeatsPerBooking
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 1) {
    return Math.min(MAX_SEATS_PER_BOOKING, Math.floor(stored))
  }
  return DEFAULT_MAX_SEATS_PER_BOOKING
}

export interface TripQuotaFields {
  maxSeats?: number | null
}

/**
 * The overall daily cap for a company, or null when it has none.
 *
 * This is not the per-booking ceiling. The per-booking ceiling is about one
 * request; this one is about a whole day, and it counts the seats the
 * company holds on that day across every trip, route, direction and bus.
 *
 * The two are checked independently and the smaller of them is what applies,
 * so a company with both a daily cap of twenty and the ten-seat per-booking
 * rule can never take more than ten in one booking, and never more than
 * twenty in one day.
 */
export function effectiveDailyCap(company: CompanyLimitFields | null | undefined): number | null {
  const stored = company?.maxDailySeats
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 1) {
    return Math.floor(stored)
  }
  return null
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
 * What is left of a company's allowance.
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
