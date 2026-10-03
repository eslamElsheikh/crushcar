import { test, expect } from '@playwright/test';

test.describe('Phase D: Production Smoke (Read-Only)', () => {
  const targetBaseUrl = process.env.BASE_URL || 'http://127.0.0.1:3002';

  test('Public home page loads cleanly with header and footer', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const res = await page.goto(`${targetBaseUrl}/`);
    expect(res?.status()).toBe(200);

    // Header visible
    await expect(page.locator('header').first()).toBeVisible();

    // Footer visible
    await expect(page.locator('footer').first()).toBeVisible();

    // Wordmark / Brand visible
    const brand = page.locator('img[alt*="Safro"], a[href="/"] img, a[href="/"]:has-text("سافرو")').first();
    await expect(brand).toBeVisible();

    // Clean console
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('Download the React DevTools') && !e.includes('favicon.ico') && !e.includes('ERR_NO_BUFFER_SPACE')
    );
    expect(fatalErrors).toEqual([]);
  });

  test('Trips search page renders without errors', async ({ page }) => {
    const res = await page.goto(`${targetBaseUrl}/trips`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('Destinations page renders with destination images', async ({ page }) => {
    const res = await page.goto(`${targetBaseUrl}/destinations`);
    expect(res?.status()).toBe(200);

    const images = page.locator('img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Image Credits page renders', async ({ page }) => {
    const res = await page.goto(`${targetBaseUrl}/credits`);
    expect(res?.status()).toBe(200);
    expect(await page.innerText('body')).toContain('حقوق الصور');
  });

  test('Login page loads and displays credentials form', async ({ page }) => {
    const res = await page.goto(`${targetBaseUrl}/login`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test('Protected routes redirect unauthenticated users without credentials', async ({ page }) => {
    // Admin route redirects
    await page.goto(`${targetBaseUrl}/admin`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // Company route redirects
    await page.goto(`${targetBaseUrl}/company/dashboard`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('Header and footer navigation links are intact', async ({ page }) => {
    await page.goto(`${targetBaseUrl}/`);
    await page.waitForLoadState('domcontentloaded');

    const internalLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href^="/"]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !h.startsWith('//') && !h.includes('#')) as string[];
    });

    expect(internalLinks.length).toBeGreaterThan(5);
  });
});
