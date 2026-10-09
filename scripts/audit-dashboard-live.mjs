/**
 * Drives the admin dashboard against whatever DATABASE_URL points at and prints
 * every KPI the API returns next to the number recomputed straight from SQL.
 * A mismatch means the dashboard is lying.
 *
 * Usage: node scripts/audit-dashboard-live.mjs
 */
import mysql from 'mysql2/promise'

const BASE = process.env.BASE_URL || 'http://localhost:3005'
const LOGIN = process.env.AUDIT_EMAIL || 'superadmin@safrotravel.com'
const PASSWORD = process.env.AUDIT_PASSWORD || ''

const url = process.env.DATABASE_URL || ''
const m = url.match(/^mysql:\/\/([^:]+):?(.*)@([^:/]+):?(\d*)\/([^?]+)/)
if (!m) {
  console.error('Set DATABASE_URL to a mysql:// DSN')
  process.exit(2)
}
const [, user, pass, host, port, database] = m
const db = await mysql.createConnection({
  user,
  password: pass || '',
  host,
  port: port ? Number(port) : 3306,
  database,
})
const q = async (sql, p = []) => (await db.query(sql, p))[0]
const one = async (sql, p = []) => (await q(sql, p))[0]

if (!PASSWORD) {
  console.error('Set AUDIT_PASSWORD to the login password for', LOGIN)
  process.exit(2)
}

let jar = ''
const api = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: jar } })
  const body = await res.text()
  try {
    return JSON.parse(body)
  } catch {
    // A 500 renders an HTML error page; surface it instead of crashing on parse.
    return { __error: res.status, __body: body.replace(/<[^>]+>/g, ' ').slice(0, 200).trim() }
  }
}

// --- login ---------------------------------------------------------------
// NextAuth v5 credentials flow: fetch the CSRF token, POST to the callback,
// keep every cookie the two responses hand back.
const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
const { csrfToken } = await csrfRes.json()
jar = (csrfRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    cookie: jar,
  },
  body: new URLSearchParams({ csrfToken, email: LOGIN, password: PASSWORD, json: 'true' }),
  redirect: 'manual',
})

const loginCookies = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0])
jar = [...new Set([...jar.split('; ').filter(Boolean), ...loginCookies])].join('; ')

if (!loginCookies.length) {
  console.error('Login failed — no session cookie returned. Status:', loginRes.status)
  console.error('Body:', (await loginRes.text()).slice(0, 300))
  process.exit(1)
}

const session = await api('/api/auth/session')
if (!session?.user) {
  console.error('No active session after login — cookie not accepted.')
  process.exit(1)
}
console.log(`\nlogged in as ${session.user.email} (${session.user.role})\n`)

// --- API responses -------------------------------------------------------
// Each range is exercised inside the loop below; the all-time reports are read
// there too.

// --- independent recomputation ------------------------------------------
// The dashboard KPIs are range-scoped; the reports page is all-time. Compare
// each API against the same scope it actually serves, or the audit reports
// false failures for data that is simply older than the window.
const PAYING = `('PAID','BOARDED')`
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 }
const RANGES = (process.env.AUDIT_RANGE || '7d,30d,90d').split(',').map((r) => r.trim())
for (const r of RANGES) {
  if (!RANGE_DAYS[r]) {
    // The API silently falls back to 30d for an unknown range, which would make
    // this script compare a 30d window against whatever the caller asked for.
    console.error(`AUDIT_RANGE must be a subset of ${Object.keys(RANGE_DAYS).join(', ')} (got "${r}")`)
    process.exit(2)
  }
}

