/**
 * The single place the app decides who a request came from.
 *
 * `X-Forwarded-For` and friends are written by the *client* until something
 * trustworthy appends to them, so reading one unconditionally hands an attacker
 * a fresh identity per request — which is all a rate limit is, defeated. This
 * module therefore only ever reads a header that the operator has declared
 * trustworthy by configuration, and otherwise refuses to guess.
 *
 * Two configurations are understood, both opt-in:
 *
 *   TRUSTED_PROXY_HEADER=CF-Connecting-IP
 *       A header set by exactly one appliance in front of the app (Cloudflare,
 *       an nginx `proxy_set_header`, a load balancer). Its value is the client.
 *
 *   TRUSTED_PROXY_HOPS=1
 *       "The last N entries of X-Forwarded-For were appended by proxies I
 *       operate." The client is then the entry N positions from the right;
 *       anything a client prepended sits further left and is ignored.
 *
 * With neither set, no forwarded header is trusted at all and every request
 * shares one bucket — the limiter still works, it just cannot tell callers
 * apart. That is the correct failure: it is visible, and it degrades to "stricter
 * than intended" rather than "bypassable".
 */

/** The key used when no configuration identifies the caller. */
export const UNKNOWN_CLIENT = 'unknown'

/**
 * A dotted quad, each octet 0-255. Written out rather than trusting a loose
 * `\d{1,3}` match, because `999.1.1.1` is not an address and must not be
 * treated as one.
 */
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

/** Colon-separated groups. Deliberately loose: this is a sanity check, not a parser. */
const IPV6 = /^[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){1,7}$/i

/**
 * True when `value` is exactly one IP literal.
 *
 * Anything with a comma is a whole forwarded chain and is rejected here rather
 * than parsed: a chain is only meaningful alongside a hop count, and a caller
 * configured a single header precisely because it carries a single address.
 */
export function isIpLiteral(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes(',')) return false
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return IPV6.test(trimmed.slice(1, -1))
  }
  if (IPV4.test(trimmed)) return true
  // `1.2.3.4:5678` — some proxies append the source port.
  const withPort = /^(.*):\d{1,5}$/.exec(trimmed)
  if (withPort && withPort[1].includes('.')) return IPV4.test(withPort[1])
  return IPV6.test(trimmed)
}

export interface ProxyConfig {
  /** Header the operator declared trustworthy, or null. */
  header: string | null
  /** Trusted entries counted from the right of X-Forwarded-For, or 0. */
  hops: number
}

/**
 * Reads the configuration. Both values are validated on the way in: a header
 * name that is itself a newline or a hop count of `-3` would do more harm than
 * no configuration at all.
 */
export function readProxyConfig(
  env: Record<string, string | undefined> = process.env
): ProxyConfig {
  const rawHeader = env.TRUSTED_PROXY_HEADER?.trim() ?? ''
  // Header names are tokens (RFC 7230): no separators, no whitespace.
  const header = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(rawHeader)
    ? rawHeader
    : null

  const parsed = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? '', 10)
  const hops = Number.isFinite(parsed) && parsed > 0 && parsed <= 10 ? parsed : 0

  return { header, hops }
}

export type HeaderReader = (name: string) => string | null

/**
 * Derives the client address from a request's headers under `config`.
 *
 * Pure — it takes a header reader rather than a request — so the spoofing tests
 * can drive it directly without a server in the way.
 */
export function deriveClientIp(
  readHeader: HeaderReader,
  config: ProxyConfig
): string {
  if (config.header) {
    const value = readHeader(config.header)
    return isIpLiteral(value) ? (value as string).trim() : UNKNOWN_CLIENT
  }

  if (config.hops > 0) {
    const raw = readHeader('x-forwarded-for')
    if (!raw) return UNKNOWN_CLIENT

    const chain = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => isIpLiteral(part))

    // Fewer entries than trusted hops means the chain is shorter than the
    // configuration assumes: at least one proxy we counted on did not append,
    // so no position in it is known to be trustworthy. Refuse rather than
    // fall back to a client-chosen entry.
    if (chain.length < config.hops) return UNKNOWN_CLIENT

    return chain[chain.length - config.hops]
  }

  return UNKNOWN_CLIENT
}

let warned = false

/**
 * The client address for a request, honouring TRUSTED_PROXY_* only.
 *
 * Logs once per process when nothing is configured, because the silent case is
 * the one that turns into "everyone shares one bucket" in production.
 */
export function getClientIp(req: {
  headers: { get(name: string): string | null }
}): string {
  const config = readProxyConfig()

  if (!config.header && config.hops === 0 && !warned && process.env.NODE_ENV === 'production') {
    warned = true
    console.warn(
      '[rate-limit] TRUSTED_PROXY_HEADER and TRUSTED_PROXY_HOPS are both unset, ' +
        'so clients cannot be told apart and every caller shares one rate-limit bucket. ' +
        'Set one of them if the app sits behind a proxy.'
    )
  }

  return deriveClientIp((name) => req.headers.get(name), config)
}
