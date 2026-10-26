import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Items 4 and 5 of the security pre-flight, observed from outside the app:
 * what actually leaves the server, not what the config says should.
 *
 * The suite runs against the dev server (scripts/start-e2e-server.mjs), so
 * two things are deliberately *conditional* rather than asserted:
 *   - HSTS must be ABSENT over plain http and PRESENT when a request claims
 *     https — both directions are asserted below.
 *   - The session cookie's `Secure` flag is tied to NODE_ENV === 'production'
 *     in src/lib/auth.ts, so it is asserted against the production server in
 *     the build verification, not here where NODE_ENV is 'development'.
 */

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:../.scratch/e2e.db' } },
});

test.beforeEach(({}, testInfo) => {
  // These assertions are about HTTP headers, not layout, so they run once
  // instead of under all ten viewport projects. That is not cosmetic: the
  // login limiter is a real per-server counter, and this spec charges it
  // (deliberately, to prove the counter is shared). Ten projects would spend
  // ~20 of a production-realistic 15-per-15-minutes budget and lock the
  // suite — and any real user — out of login for the rest of the window.
  test.skip(
    testInfo.project.name !== 'Chromium desktop 1280',
    'protocol-level assertions; one viewport project is enough'
  );
});

/** Pulls the nonce out of the script-src directive of a CSP header. */
function scriptNonce(csp: string | undefined): string | null {
  if (!csp) return null;
  const scriptSrc = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('script-src'));
  const match = scriptSrc?.match(/'nonce-([^']+)'/);
  return match ? match[1] : null;
}

/** The CSP as a directive map, so assertions can talk about one at a time. */
function directives(csp: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (csp ?? '').split(';')) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) out[name] = rest.join(' ');
  }
  return out;
}

test.describe('Security headers (item 4)', () => {
  test('the document response carries the full hardening set', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);

    const h = res.headers();
    const csp = h['content-security-policy'];

    // CSP: present, frame-ancestors 'none', no eval, no inline script.
    expect(csp, 'Content-Security-Policy must be sent').toBeTruthy();
    const dirs = directives(csp);
    expect(dirs['frame-ancestors']).toBe("'none'");
    expect(dirs['object-src']).toBe("'none'");
    expect(dirs['default-src']).toContain("'self'");
    expect(dirs['script-src']).toContain("'strict-dynamic'");
    expect(dirs['script-src']).toContain("'self'");
    expect(dirs['script-src'], 'script-src must be nonce-based, not inline').not.toContain(
      "'unsafe-inline'"
    );
    // `unsafe-eval` is banned in the shipped policy. The middleware adds it to
    // script-src in development ONLY, because Next's React Refresh runtime
    // evaluates hot-reload payloads with `new Function` — under `next dev` the
    // strict policy would break every client component. Production, which is
    // what this guard protects, is asserted eval-free by
    // `npm run check:prod-boot` (which boots the real standalone build).
    //
    // The dev signal is `connect-src` admitting ws:/wss: — set from that same
    // isDev flag, and an independent token from the unsafe-eval being tested,
    // so a production server cannot excuse itself with it.
    const isNextDev = (dirs['connect-src'] ?? '').includes('ws:');
    if (isNextDev) {
      // Development: still must not widen anything else.
      expect(dirs['script-src'], 'dev CSP keeps its nonce').toMatch(/'nonce-[^']+'/);
      expect(dirs['script-src'], 'dev CSP keeps strict-dynamic').toContain("'strict-dynamic'");
      expect(dirs['script-src'], 'dev CSP keeps no unsafe-inline').not.toContain("'unsafe-inline'");
    } else {
      expect(csp, 'no eval anywhere in the production policy').not.toContain("'unsafe-eval'");
    }
    expect(dirs['form-action']).toContain("'self'");
    expect(dirs['base-uri']).toContain("'self'");

    // The static set from next.config.ts.
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['permissions-policy']).toContain('microphone=()');
    expect(h['permissions-policy']).toContain('geolocation=()');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');

    // Nothing that advertises the stack, and no HSTS on plain http.
    expect(h['x-powered-by']).toBeUndefined();
    expect(h['strict-transport-security']).toBeUndefined();
  });

  test('the nonce is minted per request and stamped onto the HTML', async ({ request }) => {
    const first = await request.get('/');
    const second = await request.get('/');
    const nonceA = scriptNonce(first.headers()['content-security-policy']);
    const nonceB = scriptNonce(second.headers()['content-security-policy']);

    expect(nonceA, 'a nonce must be present').toBeTruthy();
    expect(nonceB, 'a nonce must be present').toBeTruthy();
    // A nonce shared by every response is worth exactly as much as 'unsafe-inline'.
    expect(nonceA).not.toBe(nonceB);

    // And the renderer has to have used *that* nonce, not its own: the raw
    // HTML is compared rather than the DOM, because Chromium hides nonce
    // attribute values from getAttribute once a page has parsed.
    const html = await first.text();
    expect(html).toContain(`nonce="${nonceA}"`);
    expect(html).not.toContain(`nonce="${nonceB}"`);
  });

  test('HSTS goes out only when the request claims https', async ({ request }) => {
    const plain = await request.get('/');
    expect(plain.headers()['strict-transport-security']).toBeUndefined();

    const tls = await request.get('/', { headers: { 'x-forwarded-proto': 'https' } });
    const hsts = tls.headers()['strict-transport-security'];
    expect(hsts, 'HSTS must be sent when the request arrived over TLS').toBeTruthy();
    expect(hsts).toContain('max-age=63072000');
    expect(hsts).toContain('includeSubDomains');
  });

  test('API responses get the same treatment', async ({ request }) => {
    const res = await request.get('/api/public/stats');
    expect([200, 429]).toContain(res.status());
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['content-security-policy'], 'middleware covers /api too').toBeTruthy();
    expect(h['x-powered-by']).toBeUndefined();
  });
});

