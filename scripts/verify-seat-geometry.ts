import { hasAisleGap } from '../src/lib/seat-geometry';

/**
 * Pure geometry check for the shared seat-map aisle rule (no DB needed).
 * Run: npm run check:seat-geometry
 */

let failures = 0;
function expect(name: string, actual: boolean, wanted: boolean) {
  const ok = actual === wanted;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${actual}, wanted ${wanted})`);
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

if (failures > 0) {
  console.error(`\n${failures} seat-geometry assertion(s) failed`);
  process.exit(1);
}
console.log('\nseat-geometry: all assertions passed');
