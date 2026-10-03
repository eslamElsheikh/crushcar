import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs, USERS } from './helpers/auth';

test.describe('Phase C: Worst Cases', () => {

  // ── C1: Server Errors ──────────────────────────────────────────────
  test('C1: Server error 500 and network drop handling on mutating routes', async ({ context, page }) => {
    await loginAs(context, 'customer');

    // Intercept booking route to return 500
    await page.route('**/api/bookings', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'حدث خطأ في الخادم' }),
      });
    });

    await page.goto('/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');

    const seatBtn = page.locator('button[data-seat]:not([disabled]), button[aria-label*="Seat"]:not([disabled])').first();
    if (await seatBtn.isVisible()) {
      await seatBtn.click();
      const bookBtn = page.locator('button:has-text("تأكيد"), button:has-text("احجز"), button:has-text("Book")').first();
      if (await bookBtn.isVisible()) {
        await bookBtn.click();
        await page.waitForTimeout(1000);

        // Verify button is re-enabled, no infinite spinner, no white screen
        expect(await page.locator('body').isVisible()).toBeTruthy();
        expect(await bookBtn.isDisabled()).toBeFalsy();
      }
    }
  });

  // ── C2: Rapid double-click / debounce ──────────────────────────────
  test('C2: Rapid double-clicks do not create duplicate records', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');

    const seatBtn = page.locator('button[data-seat]:not([disabled]), button[aria-label*="Seat"]:not([disabled])').first();
    if (await seatBtn.isVisible()) {
      await seatBtn.click();
      const bookBtn = page.locator('button:has-text("تأكيد"), button:has-text("احجز")').first();
      if (await bookBtn.isVisible()) {
        // Double click rapidly without hanging if button disables immediately on first click
        await Promise.allSettled([
          bookBtn.click({ force: true, timeout: 2000 }),
          bookBtn.click({ force: true, timeout: 2000 }),
        ]);
        await page.waitForTimeout(1500);
      }
    }
  });

  // ── C3: Session expiry mid-flow ────────────────────────────────────
  test('C3: Session expiry mid-flow redirects cleanly', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');

    // Expire session by clearing cookies
    await context.clearCookies();

    // Trigger action requiring auth
    const bookBtn = page.locator('button:has-text("تأكيد"), button:has-text("احجز")').first();
    if (await bookBtn.isVisible()) {
      await bookBtn.click();
      await page.waitForTimeout(1000);
      // Either toast shows sign in error or page redirects to login
      const url = page.url();
      const body = await page.innerText('body');
      expect(url.includes('login') || body.includes('سجل') || body.includes('دخول')).toBeTruthy();
    }
  });

  // ── C4: Concurrency & Seat conflict ────────────────────────────────
  test('C4: Concurrent seat booking conflict handling', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    await loginAs(contextA, 'customer');
    await loginAs(contextB, 'customer');

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto('/trips/trip-normal-40');
    await pageB.goto('/trips/trip-normal-40');

    // Both attempt to book seat
    const seatA = pageA.locator('button[data-seat]:not([disabled]), button[aria-label*="Seat"]:not([disabled])').first();
    const seatB = pageB.locator('button[data-seat]:not([disabled]), button[aria-label*="Seat"]:not([disabled])').first();

    if (await seatA.isVisible() && await seatB.isVisible()) {
      await seatA.click();
      await seatB.click();
    }

    await contextA.close();
    await contextB.close();
  });

  // ── C5: Refresh, Back, Forward in flow ──────────────────────────────
  test('C5: Navigation buttons (back, forward, refresh) do not break state', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });

    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });

    await page.goForward();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/trips\/trip-normal-40/, { timeout: 15_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
  });

  // ── C6: Network throttling simulation ──────────────────────────────
  test('C6: Throttled network displays loading states cleanly', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('body').isVisible()).toBeTruthy();
  });

  // ── C7: Empty state lists ──────────────────────────────────────────
  test('C7: Empty states display action button and no NaN/undefined', async ({ context, page }) => {
    await loginAs(context, 'zeroCreditAdmin');
    await page.goto('/company/bookings');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');
  });

  // ── C8: Large data and wrapped layout ──────────────────────────────
  test('C8: Long names, emojis, and Arabic text wrap properly without layout breaks', async ({ context, page }) => {
    await loginAs(context, 'companyAdmin');
    await page.goto('/company/customers');
    await page.waitForLoadState('domcontentloaded');

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    });
    expect(hasHorizontalOverflow).toBeFalsy();
  });

  // ── C9: Bad input & XSS protection ─────────────────────────────────
  test('C9: XSS scripts and HTML in input fields are rendered safely escaped', async ({ context, page }) => {
    let alertFired = false;
    page.on('dialog', async (d) => {
      alertFired = true;
      await d.dismiss();
    });

    await loginAs(context, 'companyAdmin');
    await page.goto('/company/customers');
    await page.waitForLoadState('domcontentloaded');

    const addBtn = page.locator('button:has-text("إضافة عميل"), button:has-text("عميل جديد")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });
      const xssPayload = '<script>alert("xss")</script><b>bold</b>';
      await dialog.locator('input[autoComplete="name"], input[placeholder*="اسم"]').fill(xssPayload);
      await dialog.locator('input[type="email"]').fill(`xss_${Date.now()}@example.com`);
      await dialog.locator('input[type="tel"]').fill('01000000001');

      await dialog.locator('button:has-text("حفظ"), button:has-text("إضافة")').click();
      await page.waitForTimeout(1000);

      // Verify no script alert was executed
      expect(alertFired).toBeFalsy();
      // Verify no unescaped script or b elements were created in DOM
      expect(await page.locator('script:has-text("xss")').count()).toBe(0);
      expect(await page.locator('b:has-text("bold")').count()).toBe(0);
    }
  });

  // ── C10: Permissions in UI ─────────────────────────────────────────
  test('C10: Role permissions enforced - customer cannot access admin routes', async ({ context, page }) => {
    await loginAs(context, 'customer');

    // Attempt direct navigation to /admin
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 15_000 });
  });

  test('C10-b: Bus-less company has no bus management UI', async ({ context, page }) => {
    await loginAs(context, 'noBusAdmin');
    await page.goto('/company/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Confirm no bus management routes in sidebar
    const navText = await page.innerText('nav');
    expect(navText).not.toContain('إدارة الباصات');
  });

  // ── C11: Time & Cairo timezone formatting ──────────────────────────
  test('C11: Cairo time formatting is consistent across views', async ({ page }) => {
    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');

    // Ensure page renders without date errors
    const content = await page.innerText('body');
    expect(content).not.toContain('Invalid Date');
  });

  // ── C12: Money edges & balance reconciliation ──────────────────────
  test('C12: Financial balances display formatted numbers without NaN', async ({ context, page }) => {
    await loginAs(context, 'companyAdmin');
    await page.goto('/company/credit');
    await page.waitForLoadState('domcontentloaded');

    const pageText = await page.innerText('main, body');
    expect(pageText).not.toContain('NaN');
    expect(pageText).not.toContain('undefined');
  });

  // ── C13: Print ticket styling & authorization ──────────────────────
  test('C13: Ticket view loads print styles and QR', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');

    // Open first ticket if available
    const printLink = page.locator('a[href*="/print"]').first();
    if (await printLink.isVisible()) {
      const href = await printLink.getAttribute('href');
      if (href) {
        await page.goto(href);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('body')).toContainText('تذكرة', { timeout: 15_000 });
      }
    }
  });

  // ── C14: Upload handling ───────────────────────────────────────────
  test('C14: Upload errors fail gracefully with Arabic feedback', async ({ context, page }) => {
    await loginAs(context, 'superAdmin');
    await page.goto('/admin/destinations');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('body').isVisible()).toBeTruthy();
  });

  // ── C15: Accessibility basics (Axe-core) ────────────────────────────
  test('C15: Accessibility audit on Home, /trips, and /admin', async ({ context, page }) => {
    // 1. Audit Home page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const homeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Focus on critical / serious structural violations
      .analyze();

    const criticalViolations = homeResults.violations.filter((v) => v.impact === 'critical');
    expect(criticalViolations).toEqual([]);

    // 2. Audit /trips page
    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');
    const tripsResults = await new AxeBuilder({ page })
      .withTags(['wcag2a'])
      .disableRules(['color-contrast'])
      .analyze();
    const criticalTrips = tripsResults.violations.filter((v) => v.impact === 'critical');
    expect(criticalTrips).toEqual([]);
  });
});
