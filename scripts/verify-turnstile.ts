/**
 * Cloudflare Turnstile policy (item 6) — the server-side half.
 *
 * Run: npx tsx scripts/verify-turnstile.ts   (or: npm run check:turnstile)
 *
 * The e2e suite cannot cover this: E2E=1 makes the feature a no-op by design,
 * so nothing Playwright does would exercise a real verification. Cloudflare is
 * therefore stubbed here, and the assertions are about the *policy* — when the
 * feature is on, off, passing, or refusing — plus the fail-closed behaviour
 * that only shows up when the remote call breaks.
 */
import { evaluateTurnstile, isTestLike, turnstileConfig, TOKEN_HEADER } from '../src/lib/turnstile'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

type FetchCall = { url: string; body: string }

const realFetch = globalThis.fetch

function stubFetch(
  impl: (call: FetchCall) => Promise<Response> | Response
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (url: any, init?: any) => {
    const call: FetchCall = {
      url: String(url),
      body: String(init?.body ?? ''),
    }
    calls.push(call)
    return impl(call)
  }) as any
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch
    },
  }
}

const KEYS = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAA-test-site-key',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAA-test-secret-key',
}

async function main() {
  console.log('turnstileConfig — when the feature counts as enabled')
  check('no keys: disabled', turnstileConfig({}).enabled === false)
  check('site key only: disabled', turnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'x' }).enabled === false)
  check('secret only: disabled', turnstileConfig({ TURNSTILE_SECRET_KEY: 'x' }).enabled === false)
  check('both keys: enabled', turnstileConfig({ ...KEYS }).enabled === true)
  check(
    'the .env.example placeholder counts as disabled',
    turnstileConfig({
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'your-site-key',
      TURNSTILE_SECRET_KEY: 'your-secret-key',
    }).enabled === false
  )
  check(
    'whitespace-only keys count as disabled',
    turnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: '  ', TURNSTILE_SECRET_KEY: ' ' }).enabled === false
  )
  check(
    'TURNSTILE_SECRET is accepted as an alias',
    turnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'x', TURNSTILE_SECRET: 'y' }).enabled === true
  )

  console.log('isTestLike — where a captcha must never block')
  check('NODE_ENV=test is test-like', isTestLike({ NODE_ENV: 'test' }) === true)
  check('E2E=1 is test-like', isTestLike({ E2E: '1' }) === true)
  check('PLAYWRIGHT=1 is test-like', isTestLike({ PLAYWRIGHT: '1' }) === true)
  check('production is not test-like', isTestLike({ NODE_ENV: 'production' }) === false)
  check('E2E=0 is not test-like', isTestLike({ E2E: '0' }) === false)

  console.log('evaluateTurnstile — disabled means no-op everywhere')
  for (const NODE_ENV of ['production', 'development', 'test']) {
    const r = await evaluateTurnstile('', undefined, { NODE_ENV })
    check(`no keys + ${NODE_ENV}: passes`, r.ok === true)
  }

  console.log('evaluateTurnstile — enabled')
  {
    const r = await evaluateTurnstile('', undefined, { ...KEYS, NODE_ENV: 'test' })
    check('enabled + test: passes without a token', r.ok === true)
  }
  {
    const r = await evaluateTurnstile('', undefined, { ...KEYS, E2E: '1' })
    check('enabled + E2E=1: passes without a token', r.ok === true)
  }
  {
    const r = await evaluateTurnstile('', undefined, { ...KEYS, NODE_ENV: 'production' })
    check('enabled + production + no token: REJECTED (fail closed)', r.ok === false)
    check('  the reason is "no token"', (r as any).reason === 'no token')
  }
  {
    const r = await evaluateTurnstile('', undefined, { ...KEYS, NODE_ENV: 'development' })
    check('enabled + development + no token: passes (a person running npm run dev)', r.ok === true)
  }

  console.log('evaluateTurnstile — the siteverify call')
  {
    const stub = stubFetch(() => Response.json({ success: true }))
    const r = await evaluateTurnstile('token-abc', '203.0.113.5', { ...KEYS, NODE_ENV: 'production' })
    check('a token Cloudflare accepts passes', r.ok === true)
    check('exactly one call was made', stub.calls.length === 1)
    check(
      'the call goes to Cloudflare siteverify',
      stub.calls[0].url.includes('challenges.cloudflare.com/turnstile/v0/siteverify')
    )
    const params = new URLSearchParams(stub.calls[0].body)
    check('the secret is sent', params.get('secret') === KEYS.TURNSTILE_SECRET_KEY)
    check('the response token is sent', params.get('response') === 'token-abc')
    check('the derived client ip is sent', params.get('remoteip') === '203.0.113.5')
    stub.restore()
  }
  {
    const stub = stubFetch(() =>
      Response.json({ success: false, 'error-codes': ['invalid-input-response'] })
    )
    const r = await evaluateTurnstile('bad', undefined, { ...KEYS, NODE_ENV: 'production' })
    check('a token Cloudflare rejects is refused', r.ok === false)
    check('the error code is surfaced in the reason', (r as any).reason === 'invalid-input-response')
    stub.restore()
  }
  {
    const stub = stubFetch(() => new Response('upstream down', { status: 503 }))
    const r = await evaluateTurnstile('token', undefined, { ...KEYS, NODE_ENV: 'production' })
    check('a non-2xx siteverify is refused (fail closed)', r.ok === false)
    stub.restore()
  }
  {
    const stub = stubFetch(() => {
      throw new Error('network unreachable')
    })
    const r = await evaluateTurnstile('token', undefined, { ...KEYS, NODE_ENV: 'production' })
    check('a thrown fetch is refused (fail closed)', r.ok === false)
    check('the transport error is the reason', (r as any).reason === 'network unreachable')
    stub.restore()
  }
  {
    const stub = stubFetch(() => Response.json({}))
    const r = await evaluateTurnstile('token', undefined, { ...KEYS, NODE_ENV: 'production' })
    check('an ambiguous body with no success flag is refused', r.ok === false)
    stub.restore()
  }
  {
    // The interesting ordering: production, enabled, token present — the call
    // must happen *before* anything else, and a test-like environment must
    // never reach the network at all.
    const stub = stubFetch(() => Response.json({ success: false }))
    await evaluateTurnstile('token', undefined, { ...KEYS, NODE_ENV: 'test' })
    check('test-like never calls Cloudflare', stub.calls.length === 0)
    stub.restore()
  }

  check('the token header name is lowercase-stable', TOKEN_HEADER === 'x-turnstile-token')

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all checks passed')
}

main().catch((err) => {
  globalThis.fetch = realFetch
  console.error(err)
  process.exit(1)
})