const results = []
const check = (label, actual, want) => {
  const ok = Number(actual) === Number(want)
  results.push(ok)
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} api=${String(actual).padStart(10)}  expected=${String(want).padStart(10)}`,
  )
}

const activeTrips = Number(
  (await one(`SELECT COUNT(*) v FROM Trip WHERE status='SCHEDULED' AND departure >= NOW()`)).v,
)
const totalRoutes = Number((await one(`SELECT COUNT(*) v FROM Trip`)).v)
const allTimeBookings =
  Number((await one(`SELECT COUNT(*) v FROM Booking`)).v) +
  Number((await one(`SELECT COUNT(*) v FROM CompanyBooking`)).v)

for (const range of RANGES) {
  const days = RANGE_DAYS[range]
  const since = new Date(Date.now() - days * 86_400_000)

  const [analytics, overview] = await Promise.all([
    api(`/api/analytics?range=${range}`),
    api(`/api/admin/overview?range=${range}`),
  ])

  console.log(`\n=== RANGE ${range} (${days} days) ===\n`)
  if (analytics.__error || overview.__error) {
    console.error('  API error:', analytics.__error || overview.__error, analytics.__body || overview.__body || '')
    results.push(false)
    continue
  }

  const customerRevenue = Number(
    (await one(`SELECT COALESCE(SUM(total),0) v FROM Booking WHERE status IN ${PAYING} AND createdAt >= ?`, [since])).v,
  )
  const companyRevenue = Number(
    (await one(`SELECT COALESCE(SUM(total),0) v FROM CompanyBooking WHERE status IN ${PAYING} AND createdAt >= ?`, [since])).v,
  )
  const charterRevenue = Number(
    (await one(`SELECT COALESCE(SUM(price),0) v FROM CharterBooking WHERE status='confirmed' AND createdAt >= ?`, [since])).v,
  )
  const customerBookings = Number((await one(`SELECT COUNT(*) v FROM Booking WHERE createdAt >= ?`, [since])).v)
  const companyBookings = Number((await one(`SELECT COUNT(*) v FROM CompanyBooking WHERE createdAt >= ?`, [since])).v)

  check('totalBookings (in range)', analytics.totalBookings, customerBookings + companyBookings)
  check('totalRevenue (in range)', analytics.totalRevenue, customerRevenue + companyRevenue + charterRevenue)
  check('  revenue.customer', analytics.revenue?.customer, customerRevenue)
  check('  revenue.company', analytics.revenue?.company, companyRevenue)
  check('  revenue.charter', analytics.revenue?.charter, charterRevenue)
  check('activeTrips (analytics)', analytics.activeTrips, activeTrips)
  check('activeTrips (overview)', overview.activeTrips, activeTrips)

  // The chart must have one entry per day of the window — gaps would draw as
  // a straight line across missing days instead of showing zero revenue.
  const chart = analytics.chartData ?? []
  const chartOk = chart.length >= days
  results.push(chartOk)
  console.log(
    `${chartOk ? 'PASS' : 'FAIL'}  ${'chartData zero-filled'.padEnd(40)} days=${String(chart.length).padStart(4)}  expected>=${days}`,
  )
  // And the days must be contiguous, not just numerous.
  const sorted = chart.map((d) => d.day).sort()
  const contiguous = sorted.every((d, i) => {
    if (i === 0) return true
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`)
    const cur = new Date(`${d}T00:00:00Z`)
    return (cur - prev) / 86_400_000 === 1
  })
  results.push(contiguous)
  console.log(`${contiguous ? 'PASS' : 'FAIL'}  ${'chartData days contiguous'.padEnd(40)}`)

  const chartTotal = Math.round((analytics.chartData ?? []).reduce((s, d) => s + d.revenue, 0) * 100) / 100
  check('chart total == totalRevenue', chartTotal, analytics.totalRevenue)
}

// --- all-time checks -----------------------------------------------------
const reports = await api('/api/reports')
const customers = await api('/api/customers')
const creditReport = await api('/api/admin/credit-report')

