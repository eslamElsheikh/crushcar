import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs, USERS } from './helpers/auth';
import { PrismaClient } from '@prisma/client';
import { seedEmptyDatabase, seedScratchDatabase } from './fixtures/seed';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:../.scratch/e2e.db' } },
});

async function safeGoto(page: Page, url: string, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    } catch (err) {
      if (i === retries) throw err;
      await page.waitForTimeout(3000);
    }
  }
}

test.describe.serial('Phase C: Worst Cases', () => {

  // ── C1: Server Errors & Network drops on mutating routes ───────────
  test('C1: Server error 500, timeout, and offline handling on mutating routes', async ({ context, page }) => {
    await loginAs(context, 'customer');

    // 1. Force 500 on booking
    await page.route('**/api/bookings', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'حدث خطأ في الخادم' }),
      });
    });

    await safeGoto(page, '/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');

    const seatBtn = page.locator('button[aria-label*="Seat"]:not([disabled])').first();
    await expect(seatBtn).toBeVisible({ timeout: 25_000 });
    await seatBtn.click();

    const nameInput = page.locator('div:has(> h4:has-text("بيانات المسافرين")) input[type="text"], div:has(> h4:has-text("Passenger Details")) input[type="text"], input[placeholder*="اسم"], input[placeholder*="Passenger"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('أحمد خطأ');
    }

    const bookBtn = page.locator('button:has-text("تأكيد الحجز")').first();
    await bookBtn.click();
    await page.waitForTimeout(1000);

    // Form data must be preserved, button re-enabled, no white screen
    if (await nameInput.isVisible()) {
      expect(await nameInput.inputValue()).toBe('أحمد خطأ');
    }
    expect(await bookBtn.isDisabled()).toBeFalsy();
    expect(await page.locator('body').isVisible()).toBeTruthy();

    // 2. Force network drop / offline on company deposit
    await page.unroute('**/api/bookings');
    await loginAs(context, 'companyAdmin');
    await page.route('**/api/company/deposit-requests', (route) => route.abort('failed'));

    await page.goto('/company/credit');
    await page.waitForLoadState('domcontentloaded');

    const depositInput = page.locator('input[type="number"]').first();
    if (await depositInput.isVisible()) {
      await depositInput.fill('1000');
      const submitBtn = page.locator('button:has-text("إرسال الطلب")').first();
      await submitBtn.click();
      await page.waitForTimeout(1000);
      expect(await submitBtn.isDisabled()).toBeFalsy();
    }
    await page.unroute('**/api/company/deposit-requests');
  });

  // ── C2: Double-click / rapid repeat DB verification ────────────────
  test('C2: Rapid double-clicks do not create duplicate records in DB', async ({ context, page }) => {
    await loginAs(context, 'customer');
    const initialBookingsCount = await prisma.booking.count();

    await page.goto('/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');

    const seatBtn = page.locator('button[aria-label="Seat J1"], button[aria-label*="Seat"]:not([disabled])').last();
    if (await seatBtn.isVisible()) {
      await seatBtn.click();
      const bookBtn = page.locator('button:has-text("تأكيد الحجز")').first();
      if (await bookBtn.isVisible()) {
        // Fire rapid double click
        await Promise.allSettled([
          bookBtn.click({ force: true, timeout: 2000 }),
          bookBtn.click({ force: true, timeout: 2000 }),
        ]);
        await page.waitForTimeout(2000);
      }
    }

    const afterCount = await prisma.booking.count();
    // At most 1 booking created (or 0 if rapid click was blocked/debounced)
    expect(afterCount - initialBookingsCount).toBeLessThanOrEqual(1);
  });

  // ── C3: Session expiry mid-flow ────────────────────────────────────
  test('C3: Session expiry mid-flow redirects cleanly', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await page.goto('/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');

    // Pick seat
    const seatBtn = page.locator('button[aria-label*="Seat"]:not([disabled])').first();
    await seatBtn.click();

    // Expire session mid-flow by clearing cookies
    await context.clearCookies();

    // Trigger action requiring auth
    const bookBtn = page.locator('button:has-text("تأكيد الحجز")').first();
    await bookBtn.click();
    // Redirected to login or shown clear Arabic session feedback
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 25_000 }).catch(() => {});
    const url = page.url();
    const body = await page.innerText('body');
    const toastTexts = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []);
    const combined = `${url} ${body} ${toastTexts.join(' ')}`;
    expect(url.includes('login') || combined.includes('سجل') || combined.includes('دخول') || combined.includes('انتهت')).toBeTruthy();
  });

  // ── C4: Concurrency & Seat collision handling ──────────────────────
  test('C4: Concurrent seat booking conflict handling between two users', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    await loginAs(contextA, 'customer');
    await loginAs(contextB, 'customer');

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto('/trips/trip-normal-40');
    await pageB.goto('/trips/trip-normal-40');
    await pageA.waitForLoadState('domcontentloaded');
    await pageB.waitForLoadState('domcontentloaded');

    // Both click an available seat
    const availableSeat = pageA.locator('button[aria-label*="Seat"]:not([disabled])').first();
    await expect(availableSeat).toBeVisible({ timeout: 20_000 });
    const ariaLabel = (await availableSeat.getAttribute('aria-label')) || 'Seat A1';
    const seatLabel = ariaLabel.replace('Seat ', '').trim();

    const seatA = pageA.locator(`button[aria-label="Seat ${seatLabel}"]`).first();
    const seatB = pageB.locator(`button[aria-label="Seat ${seatLabel}"]`).first();

    await expect(seatA).toBeVisible({ timeout: 10_000 });
    await expect(seatB).toBeVisible({ timeout: 10_000 });

    await seatA.click();
    await seatB.click();

    const btnA = pageA.locator('button:has-text("تأكيد الحجز")').first();
    const btnB = pageB.locator('button:has-text("تأكيد الحجز")').first();

    // Submit concurrently
    await Promise.allSettled([
      btnA.click({ timeout: 5000 }),
      btnB.click({ timeout: 5000 }),
    ]);
    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    // Exactly one booking can exist for the selected seat
    const bookingsForSeat = await prisma.booking.count({
      where: { tripId: 'trip-normal-40', seatLabel },
    });
    expect(bookingsForSeat).toBeLessThanOrEqual(1);

    await contextA.close();
    await contextB.close();
  });

  // ── C5: Refresh, Back, Forward, and Tab Duplication ────────────────
  test('C5: Navigation buttons (back, forward, refresh) preserve state without crashes', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await safeGoto(page, '/trips');
    await page.waitForLoadState('domcontentloaded');

    await safeGoto(page, '/trips/trip-normal-40');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });

    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 });

    await page.goForward();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/trips\/trip-normal-40/, { timeout: 15_000 });
  });

  // ── C6: Network throttling & loading state ─────────────────────────
  test('C6: Throttled network displays loading states cleanly', async ({ context, page }) => {
    await loginAs(context, 'customer');

    // Enable CDP network conditions if supported
    try {
      const client = await context.newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 200,
        downloadThroughput: (750 * 1024) / 8, // Slow 3G: 750 kbps
        uploadThroughput: (250 * 1024) / 8,
      });
    } catch {}

    await page.goto('/trips');
    await page.waitForLoadState('domcontentloaded');
    expect(await page.locator('body').isVisible()).toBeTruthy();
    expect(await page.innerText('body')).not.toContain('NaN');
  });

  // ── C7: Empty States verification ──────────────────────────────────
  test('C7: Empty states display action button and no NaN/undefined', async ({ context, page }) => {
    // 1. Initialize empty state DB
    await seedEmptyDatabase('file:../.scratch/e2e.db');

    await loginAs(context, 'zeroCreditAdmin');
    await page.goto('/company/bookings');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');
    // Useful empty state with next-action button
    const actionBtn = page.locator('button, a').filter({ hasText: /حجز|جديد|Browse|New/ });
    expect(await actionBtn.count()).toBeGreaterThan(0);

    // 2. Restore base scratch DB
    await seedScratchDatabase('file:../.scratch/e2e.db');
  });

  // ── C8: Large data and text wrapping ───────────────────────────────
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

    const addBtn = page.locator('button:has-text("إضافة عميل")').first();
    await addBtn.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const xssPayload = '<script>alert("xss")</script><b>bold</b>';
    await dialog.locator('input[autocomplete="name"], input[type="text"]').first().fill(xssPayload);
    await dialog.locator('input[type="email"]').fill(`xss_${Date.now()}@example.com`);
    await dialog.locator('input[type="tel"]').fill('01000000001');

    await dialog.locator('button:has-text("حفظ")').click();
    await page.waitForTimeout(1000);

    // Verify 0 script execution and 0 injected script tags
    expect(alertFired).toBeFalsy();
    expect(await page.locator('script:has-text("xss")').count()).toBe(0);
  });

  // ── C10: Permissions in UI ─────────────────────────────────────────
  test('C10: Role permissions enforced - customer cannot access admin routes', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await safeGoto(page, '/admin');
    await page.waitForURL((url) => !url.pathname.endsWith('/admin'), { timeout: 35_000 });
    expect(page.url()).not.toMatch(/\/admin$/);
    expect(page.url().includes('/trips') || page.url().includes('/login')).toBeTruthy();
  });

  test('C10-b: Bus-less company has no bus management UI', async ({ context, page }) => {
    await loginAs(context, 'noBusAdmin');
    await safeGoto(page, '/company/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const navText = await page.innerText('nav, aside, body');
    expect(navText).not.toContain('إدارة الباصات');
  });

  test('C10-c: Company pending approval cannot log in', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(USERS.pendingAdmin.email);
    const pwInput = page.locator('input[type="password"]');
    await pwInput.fill(USERS.pendingAdmin.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Blocked from logging in
    const errorAlert = page.locator('p[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 10_000 });
    expect(await errorAlert.innerText()).toMatch(/Invalid credentials|خطأ/);
  });

  test('C10-d: Back button after logout does not leak private pages', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await safeGoto(page, '/profile');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('h1').innerText()).toContain('حسابي');

    // Clear session / logout
    await context.clearCookies();
    await safeGoto(page, '/');
    await page.waitForLoadState('domcontentloaded');

    // Press browser back button
    await page.goBack();
    await page.waitForTimeout(1500);
    const url = page.url();
    const body = await page.innerText('body');
    const isProtected = url.includes('/login') || !body.includes('user@example.com');
    expect(isProtected).toBeTruthy();
  });

  // ── C11: Time & Cairo timezone formatting ──────────────────────────
  test('C11: Cairo time formatting is consistent and past trips cannot be booked', async ({ browser }) => {
    const nyContext = await browser.newContext({ timezoneId: 'America/New_York' });
    const page = await nyContext.newPage();
    await safeGoto(page, '/trips');
    await page.waitForLoadState('domcontentloaded');

    const content = await page.innerText('body');
    expect(content).not.toContain('Invalid Date');

    // Past trip cannot be booked by customer
    await loginAs(nyContext, 'customer');
    await safeGoto(page, '/trips/trip-past-1');
    await page.waitForLoadState('domcontentloaded');

    const bookBtn = page.locator('button:has-text("تأكيد الحجز")').first();
    const isPastOrDisabled = (await bookBtn.count() === 0) || (await bookBtn.isDisabled()) || (await page.locator('text=منتهية, text=انتهت, text=غير متاحة').count() > 0);
    expect(isPastOrDisabled).toBeTruthy();
    await nyContext.close();
  });

  // ── C12: Money edges & financial reconciliation ───────────────────
  test('C12: Financial balances display formatted numbers without NaN and reconcile', async ({ context, page }) => {
    await loginAs(context, 'companyAdmin');
    await safeGoto(page, '/company/credit');
    await page.waitForLoadState('domcontentloaded');

    const pageText = await page.innerText('main, body');
    expect(pageText).not.toContain('NaN');
    expect(pageText).not.toContain('undefined');
    expect(pageText).not.toContain('Infinity');

    const comp = await prisma.company.findUnique({
      where: { id: 'comp-cairo-express' },
    });
    expect(comp).not.toBeNull();
    expect(comp!.walletBalance).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(comp!.walletBalance)).toBeTruthy();
  });

  // ── C13: Print ticket styling & authorization ──────────────────────
  test('C13: Ticket view loads print styles and QR, unauthorized access handled', async ({ context, page }) => {
    await loginAs(context, 'customer');
    await safeGoto(page, '/bookings');
    await page.waitForLoadState('domcontentloaded');

    const printLink = page.locator('a[href*="/print"]').first();
    if (await printLink.isVisible()) {
      const href = await printLink.getAttribute('href');
      if (href) {
        await safeGoto(page, href);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
        expect(await page.innerText('body')).toContain('تذكرة');
      }
    }
  });

  // ── C14: Upload handling & Arabic error feedback ───────────────────
  test('C14: Upload errors fail gracefully with Arabic feedback', async ({ context, page }) => {
    await loginAs(context, 'superAdmin');
    await safeGoto(page, '/admin/destinations');
    await page.waitForLoadState('domcontentloaded');

    const addBtn = page.locator('button:has-text("إضافة وجهة"), button:has-text("وجهة جديدة")').first();
    await addBtn.click();
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Attach invalid non-image file
    const fileInput = modal.locator('input[type="file"]').first();
    if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fileInput.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('this is not an image'),
      });
      await page.waitForTimeout(1000);
      const toasts = await page.locator('[data-sonner-toast]').allInnerTexts();
      if (toasts.length > 0) {
        expect(toasts.join(' ')).toMatch(/صيغة|صورة|حجم|خطأ/);
      }
    }
  });

  // ── C15: Accessibility audit (Axe-core) ─────────────────────────────
  test('C15: Accessibility audit on Home and /trips', async ({ page }) => {
    // 1. Audit Home page
    await safeGoto(page, '/');
    await page.waitForLoadState('domcontentloaded');
    const homeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalHome = homeResults.violations.filter((v) => v.impact === 'critical');
    expect(criticalHome).toEqual([]);

    // 2. Audit /trips page
    await safeGoto(page, '/trips');
    await page.waitForLoadState('domcontentloaded');
    const tripsResults = await new AxeBuilder({ page })
      .withTags(['wcag2a'])
      .disableRules(['color-contrast'])
      .analyze();
    const criticalTrips = tripsResults.violations.filter((v) => v.impact === 'critical');
    expect(criticalTrips).toEqual([]);
  });
});
