import { test, expect, Page } from '@playwright/test';

/**
 * Mobile seat-map regression spec (fix/seatmap-mobile).
 *
 * Guards the two reported phone bugs on /trips/[id]:
 *  1. The seat map used to widen the WHOLE page on narrow screens — seats were
 *     clipped with no way to scroll them, and the booking summary clipped too.
 *     Now only the map's own container scrolls horizontally.
 *  2. A coach's 5-seat back bench must render adjacent with NO aisle gap.
 *
 * Runs on every viewport project; the overflow assertions are what the narrow
 * widths actually exercise.
 */

const TRIP = '/trips/trip-normal-40';

async function pageHasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1; // +1px tolerance for rounding
  });
}

test.describe('seat map mobile layout', () => {
  test('page never scrolls sideways; the map itself does', async ({ page }) => {
    await page.goto(TRIP, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('seat-map-scroller')).toBeVisible();

    expect(await pageHasHorizontalOverflow(page)).toBe(false);

    // The scroller must actually be able to reveal its own overflow: every
    // seat button in the grid must be reachable by scrolling the container.
    const scroller = page.getByTestId('seat-map-scroller');
    const box = await scroller.boundingBox();
    expect(box, 'scroller has a box').toBeTruthy();

    const seats = scroller.locator('button[aria-label^="Seat "]');
    const count = await seats.count();
    expect(count, 'coach 01 has 41 seats after the back bench').toBe(41);

    // Every seat, when scrolled into view inside the container, must sit
    // within the container's horizontal bounds (nothing permanently clipped).
    for (let i = 0; i < count; i++) {
      const seat = seats.nth(i);
      await seat.scrollIntoViewIfNeeded();
      const sBox = await seat.boundingBox();
      expect(sBox, `seat #${i} has a box`).toBeTruthy();
      if (!sBox || !box) continue;
      const visible = await scroller.evaluate((el, r) => {
        const cr = el.getBoundingClientRect();
        return r.left >= cr.left - 1 && r.right <= cr.right + 1;
      }, { left: sBox.x, right: sBox.x + sBox.width });
      expect(visible, `seat #${i} fully reachable inside the scroller`).toBe(true);
    }
  });

  test('booking summary is fully on-screen on a phone', async ({ page }) => {
    await page.goto(TRIP, { waitUntil: 'domcontentloaded' });

    // ملخص الحجز — must exist and sit within the viewport width (it used to be
    // pushed off-screen by the oversized map above it).
    const summary = page.getByText('ملخص الحجز').first();
    await expect(summary).toBeVisible();
    const box = await summary.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      const vw = page.viewportSize()!.width;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
    }
    expect(await pageHasHorizontalOverflow(page)).toBe(false);
  });

  test('5-seat back bench renders adjacent with no aisle', async ({ page }) => {
    await page.goto(TRIP, { waitUntil: 'domcontentloaded' });
    const scroller = page.getByTestId('seat-map-scroller');
    await expect(scroller.getByRole('button', { name: 'Seat J5' })).toBeVisible();

    // Measure centre-to-centre horizontal distance between neighbouring seats.
    // With an aisle the gap is much larger (aisle margin ~20-32px + seat gap).
    async function centres(labels: string[]) {
      const pts: number[] = [];
      for (const l of labels) {
        const b = await scroller.locator(`button[aria-label="Seat ${l}"]`).boundingBox();
        expect(b, `${l} has a box`).toBeTruthy();
        pts.push(b!.x + b!.width / 2);
      }
      return pts;
    }

    // Back bench J1..J5: every adjacent distance should be equal-ish (uniform).
    const rowJ = await centres(['J1', 'J2', 'J3', 'J4', 'J5']);
    const gapsJ = rowJ.slice(1).map((x, i) => Math.abs(x - rowJ[i]));
    const maxJ = Math.max(...gapsJ);
    const minJ = Math.min(...gapsJ);
    // No aisle means no gap anywhere near the aisle margin (ms-5 = 20px on
    // phones). Sub-pixel layout rounding makes the gaps differ by a few px,
    // so assert the semantic property instead of pixel-perfect equality:
    // nothing may stand out as an aisle.
    expect(maxJ - minJ, `back bench gaps uniform: [${gapsJ.join(', ')}]`).toBeLessThan(15);

    // Control: a mid row (B, 4 seats) DOES have an aisle between B2 and B3,
    // so its middle gap must be clearly wider than its outer gap.
    const rowB = await centres(['B1', 'B2', 'B3', 'B4']);
    const bOuter = Math.abs(rowB[1] - rowB[0]);
    const bAisle = Math.abs(rowB[2] - rowB[1]);
    expect(bAisle - bOuter, `row B aisle gap visible (${bOuter} vs ${bAisle})`).toBeGreaterThan(10);
  });

  test('map renders complete at 320px without page overflow', async ({ page }) => {
    // Explicit narrow check (the 320 project covers it, but keep the assertion
    // local so a future default-viewport change cannot silently drop it).
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(TRIP, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('seat-map-scroller')).toBeVisible();
    expect(await pageHasHorizontalOverflow(page)).toBe(false);
    // Last row still shows five seats.
    for (const l of ['J1', 'J2', 'J3', 'J4', 'J5']) {
      await expect(page.getByTestId('seat-map-scroller').locator(`button[aria-label="Seat ${l}"]`)).toBeAttached();
    }
  });
});
