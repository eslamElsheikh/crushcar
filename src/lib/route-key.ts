import { businessDay } from './analytics'

/**
 * The route identity of a trip, and the day it travels.
 *
 * There is no Route model in this project and no route key on a trip, so the
 * identity is derived from what the schema does ground: TripStop.stationId is
 * a real foreign key to Station.id, and stopOrder gives the order.
 *
 * The key is the ordered station-id sequence, so it is direction-sensitive:
 * Mansoura -> Sharm and Sharm -> Mansoura are different routes, which is what
 * the business rule needs. Mansoura -> Hurghada is a third.
 *
 * The key is derived once and stored on the trip rather than recomputed per
 * query, because a quota spans several buses and a sequence cannot be matched
 * in a SQL where clause.
 */

export const ROUTE_KEY_SEPARATOR = '|'

export interface StopLike {
  stationId: string
  stopOrder: number
}

/**
 * The route key for an ordered list of stops.
 *
 * Null when there are no stops: such trips exist and are searchable, they
 * simply have no route identity, and a quota cannot be counted against them.
 */
export function routeKeyOfStops(stops: Pick<StopLike, 'stationId' | 'stopOrder'>[] | null | undefined): string | null {
  if (!stops || stops.length === 0) return null

  const ordered = [...stops].sort((a, b) => a.stopOrder - b.stopOrder)
  const ids = ordered.map((s) => s.stationId).filter(Boolean)
  if (ids.length === 0) return null
  return ids.join(ROUTE_KEY_SEPARATOR)
}

/** The route key of a trip, from its TripStop rows. */
export function routeKeyOfTrip(trip: { tripStops?: { stationId: string; stopOrder: number }[] } | null | undefined): string | null {
  return routeKeyOfStops(trip?.tripStops)
}

/**
 * The travel date as a Cairo calendar day, "yyyy-mm-dd".
 *
 * Cairo rather than UTC on purpose. A trip leaving at 01:00 on the 20th Cairo
 * time is UTC midnight the previous day, so a UTC day key would put it in the
 * wrong bucket. businessDay() reads the offset for the instant itself, so a
 * daylight-saving change inside the day cannot move it.
 */
export function travelDateOf(departure: Date | string | null | undefined): string | null {
  if (!departure) return null
  const d = departure instanceof Date ? departure : new Date(departure)
  if (Number.isNaN(d.getTime())) return null
  return businessDay(d)
}

/**
 * A composite key for a route and a day.
 *
 * The route key is itself a '|'-joined list of station ids, so joining the
 * route and the day with the same character makes a key that cannot be split
 * apart again: "a|b|c" + "2026-01-01" and "a|b" + "c|2026-01-01" would be
 * the same string. The separator here is one that cannot appear in a station
 * id or in a date, so the two halves are always recoverable.
 */
export const ROUTE_DAY_SEPARATOR = '::'

export function routeDayKey(routeKey: string, travelDate: string): string {
  return `${routeKey}${ROUTE_DAY_SEPARATOR}${travelDate}`
}

export function parseRouteDayKey(composite: string): { routeKey: string; travelDate: string } {
  const at = composite.lastIndexOf(ROUTE_DAY_SEPARATOR)
  if (at < 0) return { routeKey: composite, travelDate: '' }
  return {
    routeKey: composite.slice(0, at),
    travelDate: composite.slice(at + ROUTE_DAY_SEPARATOR.length),
  }
}

/** The route and the day, as the quota table keys them. */
export interface RouteDayKey {
  routeKey: string | null
  travelDate: string | null
}

export function routeDayKeyOfTrip(
  trip: { tripStops?: { stationId: string; stopOrder: number }[]; departure?: Date | string | null } | null | undefined,
): RouteDayKey {
  return {
    routeKey: routeKeyOfTrip(trip),
    travelDate: travelDateOf(trip?.departure),
  }
}

/**
 * Why a trip cannot be placed in a route bucket.
 *
 * NO_STOPS — the trip has no stops, so there is no route to speak of. There
 * is no reliable key, and a trip that cannot be identified must not be
 * allowed to sit outside every quota.
 *
 * STORED_MISMATCH — the stored key and the key derived from the stops
 * disagree. Two definitions of the same thing is the exact thing this module
 * exists to prevent, so the trip is treated as unidentifiable rather than
 * being filed under whichever one happens to be there.
 */
export type RouteIdentityProblem = 'NO_STOPS' | 'STORED_MISMATCH'

/** A trip, as far as its route identity is concerned. */
export interface TripIdentityInput {
  /** The key stored on the row, if the row has one. */
  routeKey?: string | null
  /** The travel date stored on the row, if the row has one. */
  travelDate?: string | null
  tripStops?: { stationId: string; stopOrder: number }[]
  departure?: Date | string | null
}

/** The route bucket a trip belongs to. */
export interface ResolvedRouteIdentity {
  /** The bucket key. Never null: a trip that cannot be identified is refused. */
  routeKey: string
  /** The bucket day. Never null. */
  travelDate: string
  /** Set when the trip cannot be placed in a bucket. */
  problem: RouteIdentityProblem | null
}

/**
 * The one definition of a trip's route identity.
 *
 * The key is derived from the trip's own stops, because that is the ground
 * truth: TripStop.stationId is a real foreign key to Station.id, and
 * stopOrder gives the order. The stored column is compared against it, never
 * preferred over it, so the key used to look up a quota and the key used to
 * count the seats already held can never be two different things.
 *
 * The travel date is the same: derived from the departure, in Cairo time.
 *
 * A trip with no stops has no route identity at all, and a trip whose stored
 * key disagrees with its own stops is in a state nobody can interpret. Both
 * are reported as problems rather than quietly filed under no bucket, because
 * a trip outside every bucket is a trip outside every daily allowance.
 */
export function resolveRouteIdentity(trip: TripIdentityInput): ResolvedRouteIdentity {
  const derivedRouteKey = routeKeyOfStops(trip.tripStops)
  const derivedTravelDate = travelDateOf(trip.departure)

  if (!derivedRouteKey || !derivedTravelDate) {
    return {
      routeKey: derivedRouteKey ?? '',
      travelDate: derivedTravelDate ?? '',
      problem: 'NO_STOPS',
    }
  }

  const storedRouteKey = trip.routeKey ?? null
  const storedTravelDate = trip.travelDate ?? null

  if (storedRouteKey && storedRouteKey !== derivedRouteKey) {
    return { routeKey: derivedRouteKey, travelDate: derivedTravelDate, problem: 'STORED_MISMATCH' }
  }
  if (storedTravelDate && storedTravelDate !== derivedTravelDate) {
    return { routeKey: derivedRouteKey, travelDate: derivedTravelDate, problem: 'STORED_MISMATCH' }
  }

  return { routeKey: derivedRouteKey, travelDate: derivedTravelDate, problem: null }
}

/**
 * Whether two trips share a route on the same day.
 *
 * Used to decide whether two trips draw from the same daily allowance. Both
 * keys must be present: a trip with no route identity cannot be compared, and
 * two trips on different days are never the same bucket.
 */
export function sameRouteAndDay(a: RouteDayKey, b: RouteDayKey): boolean {
  if (!a.routeKey || !b.routeKey || !a.travelDate || !b.travelDate) return false
  return a.routeKey === b.routeKey && a.travelDate === b.travelDate
}
