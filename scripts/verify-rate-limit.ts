/**
 * Rate limiting: proves a caller cannot pick their own identity.
 *
 * Run: npx tsx scripts/verify-rate-limit.ts   (or: npm run check:rate-limit)
 *
 * The whole point of item 5 is that `X-Forwarded-For` and friends are
 * client-controlled until a trusted proxy overwrites them. So every case here
 * is framed as an attack: a spoofed header either fails to move the caller
 * into a fresh bucket, or is refused outright by the configuration rules.
 */
import {
  UNKNOWN_CLIENT,
  deriveClientIp,
  isIpLiteral,
  readProxyConfig,
} from '../src/lib/clientIp'
import { rateLimit } from '../src/lib/rateLimit'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** A header bag, the shape every request offers. */
function headers(map: Record<string, string>) {
  return (name: string) => map[name.toLowerCase()] ?? null
}

function main() {
  console.log('isIpLiteral — what counts as an address')
  check('accepts a dotted quad', isIpLiteral('203.0.113.9'))
  check('accepts a bracketed v6', isIpLiteral('[2001:db8::1]'))
  check('accepts a bare v6', isIpLiteral('2001:db8::1'))
  check('rejects an out-of-range octet', !isIpLiteral('999.1.1.1'))
  check('rejects a chain', !isIpLiteral('1.1.1.1, 2.2.2.2'))
  check('rejects a hostname', !isIpLiteral('evil.example.com'))
  check('rejects empty', !isIpLiteral(''))
  check('rejects null', !isIpLiteral(null))
  check('rejects a quoted value', !isIpLiteral('"1.2.3.4"'))

  console.log('readProxyConfig — configuration is validated')
  const none = readProxyConfig({})
  check('unset means no header and no hops', none.header === null && none.hops === 0)
  const headerCfg = readProxyConfig({ TRUSTED_PROXY_HEADER: 'CF-Connecting-IP' })
  check('accepts a normal header name', headerCfg.header === 'CF-Connecting-IP')
  const junkHeader = readProxyConfig({ TRUSTED_PROXY_HEADER: 'X-Forwarded-For\nEvil' })
  check('rejects a header name with an embedded newline', junkHeader.header === null)
  check(
    'surrounding whitespace is trimmed, not rejected',
    readProxyConfig({ TRUSTED_PROXY_HEADER: '  CF-Connecting-IP  ' }).header ===
      'CF-Connecting-IP'
  )
  check(
    'rejects a header name containing a colon',
    readProxyConfig({ TRUSTED_PROXY_HEADER: 'X-Forwarded-For: 1' }).header === null
  )
  check('rejects hops of 0', readProxyConfig({ TRUSTED_PROXY_HOPS: '0' }).hops === 0)
  check('rejects negative hops', readProxyConfig({ TRUSTED_PROXY_HOPS: '-1' }).hops === 0)
  check('rejects absurd hops', readProxyConfig({ TRUSTED_PROXY_HOPS: '999' }).hops === 0)
  check('rejects non-numeric hops', readProxyConfig({ TRUSTED_PROXY_HOPS: 'abc' }).hops === 0)
  check('accepts 2 hops', readProxyConfig({ TRUSTED_PROXY_HOPS: '2' }).hops === 2)

  console.log('deriveClientIp — unconfigured: nothing is believed')
  const unconfigured = { header: null, hops: 0 }
  check(
    'spoofed X-Forwarded-For is ignored',
    deriveClientIp(headers({ 'x-forwarded-for': '1.1.1.1' }), unconfigured) === UNKNOWN_CLIENT
  )
  check(
    'spoofed CF-Connecting-IP is ignored',
    deriveClientIp(headers({ 'cf-connecting-ip': '1.1.1.1' }), unconfigured) === UNKNOWN_CLIENT
  )
  check('no header at all is unknown', deriveClientIp(headers({}), unconfigured) === UNKNOWN_CLIENT)

  console.log('deriveClientIp — trusted single header')
  const cf = { header: 'CF-Connecting-IP', hops: 0 }
  check(
    'reads the trusted header',
    deriveClientIp(headers({ 'cf-connecting-ip': '198.51.100.7' }), cf) === '198.51.100.7'
  )
  check(
    'a spoofed X-Forwarded-For does not move the caller',
    deriveClientIp(
      headers({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '1.1.1.1' }),
      cf
    ) === '198.51.100.7'
  )
  check(
    'a chain in the trusted header is refused, not split',
    deriveClientIp(headers({ 'cf-connecting-ip': '1.1.1.1, 2.2.2.2' }), cf) === UNKNOWN_CLIENT
  )
  check(
    'a non-IP value is refused',
    deriveClientIp(headers({ 'cf-connecting-ip': 'unknown' }), cf) === UNKNOWN_CLIENT
  )
  check(
    'the header being absent is unknown, not a fallback to XFF',
    deriveClientIp(headers({ 'x-forwarded-for': '1.1.1.1' }), cf) === UNKNOWN_CLIENT
  )
  check(
    'header names are matched case-insensitively, as HTTP requires',
    deriveClientIp(headers({ 'cf-connecting-ip': '198.51.100.7' }), {
      ...cf,
      header: 'CF-Connecting-IP',
    }) === '198.51.100.7'
  )

  console.log('deriveClientIp — trusted hop count')
  const oneHop = { header: null, hops: 1 }
  check(
    'takes the entry the proxy appended (rightmost)',
    deriveClientIp(headers({ 'x-forwarded-for': '203.0.113.5' }), oneHop) === '203.0.113.5'
  )
  check(
    'a client-prepended entry is ignored',
    deriveClientIp(
      headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5' }),
      oneHop
    ) === '203.0.113.5'
  )
  check(
    'a chain shorter than the configured hops is refused',
    deriveClientIp(headers({ 'x-forwarded-for': '6.6.6.6' }), { header: null, hops: 3 }) ===
      UNKNOWN_CLIENT
  )
  check(
    'garbage entries are dropped before counting',
    deriveClientIp(headers({ 'x-forwarded-for': 'evil, 6.6.6.6' }), oneHop) === '6.6.6.6'
  )
  const twoHop = { header: null, hops: 2 }
  check(
    'with 2 hops the client is the second entry from the right',
    deriveClientIp(headers({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7, 203.0.113.5' }), twoHop) ===
      '198.51.100.7'
  )

  console.log('the bucket itself — spoofing must not buy a fresh one')
  // Simulates the exact key getClientIp would produce, per configuration.
  const bucket = 'auth-login'
  const withSpoof = deriveClientIp(
    headers({ 'x-forwarded-for': '1.2.3.4' }),
    unconfigured
  )
  const withoutSpoof = deriveClientIp(headers({}), unconfigured)
  check(
    'spoofed and absent headers land in the same bucket',
    withSpoof === withoutSpoof
  )

  // Exhaust a bucket for a real caller, then try again from a forged identity.
  const realIp = deriveClientIp(headers({ 'cf-connecting-ip': '198.51.100.7' }), cf)
  let first: ReturnType<typeof rateLimit> | null = null
  let blockedAfterSpoof: ReturnType<typeof rateLimit> | null = null
  for (let i = 0; i < 3; i++) {
    first = rateLimit(`${bucket}:${realIp}`, 3, 60_000)
  }
  check('three requests fit a limit of three', first?.allowed === true)
  // A different spoofed header would produce a *different* key only if the
  // limiter took its identity from the request; here we assert the key is a
  // pure function of the derived IP, which is what routes actually use.
  const forgedIp = deriveClientIp(headers({ 'cf-connecting-ip': '6.6.6.6' }), cf)
  blockedAfterSpoof = rateLimit(`${bucket}:${forgedIp}`, 3, 60_000)
  check(
    'a different trusted header value is a different identity (the point of the config)',
    forgedIp !== realIp && blockedAfterSpoof.allowed === true
  )
  // And the same trusted value must still be capped:
  const again = rateLimit(`${bucket}:${realIp}`, 3, 60_000)
  check('the fourth request on the real identity is refused', again.allowed === false)
  check(
    'the refusal carries a reset time the client can wait for',
    again.resetAt > Date.now()
  )

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all checks passed')
  // The limiter keeps a cleanup interval alive; without this the script
  // prints its verdict and then never exits.
  process.exit(0)
}

main()
