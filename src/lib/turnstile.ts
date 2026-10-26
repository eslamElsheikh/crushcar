import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/clientIp'

/**
 * Cloudflare Turnstile, enforced only where it is configured.
 *
 * The whole feature is gated on two variables: with neither set the checks are
 * no-ops, which is how development, the e2e suite and any deploy that has not
 * bought into it keep working untouched. When they *are* set, production
 * refuses any request that does not carry a token Cloudflare will vouch for —
 * including when verification itself fails, because "the captcha service is
 * down" is exactly when an attacker wants to be walking through the door.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Placeholders that ship in .env.example; treated as "not configured". */
const PLACEHOLDERS = ['your-site-key', 'your-secret-key', 'changeme', 'xxx']

export interface TurnstileConfig {
  siteKey: string
  secret: string
  enabled: boolean
}

export function turnstileConfig(
  env: Record<string, string | undefined> = process.env
): TurnstileConfig {
  const siteKey = (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim()
  const secret = (env.TURNSTILE_SECRET_KEY ?? env.TURNSTILE_SECRET ?? '').trim()

  const usable = (value: string) =>
    value.length > 0 && !PLACEHOLDERS.includes(value.toLowerCase())

  return {
    siteKey,
    secret,
    enabled: usable(siteKey) && usable(secret),
  }
}

/**
 * Environments where a captcha must never block anything.
 *
 * `E2E=1` is set by scripts/start-e2e-server.mjs: the Playwright suite drives
 * the app with a headless browser that has no way to solve a challenge, and a
 * suite that silently passes because the feature is off is the point — it is
 * off *on purpose*, and the server-side path is covered by scripts/verify-turnstile.ts.
 */
export function isTestLike(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'test' || env.E2E === '1' || env.PLAYWRIGHT === '1'
}

/** The header a client may carry a token in, and the field name Cloudflare expects. */
export const TOKEN_HEADER = 'x-turnstile-token'

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Asks Cloudflare whether `token` is good.
 *
 * Anything other than `{"success": true}` is a refusal: a missing token, an
 * expired one, a mismatched site key, or the request to Cloudflare failing
 * outright. `error-codes` is reported so the log says *why* without leaking
 * anything to the caller.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | undefined,
  env: Record<string, string | undefined> = process.env
): Promise<VerifyResult> {
  const config = turnstileConfig(env)
  if (!config.enabled) return { ok: true }
  if (isTestLike(env)) return { ok: true }

  if (!token) return { ok: false, reason: 'no token' }

  try {
    const body = new URLSearchParams({ secret: config.secret, response: token })
    if (remoteIp) body.set('remoteip', remoteIp)

    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    })

    if (!res.ok) {
      return { ok: false, reason: `siteverify returned ${res.status}` }
    }

    const data = (await res.json()) as {
      success?: boolean
      'error-codes'?: string[]
    }

    if (data.success === true) return { ok: true }
    return {
      ok: false,
      reason: (data['error-codes'] ?? ['unknown']).join(','),
    }
  } catch (err) {
    // Fail closed: a transport error means we do not know who this is.
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'verification threw',
    }
  }
}

export function turnstileRejected(reason: string): NextResponse {
  console.warn('[turnstile] rejected:', reason)
  return NextResponse.json(
    { error: 'Captcha verification failed' },
    { status: 403 }
  )
}

/**
 * The policy, stated once and used by both entry points.
 *
 * Test-like environments pass unconditionally; an environment without keys
 * passes; and outside production a missing token passes so that local
 * development does not need a real site key. Production with keys set is the
 * only path where a token is genuinely compulsory — that is the "fail closed"
 * case the deployment has to be able to rely on.
 */
export async function evaluateTurnstile(
  token: string,
  remoteIp: string | undefined,
  env: Record<string, string | undefined> = process.env
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const config = turnstileConfig(env)
  if (!config.enabled) return { ok: true }
  if (isTestLike(env)) return { ok: true }

  if (!token) {
    if (env.NODE_ENV === 'production') return { ok: false, reason: 'no token' }
    // Development: the widget is not wired up without keys, so a request with
    // no token at all is a person running `npm run dev`, not an attacker.
    return { ok: true }
  }

  return verifyTurnstileToken(token, remoteIp, env)
}

/**
 * Gate for a route handler: null when the request may proceed, otherwise the
 * response to send.
 */
export async function requireTurnstile(
  req: NextRequest,
  env: Record<string, string | undefined> = process.env
): Promise<NextResponse | null> {
  const token = req.headers.get(TOKEN_HEADER)?.trim() || ''
  const verdict = await evaluateTurnstile(token, getClientIp(req), env)
  return verdict.ok ? null : turnstileRejected(verdict.reason)
}
