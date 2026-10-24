import { Page, expect } from '@playwright/test';

export interface OverflowMeasurement {
  scrollWidth: number;
  clientWidth: number;
  /** Elements whose right edge passes the viewport — the culprits, not just the symptom. */
  offenders: string[];
}

/**
 * Measure page-level horizontal overflow.
 *
 * The rule under test is "the page itself never scrolls sideways". A table or
 * a seat map is allowed to scroll, and because it scrolls it never moves
 * documentElement.scrollWidth, so this measurement ignores it by construction.
 */
export async function measureOverflow(page: Page): Promise<OverflowMeasurement> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const viewport = de.clientWidth;
    const offenders: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > viewport + 2) {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 60) : '';
        offenders.push(`${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`);
      }
    });
    return {
      scrollWidth: de.scrollWidth,
      clientWidth: viewport,
      offenders: offenders.slice(0, 5),
    };
  });
}

export async function expectNoPageOverflow(page: Page, label: string): Promise<void> {
  const m = await measureOverflow(page);
  expect(
    m.scrollWidth,
    `${label} overflows horizontally (scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}); ` +
      `offenders: ${m.offenders.join(' | ') || 'none flagged'}`
  ).toBeLessThanOrEqual(m.clientWidth + 2);
}
