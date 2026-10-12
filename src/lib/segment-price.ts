/**
 * Segment pricing — the single implementation used by the public trip search,
 * the booking API and the UI.
 *
 * There used to be three: this arithmetic inline in the booking route, a copy in
 * the search's raw SQL, and a third in the booking component. A trip quoted to
 * a customer and the same trip charged at checkout could disagree, so they now
 * share one function.
 */

export interface PriceableStop {
  stationId: string;
  stopOrder: number;
  priceFromOrigin: number;
}

export interface PriceableTrip {
  price?: number | null;
  tripStops?: PriceableStop[] | null;
}

/**
 * Price of travelling from one station to another on a trip.
 *
 * Falls back to the trip price when the stations cannot be ordered (stop-less
 * trips, or a from/to pair that does not run in that direction), which is what
 * the search has always done for those rows.
 */
export function segmentPrice(
  t: PriceableTrip | null | undefined,
  fromSid: string | null,
  toSid: string | null,
): number {
  const stops = t?.tripStops || [];
  const from = stops.find((s) => s.stationId === fromSid) || stops[0];
  const to = stops.find((s) => s.stationId === toSid) || stops[stops.length - 1];
  if (from && to && to.stopOrder > from.stopOrder) {
    return to.priceFromOrigin - from.priceFromOrigin;
  }
  return t?.price || 0;
}