test.describe('Session cookie flags (item 4)', () => {
  const email = `sec-headers-${Date.now()}@example.com`;
  const password = 'Headers123!';

  test.beforeAll(async () => {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: 'Security Headers Test',
        password: await bcrypt.hash(password, 4),
        role: 'CUSTOMER',
        isActive: true,
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  test('the session cookie is HttpOnly and SameSite=Lax', async ({ request }) => {
    // Real credentials login through NextAuth — the cookie flags under test
    // are the ones *this server* writes, not ones a test harness injected.
    const csrfRes = await request.get('/api/auth/csrf');
    expect(csrfRes.status()).toBe(200);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    expect(csrfToken).toBeTruthy();

    const res = await request.post('/api/auth/callback/credentials', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Auth.js answers JSON instead of redirecting when asked this way —
        // the same pair next-auth/react sends.
        Accept: 'application/json',
        'X-Auth-Return-Redirect': '1',
      },
      form: { csrfToken, email, password, callbackUrl: '/', redirect: 'false' },
    });

    expect(res.status(), 'the seeded credentials must log in').toBeLessThan(400);

    // headersArray(), not headers(): several Set-Cookie headers may be sent,
    // and the plain map folds duplicates into one comma-joined string.
    const setCookie = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
      .join('\n');
    expect(setCookie, 'a session cookie must be issued').toContain('next-auth.session-token=');
    expect(setCookie, 'the session cookie must not be readable from JS').toContain('HttpOnly');
    expect(setCookie, 'the session cookie must be SameSite=Lax').toContain('SameSite=Lax');
    expect(setCookie, 'the session cookie must be scoped to /').toContain('Path=/');
    // Over plain http in development `Secure` would make the cookie
    // unusable, so it is set only in production — see src/lib/auth.ts:139 and
    // the production verification, which asserts it on a real prod server.
    if (process.env.EXPECT_SECURE_COOKIES === '1') {
      expect(setCookie, 'the session cookie must be Secure in production').toContain('Secure');
    }
  });
});

test.describe('Rate-limit identity cannot be spoofed (item 5)', () => {
  /** Two requests from two *claimed* identities; the budget must not reset. */
  async function assertSameBucket(
    label: string,
    send: (headers: Record<string, string>) => Promise<import('@playwright/test').APIResponse>
  ) {
    const first = await send({ 'x-forwarded-for': '198.51.100.10' });
    const second = await send({ 'x-forwarded-for': '203.0.113.99' });

    const a = first.headers()['x-ratelimit-remaining'];
    const b = second.headers()['x-ratelimit-remaining'];
    expect(a, `${label}: the first response must report its budget`).toBeTruthy();
    expect(b, `${label}: the second response must report its budget`).toBeTruthy();
    expect(
      Number(b),
      `${label}: a forged X-Forwarded-For must not hand the caller a fresh bucket ` +
        `(${a} -> ${b})`
    ).toBe(Number(a) - 1);
  }

  test('anonymous tracking (stats) shares one bucket across forged IPs', async ({ request }) => {
    await assertSameBucket('tracking-stats', (headers) =>
      request.get('/api/public/stats', { headers })
    );
  });

  test('booking lookup shares one bucket across forged IPs', async ({ request }) => {
    // Anonymous: charged by the limiter before the 401, which is the point —
    // an unauthenticated flood is exactly what the limit is for.
    await assertSameBucket('booking-lookup', (headers) =>
      request.get('/api/bookings', { headers })
    );
  });

  test('checkout shares one bucket across forged IPs', async ({ request }) => {
    await assertSameBucket('booking-checkout', (headers) =>
      request.post('/api/bookings', {
        headers: { 'content-type': 'application/json', ...headers },
        data: '{}',
      })
    );
  });

  test('login attempts share one bucket across forged IPs', async ({ request }) => {
    // Two failed attempts with two different forged source addresses. The
    // attempt counter must decrease across both, which it can only do if the
    // limiter charged the same identity both times.
    const attempt = async (spoofedIp: string) => {
      const csrfRes = await request.get('/api/auth/csrf');
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      return request.post('/api/auth/callback/credentials', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'X-Auth-Return-Redirect': '1',
          'x-forwarded-for': spoofedIp,
        },
        form: {
          csrfToken,
          email: 'definitely-not-a-user@example.com',
          password: 'wrong-password',
          callbackUrl: '/',
          redirect: 'false',
        },
      });
    };

    const first = await attempt('198.51.100.10');
    const second = await attempt('203.0.113.99');

    const a = first.headers()['x-ratelimit-remaining'];
    const b = second.headers()['x-ratelimit-remaining'];
    expect(a, 'a login attempt must report its remaining budget').toBeTruthy();
    expect(b, 'a login attempt must report its remaining budget').toBeTruthy();
    expect(
      Number(b),
      `a forged X-Forwarded-For must not reset the login counter (${a} -> ${b})`
    ).toBe(Number(a) - 1);
  });
});
