/**
 * Production boot verification (item 9's "production" half).
 *
 * Run: node scripts/verify-prod-boot.mjs        (after `npx next build`)
 *
 * The dev server cannot answer any of these questions:
 *
 *   1. Does a bad AUTH_SECRET actually stop a production process? The boot
 *      guard in src/instrumentation.ts only ever throws when NODE_ENV is
 *      production, which is exactly what the e2e suite never is.
 *   2. Is the session cookie `Secure`? src/lib/auth.ts ties that flag to
 *      NODE_ENV === 'production', so over plain http on a dev server it is
 *      correctly absent — and therefore never asserted there either.
 *   3. Do served chunks carry source maps, and does an error response carry
 *      a stack trace? `next build` output is a different artifact entirely.
 *
 * Three boots against copies of a scratch database — prisma/dev.db is never
 * opened by this script:
 *
 *   A. NODE_ENV=production + placeholder secret  → must refuse and exit ≠ 0
 *   B. NODE_ENV=production + real secret         → headers, cookie flags,
 *                                                  source maps, 404 shape
 *   C. NODE_ENV=production + broken DATABASE_URL → a 500 must not leak
 *
 * Exits 0 when every check passes.
 */
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')
const SERVER_JS = path.join(STANDALONE, 'server.js')
const PORT_BAD = 3199
const PORT_GOOD = 3200
const PORT_BROKEN_DB = 3201

const PLACEHOLDER_SECRET = 'safrotravel-secret-key-change-in-production-abc123xyz'
const GOOD_SECRET = randomBytes(32).toString('base64')
const E2E_DB = path.join(ROOT, '.scratch', 'e2e.db')
const PROD_DB = path.join(ROOT, '.scratch', 'prod-check.db')
const BROKEN_DB = path.join(ROOT, '.scratch', 'definitely-missing', 'nope.db')

let failures = 0
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Boots the standalone server; resolves once the port answers or it dies. */
async function boot(env, port) {
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: STANDALONE,
    env: {
      // Deliberately explicit: only these plus the inherited PATH are the
      // server's world, so a stray shell variable cannot turn a check green.
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SystemRoot,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = []
  child.stdout.on('data', (b) => log.push(String(b)))
  child.stderr.on('data', (b) => log.push(String(b)))

  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)))
  let exitedCode = null
  exited.then((code) => { exitedCode = code })

  for (let i = 0; i < 60; i++) {
    if (exitedCode !== null) return { child, exited, log, ready: false }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.status < 500) return { child, exited, log, ready: true }
    } catch {
      /* not up yet */
    }
    await sleep(1000)
  }
  return { child, exited, log, ready: false }
}

async function kill(proc) {
  if (proc.exitCode === null && !proc.killed) {
    proc.kill()
    const t = setTimeout(() => proc.kill('SIGKILL'), 5000)
    await new Promise((resolve) => proc.on('exit', () => { clearTimeout(t); resolve() }))
  }
}

function directives(csp) {
  const out = {}
  for (const part of (csp ?? '').split(';')) {
    const [name, ...rest] = part.trim().split(/\s+/)
    if (name) out[name] = rest.join(' ')
  }
  return out
}

/** The app's script URLs, taken from the rendered document. */
async function scriptUrls(html) {
  const base = ''
  const urls = []
  const re = /<script[^>]+src="([^"]+)"/g
  let m
  while ((m = re.exec(html))) {
    if (m[1].startsWith('/')) urls.push(base + m[1])
  }
  return urls
}

async function ensureStandaloneAssets() {
  // `next build` traces files into standalone but does not copy them; the
  // deploy script does. Reproduced here so the checks below fetch real bytes.
  const staticSrc = path.join(ROOT, '.next', 'static')
  const staticDst = path.join(STANDALONE, '.next', 'static')
  const publicSrc = path.join(ROOT, 'public')
  const publicDst = path.join(STANDALONE, 'public')
  const copyDir = async (src, dst) => {
    if (!existsSync(src)) return
    await mkdir(dst, { recursive: true })
    for (const entry of await readdir(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name)
      const d = path.join(dst, entry.name)
      if (entry.isDirectory()) await copyDir(s, d)
      else await copyFile(s, d).catch(() => {})
    }
  }
  await copyDir(staticSrc, staticDst)
  await copyDir(publicSrc, publicDst)
}

