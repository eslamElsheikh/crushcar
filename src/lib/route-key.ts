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
