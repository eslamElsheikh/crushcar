/**
 * T7 & T8 - Home page feature strip and main navigation test suite.
 *
 * Requirements:
 * T7:
 * - Home page features strip replaces "سفر صديق للبيئة" with "خدمة عملاء 24/7"
 * - Subtitle is customer-service oriented
 * - Links to /faq
 *
 * T8:
 * - Header desktop & mobile navigation includes "اطلب باص"
 * - Target is /company/charter
 * - Unauthenticated request to /company/charter redirects to /login
 * - Company admin can reach /company/charter
 */
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { assertTestDatabase } from './lib/test-db-guard'

assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3070'
const SUFFIX = Date.now().toString(36)
let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function mintToken(user: { id: string; email: string; name: string; role: string; companyId: string | null }) {
  const secret = process.env.AUTH_SECRET || 'M1fX/C7/V+C/AVeI5lmi5FQoJulgZ4bE942NH691I='
  return encode({
    token: {
      id: user.id, sub: user.id, email: user.email, name: user.name,
      role: user.role, companyId: user.companyId, image: null,
      activeCheckedAt: Date.now(),
    },
    secret,
    salt: 'next-auth.session-token',
  })
}

async function main() {
  console.log(`T7 & T8 Home feature strip and navigation test suite (${BASE})`)

  // ───────────────────────────────────────────────────────────────────────────
  // T7: Home page feature strip
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. T7 - Home page 24/7 customer service feature strip')
  const homeRes = await fetch(`${BASE}/`)
  check('home page responds with 200', homeRes.status === 200)

  const html = await homeRes.text()
  check('home page contains "خدمة عملاء 24/7"', html.includes('خدمة عملاء 24/7'))
  check('home page links the support item to /faq', html.includes('href="/faq"'))
  check('old "سفر صديق للبيئة" is removed from the trust strip', !html.includes('سفر صديق للبيئة'))

  // ───────────────────────────────────────────────────────────────────────────
  // T8: Main navigation "اطلب باص" -> /company/charter
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2. T8 - Main navigation "اطلب باص" link')
  check('header contains link "اطلب باص"', html.includes('اطلب باص'))
  check('header links "اطلب باص" to /company/charter', html.includes('href="/company/charter"'))

  // Unauthenticated user should be redirected to /login
  const unauthCharter = await fetch(`${BASE}/company/charter`, { redirect: 'manual' })
  const unauthText = await unauthCharter.text()
  const redirectsToLogin =
    unauthCharter.status === 307 ||
    unauthCharter.status === 302 ||
    unauthCharter.headers.get('location') === '/login' ||
    unauthText.includes('NEXT_REDIRECT;replace;/login;307;')
  check(
    'unauthenticated visit to /company/charter triggers redirect to /login',
    redirectsToLogin,
    `status: ${unauthCharter.status}`
  )

  // Authenticated company admin visit to /company/charter
  const company = await prisma.company.create({
    data: {
      name: `Charter Co ${SUFFIX}`,
      subdomain: `charter-${SUFFIX}`,
      isActive: true,
      creditLimit: 1000,
      walletBalance: 0,
      billingCycle: 'MONTHLY',
      paymentMode: 'PREPAID',
    },
  })

  const companyUser = await prisma.user.create({
    data: { email: `charter-user-${SUFFIX}@safro.test`, name: 'Charter Manager', role: 'COMPANY_ADMIN', companyId: company.id, password: 'x', isActive: true },
  })
  const companyToken = await mintToken(companyUser)

  const authCharter = await fetch(`${BASE}/company/charter`, {
    headers: { Cookie: `next-auth.session-token=${companyToken}` },
  })
  check('company admin successfully reaches /company/charter (200)', authCharter.status === 200, `status: ${authCharter.status}`)

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
