import { test, Page } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { expectNoPageOverflow, measureOverflow } from './helpers/overflow';
import { resolveFirstBookingHref } from './helpers/booking-links';

/**
 * A single 60-character token with no spaces, hyphens or other break
 * opportunities. `overflow-wrap: normal` cannot wrap it, so any element that
 * holds it and cannot shrink will push the page sideways. This is the shape a
 * booking reference, a machine-generated code or a pasted name really takes.
 */
const WIDE_TOKEN = 'STALEXSHRS1126000123abcdefghij0123456789ABCDEFGHIJ0123456789';
if (WIDE_TOKEN.length !== 60) throw new Error(`token must be 60 chars, got ${WIDE_TOKEN.length}`);

/** Settle the page, then assert the page itself does not scroll sideways. */
test.describe.configure({ timeout: 120_000 });

async function gotoSettled(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
      return;
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (!msg.includes('interrupted by another navigation') || attempt === 2) throw err;
      await page.waitForTimeout(500);
    }
  }
}

async function openAndAssert(page: Page, url: string) {
  await gotoSettled(page, url);
  await page.waitForTimeout(1200);
  await expectNoPageOverflow(page, `${url} @ ${page.viewportSize()?.width}px`);
  await page.waitForTimeout(300);
}

test.describe('Responsive: the page itself never scrolls sideways', () => {
  test('anonymous pages', async ({ page }) => {
    for (const url of ['/trips', '/faq', '/login']) {
      await openAndAssert(page, url);
    }
  });

  test('customer bookings list, detail and ticket', async ({ page }) => {
    await loginAs(page.context(), 'customer');
    await openAndAssert(page, '/bookings');
    const detail = await resolveFirstBookingHref(page, '/bookings', /^\/bookings\/[^/]+$/, ['big-bk-5']);
    await openAndAssert(page, detail);
    await openAndAssert(page, `${detail}/print`);
  });

  test('company bookings list, detail, ticket and new booking form', async ({ page }) => {
    await loginAs(page.context(), 'companyAdmin');
    await openAndAssert(page, '/company/bookings');
    const detail = await resolveFirstBookingHref(page, '/company/bookings', /^\/company\/bookings\/[^/]+$/, ['cb-e2e-cancel-test']);
    await openAndAssert(page, detail);
    await openAndAssert(page, `${detail}/print`);
    await openAndAssert(page, '/company/bookings/new');
  });

  test('administrative booking tables', async ({ page }) => {
    await loginAs(page.context(), 'superAdmin');
    for (const url of ['/admin/bookings', '/admin/cancellations', '/admin/verify', '/admin/supervisor']) {
      await openAndAssert(page, url);
    }
  });
});

test.describe('Responsive: unbreakable 60-character token', () => {
  test('every text node becomes an unbreakable token and the page still fits', async ({ page }) => {
    await loginAs(page.context(), 'superAdmin');
    await openAndAssert(page, '/admin/bookings');

    const before = await measureOverflow(page);

    // Replace the visible text of every leaf element with the token. If any
    // row is a non-wrapping flex line, or any text has no wrapping rule, this
    // is where the page would be dragged sideways.
    await page.evaluate((token) => {
      document
        .querySelectorAll('h1,h2,h3,p,span,td,th,a,button,li,div')
        .forEach((el) => {
          if (el.children.length === 0) {
            const text = (el.textContent || '').trim();
            if (text) el.textContent = token;
          }
        });
    }, WIDE_TOKEN);
    await page.waitForTimeout(400);

    await expectNoPageOverflow(
      page,
      `60-char token on /admin/bookings @ ${page.viewportSize()?.width}px (was scrollWidth ${before.scrollWidth})`
    );
  });

  test('the same token on the company booking detail heading', async ({ page }) => {
    await loginAs(page.context(), 'companyAdmin');
    const detail = await resolveFirstBookingHref(page, '/company/bookings', /^\/company\/bookings\/[^/]+$/, ['cb-e2e-cancel-test']);
    await openAndAssert(page, detail);

    // The heading is the booking reference, so give it the token directly
    // rather than spraying the whole page.
    const heading = page.locator('h1').first();
    await heading.evaluate((el, token) => {
      el.textContent = token;
    }, WIDE_TOKEN);
    await page.waitForTimeout(400);

    await expectNoPageOverflow(
      page,
      `60-char heading on ${detail} @ ${page.viewportSize()?.width}px`
    );
  });
});

test.describe('Responsive: the booking pages at every narrow width', () => {
  const WIDTHS = [320, 360, 390, 768, 1280];

  for (const width of WIDTHS) {
    test(`customer booking detail at ${width}px`, async ({ page }) => {
      await loginAs(page.context(), 'customer');
      const detail = await resolveFirstBookingHref(page, '/bookings', /^\/bookings\/[^/]+$/, ['big-bk-5']);

      await page.setViewportSize({ width, height: 900 });
      await openAndAssert(page, detail);
    });

    test(`company booking detail at ${width}px`, async ({ page }) => {
      await loginAs(page.context(), 'companyAdmin');
      const detail = await resolveFirstBookingHref(page, '/company/bookings', /^\/company\/bookings\/[^/]+$/, ['cb-e2e-cancel-test']);

      await page.setViewportSize({ width, height: 900 });
      await openAndAssert(page, detail);
    });
  }
});

test.describe('Responsive: 320px before/after screenshots', () => {
  test('capture the two booking detail pages at 320px', async ({ page }, testInfo) => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve(process.cwd(), '.scratch/responsive');
    fs.mkdirSync(dir, { recursive: true });

    await page.setViewportSize({ width: 320, height: 900 });

    await loginAs(page.context(), 'customer');
    const customerDetail = await resolveFirstBookingHref(page, '/bookings', /^\/bookings\/[^/]+$/, ['big-bk-5']);
    await openAndAssert(page, customerDetail);
    await page.screenshot({
      path: path.join(dir, `bookings-${testInfo.project.name.replace(/[^\w]+/g, '-')}.png`),
      fullPage: true,
    });

    await loginAs(page.context(), 'companyAdmin');
    const companyDetail = await resolveFirstBookingHref(page, '/company/bookings', /^\/company\/bookings\/[^/]+$/, ['cb-e2e-cancel-test']);
    await openAndAssert(page, companyDetail);
    await page.screenshot({
      path: path.join(dir, `company-bookings-${testInfo.project.name.replace(/[^\w]+/g, '-')}.png`),
      fullPage: true,
    });
  });
});

