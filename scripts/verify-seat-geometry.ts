import { hasAisleGap } from '../src/lib/seat-geometry';
import { MAX_SEATS_PER_ROW, findRowOverCap, seatCapError, rowLabel } from '../src/lib/seat-layout';

/**
 * Pure geometry check for the shared seat-map aisle rule + the write-side
 * 5-seats-per-row cap (no DB needed).
 * Run: npm run check:seat-geometry
 */

let failures = 0;
function expect(name: string, actual: unknown, wanted: unknown) {
  const ok = Object.is(actual, wanted);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)})`);
}

// Standard 4-col coach (aisleAfter=2), mid rows: aisle before col 3.
expect('mid row of 4 → aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 4, rowIdx: 0, rows: 10 }), true);
expect('mid row col 1 → no aisle', hasAisleGap({ col: 1, aisleAfter: 2, rowSeatCount: 4, rowIdx: 0, rows: 10 }), false);
expect('mid row col 4 → no aisle', hasAisleGap({ col: 4, aisleAfter: 2, rowSeatCount: 4, rowIdx: 0, rows: 10 }), false);

// 3-seat rows render as one block.
expect('row of 3 → no aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 3, rowIdx: 0, rows: 10 }), false);

// Back bench: LAST row of exactly 5 seats is one continuous bench.
expect('last row of 5 → no aisle (col 3)', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 5, rowIdx: 9, rows: 10 }), false);
expect('last row of 5 → no aisle anywhere', hasAisleGap({ col: 4, aisleAfter: 2, rowSeatCount: 5, rowIdx: 9, rows: 10 }), false);

// A 5-seat row that is NOT last keeps the aisle.
expect('non-last row of 5 → aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 5, rowIdx: 5, rows: 10 }), true);

// Last row of 4 (no bench) keeps normal behaviour.
expect('last row of 4 → aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 4, rowIdx: 9, rows: 10 }), true);

// Single-row bus (rowIdx 0 is also the last row) with a 5-seat bench.
expect('1-row bus of 5 → no aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 5, rowIdx: 0, rows: 1 }), false);

// Mini bus (aisleAfter=1, 3 cols) — never an aisle.
expect('mini bus row of 3 (aisleAfter=1) → no aisle', hasAisleGap({ col: 2, aisleAfter: 1, rowSeatCount: 3, rowIdx: 1, rows: 3 }), false);

// 5-col rows with a different aisle position still respect the bench rule.
expect('aisleAfter=3, last row of 5 → no aisle', hasAisleGap({ col: 4, aisleAfter: 3, rowSeatCount: 5, rowIdx: 7, rows: 8 }), false);
expect('aisleAfter=3, mid row of 5 → aisle', hasAisleGap({ col: 4, aisleAfter: 3, rowSeatCount: 5, rowIdx: 3, rows: 8 }), true);

// Legacy 6-column back bench (prod Safro101 row M: span 6, seats at 1,2,4,5,6).
expect('last row of 6 → no aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 6, rowIdx: 12, rows: 13 }), false);
expect('aisleAfter=3, last row of 6 → no aisle', hasAisleGap({ col: 4, aisleAfter: 3, rowSeatCount: 6, rowIdx: 7, rows: 8 }), false);
expect('1-row bus of 6 → no aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 6, rowIdx: 0, rows: 1 }), false);

// The bench rule is last-row-only and stops at 6.
expect('non-last row of 6 → aisle', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 6, rowIdx: 5, rows: 13 }), true);
expect('last row of 7 → aisle (bench stops at 6)', hasAisleGap({ col: 3, aisleAfter: 2, rowSeatCount: 7, rowIdx: 9, rows: 10 }), true);

// ── Write-side cap: max 5 seats per row ────────────────────────────
expect('cap constant is 5', MAX_SEATS_PER_ROW === 5, true);

// Seats spread across rows, e.g. seatsFor(5, 4) → row 0 has 5, row 1 has 4.
function seatsFor(...rowCounts: number[]): { row: number; col: number }[] {
  return rowCounts.flatMap((count, row) =>
    Array.from({ length: count }, (_, i) => ({ row, col: i + 1 }))
  );
}

expect('5 seats in the only row → complies', findRowOverCap(seatsFor(5)) === null, true);
expect('every row ≤5 → complies', findRowOverCap(seatsFor(5, 4, 5, 1, 5)) === null, true);
expect('no seats → complies', findRowOverCap([]) === null, true);
// Prod Safro101's real distribution: 12 rows of ≤5 plus a 5-seat row M.
expect('Safro101 shape (4×5,2,2,4×5,5) → complies',
  findRowOverCap(seatsFor(4, 4, 4, 4, 4, 2, 2, 4, 4, 4, 4, 4, 5)) === null, true);

const over = findRowOverCap(seatsFor(4, 6));
expect('row with 6 seats → flagged', over !== null, true);
expect('flagged row index is the 6-seat row', over?.row, 1);
expect('flagged count is 6', over?.count, 6);

const msg = seatCapError(seatsFor(5, 5, 6));
expect('violating layout → error message', msg !== null, true);
expect('message names the row letter (row 2 → C)',
  (msg || '').includes(`Row ${rowLabel(2)} `), true);
expect('error message text',
  msg === `Row C has 6 seats — max ${MAX_SEATS_PER_ROW} per row`, true);
expect('complying layout → no error', seatCapError(seatsFor(5, 5)), null);

if (failures > 0) {
  console.error(`\n${failures} seat-geometry assertion(s) failed`);
  process.exit(1);
}
console.log('\nseat-geometry: all assertions passed');
