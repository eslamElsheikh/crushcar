import { NextRequest, NextResponse } from 'next/server'
import {
  applyRateLimitHeaders,
  rateLimitRequest,
  rateLimitResponse,
  type RateLimitOutcome,
} from '@/lib/rateLimitHttp'
import { getRateLimitHeaders } from '@/lib/rateLimit'

/**
 * What has to happen to every request before it reaches a route: the security
 * headers that vary per request, and the one throttle that has to fire before
 * the handler it protects.
 *
 * `Content-Security-Policy` lives here rather than in next.config.ts because a
 * nonce is worth nothing if it is the same for every page: a nonce that is
 * known before the response is sent lets an attacker satisfy the policy as
 * easily as 'unsafe-inline' would. So one is minted for each request, handed to
 * the renderer through the request headers (Next reads `content-security-policy`
 * off the request and stamps the nonce onto its own <script> tags), and echoed
 * on the response.
 *
 * Everything that is the same for every request stays in next.config.ts.
 */

/** The policy body. Only `frameSrc` varies, and only with configuration. */
function buildCsp(nonce: string, isDev: boolean): string {
  // The challenge runs in a Cloudflare iframe, so frame-src has to admit it —
  // but only when Turnstile is actually configured. Leaving it open when the
  // feature is off would be an allowance for a thing that never happens.
  const turnstileEnabled = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
      process.env.TURNSTILE_SECRET_KEY
  )
  const frameSrc = turnstileEnabled
    ? `frame-src 'self' https://challenges.cloudflare.com`
    : `frame-src 'none'`

  const directives = [
    `default-src 'self'`,
    // The scripts Next emits are nonce'd; 'strict-dynamic' then lets those
    // load the chunk graph without an origin allow-list, and it makes
    // 'self'/'unsafe-inline' in script-src inert for older parsers.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // React sets style attributes and Next injects its stylesheet this way;
    // a nonce on every style tag is not reachable from App Router.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src 'self' data: blob:`,
    // Webpack/Turbopack HMR talks over ws:// in development only.
    isDev ? `connect-src 'self' ws: wss:` : `connect-src 'self'`,
    `object-src 'none'`,
    frameSrc,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `manifest-src 'self'`,
    `worker-src 'self'`,
  ]
  return directives.join('; ')
}

/**
 * HSTS only ever goes out over TLS. Sending it on plain http is pointless —
 * browsers drop it — and pinning `localhost` to https is a good way to make a
 * developer's machine unable to reach their own server for the next 180 days.
 */
function isHttps(request: NextRequest): boolean {
  if (request.nextUrl.protocol === 'https:') return true

  const forwarded = request.headers.get('x-forwarded-proto')
  if (!forwarded) return false

  return forwarded
    .split(',')
    .map((part) => part.trim())
    .includes('https')
}

/**
 * Credentials login, throttled before NextAuth ever sees the attempt.
 *
 * It sits in middleware rather than in `authorize()` because the useful answer
 * to "too many attempts" is a 429 with a Retry-After, and a route-level check
 * inside Auth.js can only answer "wrong password", which is the one reply a
 * brute-force script is happy to receive.
 *
 * Counting here is also the only place that sees every attempt: a wrong
 * password, a right password for a deactivated account, and a missing CSRF
 * token all arrive at this same URL.
 */
const LOGIN_BUCKET = 'auth-login'
const LOGIN_MAX_ATTEMPTS = 15
const LOGIN_WINDOW_MS = 15 * 60_000

function loginAttempt(request: NextRequest): RateLimitOutcome | null {
  if (request.method !== 'POST') return null
  if (request.nextUrl.pathname !== '/api/auth/callback/credentials') return null

  return rateLimitRequest(
    request,
    LOGIN_BUCKET,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_MS
  )
}

/** HSTS belongs on every response this module produces, not just the pass-through. */
function applyTransportHeaders(
  response: NextResponse,
  request: NextRequest
): NextResponse {
  if (isHttps(request)) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains'
    )
  }
  return response
}

export function middleware(request: NextRequest) {
  // Charged before anything else sees the attempt, so a flood cannot borrow
  // time from the handler it is trying to reach.
  const login = loginAttempt(request)
  if (login && !login.allowed) {
    return applyTransportHeaders(rateLimitResponse(login), request)
  }

  const isDev = process.env.NODE_ENV !== 'production'
  const nonce = crypto.randomUUID()
    .toString()
    .replace(/-/g, '')
    .slice(0, 22)

  const csp = buildCsp(nonce, isDev)

  // Next reads the nonce off the *request*, so it has to travel both ways.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  response.headers.set('Content-Security-Policy', csp)

  // On a login attempt, report the budget that attempt consumed. This is how
  // an operator (or a test) sees which identity the limiter charged without
  // having to spend the whole window to find out.
  if (login) applyRateLimitHeaders(response, getRateLimitHeaders(login))

  return applyTransportHeaders(response, request)
}

export const config = {
  // Static assets are served with their own caching rules and are not
  // documents — a CSP on a .js file governs nothing. Everything else,
  // API routes included, gets the full set.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}
