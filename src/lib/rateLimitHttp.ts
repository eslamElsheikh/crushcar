import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/clientIp'

/**
 * The request-facing edge of the rate limiter.
 *
 * Kept apart from src/lib/rateLimit.ts on purpose: that module is pure Node
 * with no Next.js import, so the store can be exercised directly in tests.
 * Everything that has to know what a request *is* lives here.
 *
 * Every limiter in the app must go through `rateLimitRequest`. Taking an IP
 * from `req.headers` inline is the one-line mistake that turns the whole thing
 * into decoration, and it is invisible in review.
 */

export interface RateLimitOutcome {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Charges one request against `bucket` for the caller it is attributed to.
 */
export function rateLimitRequest(
  req: NextRequest | { headers: { get(name: string): string | null } },
  bucket: string,
  maxRequests: number,
  windowMs: number
): RateLimitOutcome {
  const ip = getClientIp(req)
  return rateLimit(`${bucket}:${ip}`, maxRequests, windowMs)
}

/**
 * The 429 a tripped limiter sends.
 *
 * Deliberately terse: the count of attempts already made and the exact moment
 * the window resets both tell an attacker how to pace around the limit, so
 * only Retry-After (which the client needs to stop retrying) is disclosed.
 */
export function rateLimitResponse(result: RateLimitOutcome): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
  return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
      ...getRateLimitHeaders(result),
    },
  })
}

/**
 * The result of a limit check: the 429 to send if the budget is spent, and
 * the headers to echo on the response that *is* sent either way.
 *
 * `headers` exists so the budget is observable without spending it. Without
 * them the only way to prove which identity a route charged is to trip the
 * limit — which poisons a real bucket for every other caller — and a limiter
 * whose identity you cannot see in production is one you cannot audit.
 */
export interface RateLimitCheck {
  blocked: NextResponse | null
  headers: Record<string, string>
}

/**
 * Convenience for a route:
 *
 *   const rl = checkRateLimit(req, 'booking-lookup', 240, 60_000)
 *   if (rl.blocked) return rl.blocked
 *   …
 *   return NextResponse.json(data, { headers: rl.headers })
 */
export function checkRateLimit(
  req: NextRequest,
  bucket: string,
  maxRequests: number,
  windowMs: number
): RateLimitCheck {
  const result = rateLimitRequest(req, bucket, maxRequests, windowMs)
  const headers = getRateLimitHeaders(result)
  return result.allowed
    ? { blocked: null, headers }
    : { blocked: rateLimitResponse(result), headers }
}

/**
 * Echoes the budget on a response the route built itself. Used where the
 * success path is assembled somewhere that is not this module (a transaction
 * wrapper, for instance).
 */
export function applyRateLimitHeaders(
  response: NextResponse,
  headers: Record<string, string>
): NextResponse {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
}
