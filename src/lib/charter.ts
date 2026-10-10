/* Charter pricing rules — pure, so they can be reasoned about and tested
 * without a React tree.
 */

/**
 * A charter trip is priced as one total for the whole bus, not split per stop.
 * Every stop therefore carries that same total.
 *
 * The last stop is what Trip.price is read from, and CharterBooking charges
 * busPrice with trip.price as the fallback, so this keeps both readings equal
 * to what the admin entered. Seats cannot be booked on a charter trip, so the
 * per-stop difference that seat pricing relies on is never computed from these.
 */
export function distributeCharterTotal(total: number, stopCount: number): number[] {
  return Array.from({ length: Math.max(0, stopCount) }, () => total);
}