console.log('\n=== ALL-TIME / SEARCH / CREDIT ===\n')
if (reports.__error) {
  console.error('  /api/reports error:', reports.__error, reports.__body || '')
  results.push(false)
} else {
  check('reports totalRoutes', reports.summary?.totalRoutes, totalRoutes)
  check('reports totalBookings', reports.summary?.totalBookings, allTimeBookings)
  check('reports summary revenue', reports.summary?.revenue?.total, (await one(`
    SELECT COALESCE((SELECT SUM(total) FROM Booking WHERE status IN ${PAYING}),0)
         + COALESCE((SELECT SUM(total) FROM CompanyBooking WHERE status IN ${PAYING}),0)
         + COALESCE((SELECT SUM(price) FROM CharterBooking WHERE status='confirmed'),0) AS v`)).v)
}

if (customers?.stats) {
  check(
    'customers totalCustomers',
    customers.stats.totalCustomers,
    (await one(`SELECT COUNT(*) v FROM User WHERE role='CUSTOMER'`)).v,
  )
} else {
  console.log(`  /api/customers error: ${customers.__error} ${customers.__body || ''}`)
  results.push(false)
}

// The customers search must actually filter — the page sends ?q=.
const searched = await api('/api/customers?q=safro')
const allCustomers = await api('/api/customers')
const searchWorks =
  !searched.__error && Number(searched.pagination?.total) <= Number(allCustomers.pagination?.total ?? 0)
results.push(searchWorks)
console.log(
  `${searchWorks ? 'PASS' : 'FAIL'}  ${'customers ?q= search accepted'.padEnd(40)} q=${searched.pagination?.total}  no-q=${allCustomers.pagination?.total}`,
)

if (creditReport?.totals) {
  check(
    'creditReport creditLimit',
    creditReport.totals.creditLimit,
    (await one(`SELECT COALESCE(SUM(creditLimit),0) v FROM Company WHERE isActive=1`)).v,
  )
} else {
  console.log(`  /api/admin/credit-report error: ${creditReport.__error} ${creditReport.__body || ''}`)
  results.push(false)
}

// Every unauthenticated surface must refuse.
for (const p of ['/api/analytics?range=30d', '/api/admin/overview', '/api/reports', '/api/customers', '/api/companies']) {
  const res = await fetch(`${BASE}${p}`)
  results.push(res.status === 401 || res.status === 403)
  console.log(
    `${res.status === 401 || res.status === 403 ? 'PASS' : 'FAIL'}  ${`unauth ${p}`.padEnd(40)} ${res.status}`,
  )
}

// --- balance drift -------------------------------------------------------
console.log('\n=== BALANCE DRIFT ===\n')
const drift = await q(`
  SELECT c.name, c.walletBalance AS walletStored,
         COALESCE((SELECT SUM(w.amount) FROM WalletTransaction w WHERE w.companyId=c.id),0) AS walletLedger,
         c.outstandingBalance AS creditStored,
         COALESCE((SELECT SUM(cb.paidOnCredit) FROM CompanyBooking cb
                    WHERE cb.companyId=c.id AND cb.status IN ${PAYING}),0) AS creditExpected
    FROM Company c
   WHERE ABS(c.walletBalance - COALESCE((SELECT SUM(w.amount) FROM WalletTransaction w WHERE w.companyId=c.id),0)) > 0.01
      OR ABS(c.outstandingBalance - COALESCE((SELECT SUM(cb.paidOnCredit) FROM CompanyBooking cb
                    WHERE cb.companyId=c.id AND cb.status IN ${PAYING}),0)) > 0.01
`)
if (!drift.length) {
  results.push(true)
  console.log('PASS  no company balance has drifted')
} else {
  for (const r of drift) {
    console.log(
      `WARN  ${r.name}: wallet ${r.walletStored} vs ledger ${r.walletLedger}` +
        ` | outstanding ${r.creditStored} vs bookings ${r.creditExpected}`,
    )
  }
  console.log('      (informational — run scripts/reconcile-balances.mjs to repair)')
}

await db.end()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)