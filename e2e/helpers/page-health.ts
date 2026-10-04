import { Page, expect } from '@playwright/test';

export interface HealthCheckOptions {
  allowFailedUrls?: string[];
  checkHorizontalScroll?: boolean;
}

export async function assertPageHealth(
  page: Page,
  url: string,
  options: HealthCheckOptions = {}
) {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const failedRequests: string[] = [];

  const consoleListener = (msg: any) => {
    const text = msg.text();
    // Exclude react-query or harmless next-auth noise if any
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    } else if (msg.type() === 'warning' && text.toLowerCase().includes('hydration')) {
      consoleErrors.push(`Hydration warning: ${text}`);
    }
  };

  const pageErrorListener = (err: Error) => {
    consoleErrors.push(`Uncaught: ${err.message}`);
  };

  const responseListener = (res: any) => {
    const status = res.status();
    const reqUrl = res.url();
    if (status >= 400 && !options.allowFailedUrls?.some((u) => reqUrl.includes(u))) {
      // Ignore 401/403 if it's an expected session check or unauthenticated trips query
      if ((status === 401 || status === 403) && (reqUrl.includes('/api/auth/session') || reqUrl.includes('/api/trips'))) {
        return;
      }
      failedRequests.push(`${status} ${res.request().method()} ${reqUrl}`);
    }
  };

  page.on('console', consoleListener);
  page.on('pageerror', pageErrorListener);
  page.on('response', responseListener);

  try {
    let response: any = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35_000 });
        break;
      } catch (navErr) {
        if (attempt === 2) throw navErr;
        await page.waitForTimeout(2500);
      }
    }
    expect(response?.status()).toBeLessThan(400);

    // Wait a brief moment for dynamic hydration & queries
    await page.waitForTimeout(600);

    // Check for Next.js error overlay
    const nextErrorOverlay = await page.$('nextjs-portal [data-nextjs-dialog-overlay], [data-nextjs-toast-errors]');
    expect(nextErrorOverlay).toBeNull();

    // Check for broken images
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .filter((img) => img.complete && img.naturalWidth === 0 && !img.src.includes('data:'))
        .map((img) => img.src);
    });
    expect(brokenImages).toEqual([]);

    // Check dead internal links (check unique internal hrefs for 404)
    const internalLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/"]'))
        .map(a => a.getAttribute('href') || '')
        .filter(h => h && !h.startsWith('//') && !h.startsWith('/api') && !h.includes('#'));
      return Array.from(new Set(links)).slice(0, 4);
    });
    const deadLinks: string[] = [];
    for (const href of internalLinks) {
      try {
        const res = await page.request.head(href, { timeout: 4000 });
        if (res.status() === 404) deadLinks.push(href);
      } catch {}
    }
    expect(deadLinks, `Dead internal links on ${url}`).toEqual([]);

    // Check horizontal scroll if enabled or on mobile
    const isMobile = (page.viewportSize()?.width || 1280) <= 450;
    if (isMobile || options.checkHorizontalScroll) {
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      });
      expect(hasHorizontalScroll, `Horizontal scroll detected on ${url} at ${page.viewportSize()?.width}px`).toBeFalsy();
    }

    // Check RTL direction
    const dir = await page.evaluate(() => document.documentElement.dir || document.body.dir || document.querySelector('[dir]')?.getAttribute('dir'));
    // Pages in Arabic should have dir="rtl" or language store set to ar
    expect(dir).toBeTruthy();

    // Check for raw translation keys
    const rawKeys = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const found: string[] = [];
      const regex = /\b(v2|admin|company|booking|nav|status)\.[a-zA-Z0-9_.-]{3,}\b/;
      let node;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue?.trim();
        if (
          text &&
          regex.test(text) &&
          !text.includes('@') &&
          !text.includes('.com') &&
          !text.includes('.org') &&
          !text.includes('.net') &&
          !text.includes('.json') &&
          !text.includes('http')
        ) {
          found.push(text);
        }
      }
      return found;
    });
    expect(rawKeys, `Raw translation keys detected on ${url}`).toEqual([]);

    // Check console errors
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('Download the React DevTools') &&
             !e.includes('favicon.ico') &&
             !e.includes('ERR_NO_BUFFER_SPACE') &&
             !e.includes('401 (Unauthorized)') &&
             !e.includes('the server responded with a status of 401') &&
             !e.includes('net::ERR_CONNECTION_REFUSED') &&
             !e.includes('net::ERR_ABORTED') &&
             !e.includes('net::ERR_NAME_NOT_RESOLVED') &&
             !e.includes('net::ERR_INTERNET_DISCONNECTED')
    );
    expect(fatalErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  } finally {
    page.off('console', consoleListener);
    page.off('pageerror', pageErrorListener);
    page.off('response', responseListener);
  }
}