/** No `.map` file may exist anywhere under the production static tree. */
async function findSourceMaps(dir, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await findSourceMaps(full, found)
    else if (entry.name.endsWith('.map')) found.push(full)
  }
  return found
}

async function main() {
  if (!existsSync(SERVER_JS)) {
    console.error('No standalone build at .next/standalone/server.js — run `npx next build` first.')
    process.exit(2)
  }
  if (!existsSync(E2E_DB)) {
    console.error('No scratch database at .scratch/e2e.db — run the e2e setup first.')
    process.exit(2)
  }

  await ensureStandaloneAssets()
  await copyFile(E2E_DB, PROD_DB)

  // ── A. a production boot with a public secret must refuse ────────────────
  console.log('A. bad AUTH_SECRET refuses to boot')
  {
    const proc = await boot(
      { AUTH_SECRET: PLACEHOLDER_SECRET, DATABASE_URL: `file:${PROD_DB}` },
      PORT_BAD
    )
    const code = await Promise.race([proc.exited, sleep(15000).then(() => 'timeout')])
    const output = proc.log.join('')
    check('the process exits on its own', code !== 'timeout', `code=${code}`)
    check('it exits non-zero', code !== 0 && code !== 'timeout', `code=${code}`)
    check(
      'the refusal message names the problem',
      output.includes('Refusing to start'),
      output.slice(0, 300)
    )
    check(
      'the refusal says which secret failed',
      output.includes('AUTH_SECRET') && output.includes('placeholder'),
      output.slice(0, 300)
    )
    await kill(proc.child)
  }

  // ── B. a production boot with a real secret serves correctly ─────────────
  console.log('B. good AUTH_SECRET boots and serves')
  const good = await boot(
    { AUTH_SECRET: GOOD_SECRET, DATABASE_URL: `file:${PROD_DB}` },
    PORT_GOOD
  )
  if (!good.ready) {
    check('the server becomes ready', false, good.log.join('').slice(0, 500))
    await kill(good.child)
    return finish()
  }
  check('the server becomes ready', true)
  const origin = `http://127.0.0.1:${PORT_GOOD}`

  const doc = await fetch(`${origin}/`)
  const headers = Object.fromEntries(doc.headers.entries())
  const csp = headers['content-security-policy']
  const dirs = directives(csp)

  check('the document is served', doc.status === 200, String(doc.status))
  check('CSP is present', !!csp)
  check("frame-ancestors is 'none'", dirs['frame-ancestors'] === "'none'", dirs['frame-ancestors'])
  check("script-src is nonce-based", /'nonce-[^']+'/.test(dirs['script-src'] ?? ''), dirs['script-src'])
  check("script-src has no unsafe-inline", !(dirs['script-src'] ?? '').includes("'unsafe-inline'"))
  check(
    'script-src has no unsafe-eval (production)',
    !(dirs['script-src'] ?? '').includes("'unsafe-eval'"),
    dirs['script-src']
  )
  check('nosniff', headers['x-content-type-options'] === 'nosniff')
  check('X-Frame-Options DENY', headers['x-frame-options'] === 'DENY')
  check('Referrer-Policy', headers['referrer-policy'] === 'strict-origin-when-cross-origin')
  check('Permissions-Policy lists camera', (headers['permissions-policy'] ?? '').includes('camera=()'))
  check('COOP same-origin', headers['cross-origin-opener-policy'] === 'same-origin')
  check('no X-Powered-By', !('x-powered-by' in headers))
  check(
    'no HSTS over plain http',
    !('strict-transport-security' in headers)
  )

  const tls = await fetch(`${origin}/`, { headers: { 'x-forwarded-proto': 'https' } })
  check(
    'HSTS over https',
    (tls.headers.get('strict-transport-security') ?? '').includes('max-age=63072000')
  )

  // The nonce in the header must be the nonce in the markup.
  const nonce = (dirs['script-src'] ?? '').match(/'nonce-([^']+)'/)?.[1]
  const html = await doc.text()
  check('the HTML carries that nonce', !!nonce && html.includes(`nonce="${nonce}"`))

  // A 404 must not be a stack trace.
  const missing = await fetch(`${origin}/api/definitely-not-a-route`)
  const missingBody = await missing.text()
  check('unknown API route is a 404', missing.status === 404, String(missing.status))
  check(
    'the 404 body has no stack trace',
    !/\bat \S+ \(/.test(missingBody) && !missingBody.includes(path.join(ROOT, 'src')),
    missingBody.slice(0, 200)
  )

  // Source maps: none on disk, none advertised by the chunks actually served.
  const maps = await findSourceMaps(path.join(ROOT, '.next', 'static'))
  check('no .map file in the production static tree', maps.length === 0, maps.slice(0, 3).join(', '))
  const urls = await scriptUrls(html)
  check('the document references script chunks', urls.length > 0)
  const advertised = []
  for (const url of urls.slice(0, 8)) {
    const js = await fetch(origin + url)
    if (js.status === 200 && (await js.text()).includes('sourceMappingURL')) advertised.push(url)
  }
  check('no served chunk advertises a source map', advertised.length === 0, advertised.join(', '))

  // Real credentials login → the cookie flags production is supposed to set.
  const jar = new Map()
  const getCookie = (res) => {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';')
      const idx = pair.indexOf('=')
      jar.set(pair.slice(0, idx), pair.slice(idx + 1))
    }
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
    headers: { cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
  })
  const { csrfToken } = await csrfRes.json()
  const cookieHeader = getCookie(csrfRes)
  const loginRes = await fetch(`${origin}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      'x-auth-return-redirect': '1',
      cookie: cookieHeader,
    },
    body: new URLSearchParams({
      csrfToken,
      email: 'user@example.com',
      password: 'user123',
      callbackUrl: '/',
      redirect: 'false',
    }),
  })
  const loginSetCookie = loginRes.headers.getSetCookie().join('\n')
  check('credentials login succeeds in production', loginRes.status < 400, `status=${loginRes.status}`)
  check(
    'the session cookie is issued',
    loginSetCookie.includes('session-token='),
    loginSetCookie.slice(0, 200)
  )
  check('the session cookie is Secure', /session-token=[^;]*;.*Secure/i.test(loginSetCookie) || /;\s*Secure/i.test(loginSetCookie), loginSetCookie.slice(0, 200))
  check('the session cookie is HttpOnly', /HttpOnly/i.test(loginSetCookie))
  check('the session cookie is SameSite=Lax', /SameSite=Lax/i.test(loginSetCookie))

  await kill(good.child)

  // ── C. a 500 must be a message, not a stack ──────────────────────────────
  console.log('C. a failing query answers with a generic 500')
  const broken = await boot(
    { AUTH_SECRET: GOOD_SECRET, DATABASE_URL: `file:${BROKEN_DB}` },
    PORT_BROKEN_DB
  )
  if (broken.ready) {
    const res = await fetch(`http://127.0.0.1:${PORT_BROKEN_DB}/api/public/stats`)
    const body = await res.text()
    check('the broken database yields a 500', res.status === 500, String(res.status))
    check('the body is the generic message', body.includes('Server error'), body.slice(0, 200))
    check(
      'the body carries no stack trace',
      !/\bat \S+ \(/.test(body) && !body.includes(path.join(ROOT, 'src')),
      body.slice(0, 300)
    )
  } else {
    check('the broken-database server boots (Prisma connects lazily)', false, broken.log.join('').slice(0, 300))
  }
  await kill(broken.child)

  finish()
}

function finish() {
  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all checks passed')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
