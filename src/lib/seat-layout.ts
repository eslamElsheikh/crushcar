/**
 * Write-side seat-layout limits.
 *
 * Enforced by PUT /api/buses/[id]/layout (the layout step every bus — new or
 * existing — is saved through) and mirrored by the layout editor's per-row
 * inputs so the UI cannot build a payload the API rejects.
 *
 * Display tolerance is a separate concern: seat-geometry.ts keeps rendering
 * legacy rows that predate a cap. Writes are strict, reads are forgiving.
 */

/** Hard cap: a single row may hold at most this many seats. */
export const MAX_SEATS_PER_ROW = 5;

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Human label for a 0-based row index: 0 → "A", 12 → "M", past Z → "#13". */
export function rowLabel(row: number): string {
  return ROW_LETTERS[row] ?? `#${row + 1}`;
}

/**
 * First row (0-based) holding more than MAX_SEATS_PER_ROW seats, or null when
 * the layout complies. Counts actual seats — not the colsPerRow column span —
 * so a legacy row whose span exceeds the cap because of an aisle hole still
 * passes (prod Safro101 row M: span 6, but only 5 seats: 1,2,4,5,6).
 */
export function findRowOverCap(seats: { row: number }[]): { row: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const s of seats) counts.set(s.row, (counts.get(s.row) ?? 0) + 1);
  for (const [row, count] of counts) {
    if (count > MAX_SEATS_PER_ROW) return { row, count };
  }
  return null;
}

/** Error message for a violating layout, or null when it complies. */
export function seatCapError(seats: { row: number }[]): string | null {
  const over = findRowOverCap(seats);
  if (!over) return null;
  return `Row ${rowLabel(over.row)} has ${over.count} seats — max ${MAX_SEATS_PER_ROW} per row`;
}
