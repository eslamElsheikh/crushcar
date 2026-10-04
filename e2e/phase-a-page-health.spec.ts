import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { assertPageHealth } from './helpers/page-health';

test.describe('Phase A: Page Health - Anonymous Role', () => {
  const publicPages = [
    '/',
    '/trips',
    '/destinations',
    '/stations',
    '/credits',
    '/faq',
    '/login',
    '/register',
    '/register/company',
  ];

  for (const url of publicPages) {
    test(`health check for anonymous on ${url}`, async ({ page }) => {
      await assertPageHealth(page, url, {
        allowFailedUrls: url === '/trips' ? ['/api/trips'] : undefined,
      });
    });
  }

  test('interactivity: home search inputs & language toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Language toggle check
    const langBtn = page.locator('button[aria-label*="English"], button[aria-label*="العربية"]').first();
    if (await langBtn.isVisible()) {
      await langBtn.click();
      await page.waitForTimeout(300);
      const langBtn2 = page.locator('button[aria-label*="English"], button[aria-label*="العربية"]').first();
      await langBtn2.click();
      await page.waitForTimeout(300);
    }

    // FAQ accordions on home or /faq
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto('/faq', { waitUntil: 'domcontentloaded', timeout: 25_000 });
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await page.waitForTimeout(2000);
      }
    }
    const firstAccordion = page.locator('button:has-text("كيف"), button:has-text("ما هي")').first();
    if (await firstAccordion.isVisible()) {
      await firstAccordion.click();
      await page.waitForTimeout(200);
      await firstAccordion.click();
    }
  });
});

test.describe('Phase A: Page Health - Customer Role', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'customer');
  });

  const customerPages = [
    '/',
    '/trips',
    '/trips/trip-normal-40',
    '/bookings',
    '/profile',
  ];

  for (const url of customerPages) {
    test(`health check for customer on ${url}`, async ({ page }) => {
      await assertPageHealth(page, url);
    });
  }

  test('interactivity: customer bookings tabs switch', async ({ page }) => {
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');

    const tabs = ['upcoming', 'pending', 'past', 'cancelled'];
    for (const tab of tabs) {
      const tabButton = page.locator(`button[data-tab="${tab}"], button:has-text("${tab}")`).first();
      if (await tabButton.isVisible()) {
        await tabButton.click();
        await page.waitForTimeout(200);
      }
    }
  });
});

test.describe('Phase A: Page Health - Company Manager Role', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'companyAdmin');
  });

  const companyPages = [
    '/company/dashboard',
    '/company/bookings',
    '/company/bookings/new',
    '/company/charter',
    '/company/customers',
    '/company/credit',
    '/company/invoices',
    '/company/trip-requests',
    '/company/settings',
  ];

  for (const url of companyPages) {
    test(`health check for company manager on ${url}`, async ({ page }) => {
      await assertPageHealth(page, url);
    });
  }

  test('interactivity: company customers modal and search', async ({ page }) => {
    await page.goto('/company/customers');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('input[placeholder*="بحث"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('النيل');
      await page.waitForTimeout(300);
      await searchInput.fill('');
    }
  });
});

test.describe('Phase A: Page Health - Super Admin Role', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'superAdmin');
  });

  const adminPages = [
    '/admin',
    '/admin/trips',
    '/admin/trips/new',
    '/admin/buses',
    '/admin/bookings',
    '/admin/verify',
    '/admin/cancellations',
    '/admin/companies/pending',
    '/admin/deposit-requests',
    '/admin/credit-report',
    '/admin/charter-bookings',
    '/admin/destinations',
    '/admin/faqs',
    '/admin/users',
    '/admin/stations',
    '/admin/reports',
    '/admin/settings',
    '/admin/audit-log',
  ];

  for (const url of adminPages) {
    test(`health check for super admin on ${url}`, async ({ page }) => {
      await assertPageHealth(page, url);
    });
  }

  test('interactivity: admin filters and tabs on bookings & deposit requests', async ({ page }) => {
    await page.goto('/admin/deposit-requests');
    await page.waitForLoadState('domcontentloaded');

    // Click tabs / filter buttons
    const filterTabs = page.locator('button[data-status], button:has-text("الكل"), button:has-text("معلق")');
    const count = await filterTabs.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await filterTabs.nth(i).click();
      await page.waitForTimeout(200);
    }
  });
});
