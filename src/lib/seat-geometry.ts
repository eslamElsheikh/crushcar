/**
 * Seat-map geometry shared by every bus renderer:
 *   - src/app/trips/[id]/page.tsx        (public trip page, outbound + return)
 *   - src/components/v2/booking.tsx      (company booking, V2SeatMap)
 *   - src/app/supervisor/page.tsx        (supervisor trip view)
 *   - src/app/admin/trips/[id]/seats     (admin seat manager)
 *
 * Display-only: labels, ids and booking data are untouched — this only decides
 * where the visual aisle gap goes.
 */

/**
 * Whether a gap (the bus aisle) should be rendered immediately before `col`
 * in a seat-map row. `col` is 1-based.
 *
 * Rules:
 *  - The aisle sits before column `aisleAfter + 1`, and only in rows wide
 *    enough to have one (4+ seats). Rows of 2–3 seats render as one block.
 *  - Back-bench exception: the LAST row of a coach is commonly one
 *    continuous 5-seat bench (2 + 3). Users asked for those five seats to
 *    sit adjacent with no aisle between them, so the gap is suppressed when
 *    the last row has exactly 5 seats. This applies automatically to every
 *    layout — no per-bus configuration.
 */
export function hasAisleGap(params: {
  col: number;
  aisleAfter: number;
  rowSeatCount: number;
  rowIdx: number;
  rows: number;
}): boolean {
  const { col, aisleAfter, rowSeatCount, rowIdx, rows } = params;
  if (col !== aisleAfter + 1) return false;
  if (rowSeatCount <= 3) return false;
  const isLastRow = rowIdx === rows - 1;
  if (isLastRow && rowSeatCount === 5) return false;
  return true;
}
