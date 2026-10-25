import { Page, expect } from '@playwright/test';

/** Read every `href` currently in the DOM. */
export async function hrefsOn(page: Page): Promise<string[]> {
  return page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') || ''));
}

/**
 * Find the first booking-detail link on a bookings list page.
 *
 * The list opens on the "upcoming" tab, which can legitimately be empty
 * (the fixture has no future PAID bookings), so the remaining tabs are
 * clicked in order. Tab buttons are `role="tab"` in a fixed order, so they
 * are addressed by index rather than by translated text.
 *
 * If no link can be resolved from the list at all (for example because every
 * tab is empty in this fixture), the helper falls back to the supplied ids,
 * which are verified to load before being returned.
 */
export async function resolveFirstBookingHref(
  page: Page,
  listUrl: string,
  pattern: RegExp,
  fallbackIds: string[] = []
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
      break;
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (!msg.includes('interrupted by another navigation') || attempt === 2) throw err;
      await page.waitForTimeout(500);
    }
  }
  await page.waitForTimeout(300);

  // Wait for the list to finish loading instead of a fixed sleep.
  const tabs = page.locator('button[role="tab"]');
  if (await tabs.count()) {
    await tabs.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  } else {
    await page.waitForTimeout(1000);
  }

  // "new" is the compose-a-booking link (`/bookings/new`), not a booking
  // detail — its segment satisfies the callers' `[^/]+` pattern, and matching
  // it turned the health check into a guaranteed 404 on the ticket API.
  const read = async () =>
    (await hrefsOn(page)).find((h) => pattern.test(h) && !h.endsWith('/new'));
  let found = await read();

  const tabCount = await tabs.count();
  for (let i = 0; i < tabCount && !found; i++) {
    await tabs.nth(i).click().catch(() => {});
    await page.waitForTimeout(800);
    found = await read();
  }

  if (!found && fallbackIds.length) {
    for (const id of fallbackIds) {
      const candidate = `${listUrl.replace(/\/$/, '')}/${id}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const resp = await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(300);
          if (resp && resp.status() < 400) { found = candidate; }
          break;
        } catch (err) {
          const msg = String((err as Error)?.message || err);
          if (!msg.includes('interrupted by another navigation') || attempt === 2) throw err;
          await page.waitForTimeout(500);
        }
      }
      if (found) break;
    }
  }

  expect(found, `No link matching ${pattern} on ${listUrl}`).toBeTruthy();
  return found as string;
}
