#!/usr/bin/env node
/**
 * Recomputes every dashboard KPI straight from SQL, independently of the app's
 * query layer, and prints the number the database actually implies. Run it
 * against production (read-only) to check the dashboard is telling the truth.
 *
 * Usage:
 *   node scripts/verify-dashboard-numbers.mjs
 *   DATABASE_URL="mysql://user:pass@host:3306/db" node scripts/verify-dashboard-numbers.mjs
 */
import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL || ''
const m = url.match(/^mysql:\/\/([^:]+):?(.*)@([^:/]+):?(\d*)\/([^?]+)/)

if (!m) {
  console.error('Set DATABASE_URL to a mysql:// DSN, e.g.')
  console.error('  DATABASE_URL="mysql://root:pw@127.0.0.1:3306/safro_verify"')
  process.exit(2)
}

const [, user, pass, host, port, database] = m

const conn = await mysql.createConnection({
  user,
  password: pass || '',
  host,
  port: port ? Number(port) : 3306,
  database,
  dateStrings: true,
})

const PAID = `('PAID','BOARDED')`
const rows = async (sql, params = []) => (await conn.query(sql, params))[0]

const report = []
function line(label, value, note = '') {
  report.push({ label, value, note })
}

const bk = await rows(
  `SELECT status, COUNT(*) n, COALESCE(SUM(total),0) v FROM Booking GROUP BY status`,
)
const cb = await rows(
  `SELECT status, COUNT(*) n, COALESCE(SUM(total),0) v FROM CompanyBooking GROUP BY status`,
)
const ch = await rows(
  `SELECT status, COUNT(*) n, COALESCE(SUM(price),0) v FROM CharterBooking GROUP BY status`,
)

const sumV = (set, statuses) =>
  set.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + Number(r.v), 0)
const sumN = (set, statuses) =>
  set.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + Number(r.n), 0)

line('Customer bookings total (all statuses)', sumN(bk, ['PENDING', 'PAID', 'BOARDED', 'CANCELLED']))
line('Company bookings total (all statuses)', sumN(cb, ['PENDING', 'PAID', 'BOARDED', 'CANCELLED']))
line('TOTAL bookings (customer + company)', sumN(bk, ['PENDING', 'PAID', 'BOARDED', 'CANCELLED']) + sumN(cb, ['PENDING', 'PAID', 'BOARDED', 'CANCELLED']))
line('Revenue — customer (PAID+BOARDED)', sumV(bk, ['PAID', 'BOARDED']))
line('Revenue — company (PAID+BOARDED)', sumV(cb, ['PAID', 'BOARDED']))
line('Revenue — charter (confirmed)', sumV(ch, ['confirmed']))
line(
  'Revenue — GRAND TOTAL',
  sumV(bk, ['PAID', 'BOARDED']) + sumV(cb, ['PAID', 'BOARDED']) + sumV(ch, ['confirmed']),
  'this is what /admin must show',
)

const one = async (sql) => (await rows(sql))[0]

const activeTrips = await one(`SELECT COUNT(*) n FROM Trip WHERE status='SCHEDULED' AND departure >= NOW()`)
const staleTrips = await one(`SELECT COUNT(*) n FROM Trip WHERE status='SCHEDULED' AND departure < NOW()`)
line('Active trips (scheduled, not yet departed)', Number(activeTrips.n))
line('STALE scheduled trips already departed', Number(staleTrips.n), 'leak into "active" if unfiltered')

const stuck = await one(`SELECT COUNT(*) n FROM Trip WHERE status='SCHEDULED' AND departure < NOW() AND arrival < NOW()`)
line('  of those, arrival already passed', Number(stuck.n), 'transition job never ran')

const totalTrips = await one(`SELECT COUNT(*) n FROM Trip`)
line('Total routes (all trips)', Number(totalTrips.n), 'what "Total Routes" must show')

const revenueRoutes = await one(`SELECT COUNT(DISTINCT tripId) n FROM Booking WHERE status IN ${PAID}`)
line('  routes with PAID revenue only', Number(revenueRoutes.n), 'the old wrong "Total Routes"')

const companiesTotal = await one(`SELECT COUNT(*) n FROM Company`)
const companiesActive = await one(`SELECT COUNT(*) n FROM Company WHERE isActive=1`)
line('Companies total', Number(companiesTotal.n))
line('Companies active', Number(companiesActive.n))

const credit = await one(`
  SELECT COALESCE(SUM(creditLimit),0) limitSum, COALESCE(SUM(outstandingBalance),0) outSum,
         COALESCE(SUM(walletBalance),0) walletSum
  FROM Company WHERE isActive=1`,
)
line('Credit granted (active companies)', Number(credit.limitSum))
line('Credit used (active companies)', Number(credit.outSum))
line('Wallet total (active companies)', Number(credit.walletSum))

const walletDrift = await rows(`
  SELECT c.name, c.walletBalance AS storedVal,
         COALESCE((SELECT SUM(w.amount) FROM WalletTransaction w WHERE w.companyId=c.id),0) AS ledger,
         (c.walletBalance - COALESCE((SELECT SUM(w.amount) FROM WalletTransaction w WHERE w.companyId=c.id),0)) AS drift
  FROM Company c
  HAVING ABS(drift) > 0.01
`)
const creditDrift = await rows(`
  SELECT c.name, c.outstandingBalance AS storedVal,
         COALESCE((SELECT SUM(cb.paidOnCredit) FROM CompanyBooking cb
                   WHERE cb.companyId=c.id AND cb.status IN ${PAID}),0) AS fromBookings,
         (c.outstandingBalance - COALESCE((SELECT SUM(cb.paidOnCredit) FROM CompanyBooking cb
                   WHERE cb.companyId=c.id AND cb.status IN ${PAID}),0)) AS drift
  FROM Company c
  HAVING ABS(drift) > 0.01
`)

console.log('\n=== DASHBOARD NUMBERS (recomputed from SQL) ===\n')
const w = Math.max(...report.map((r) => r.label.length))
for (const r of report) {
  console.log(`${r.label.padEnd(w)}  ${String(r.value).padStart(12)}${r.note ? `   ← ${r.note}` : ''}`)
}

console.log('\n=== BALANCE RECONCILIATION ===\n')
if (!walletDrift.length) console.log('wallet: every company matches its ledger ✓')
else {
  console.log(`wallet: ${walletDrift.length} company(ies) drifted`)
  for (const r of walletDrift) console.log(`  ${r.name}  stored=${r.storedVal}  ledger=${r.ledger}  drift=${r.drift}`)
}
if (!creditDrift.length) console.log('credit: outstanding matches paid-on-credit bookings ✓')
else {
  console.log(`credit: ${creditDrift.length} company(ies) drifted`)
  for (const r of creditDrift) console.log(`  ${r.name}  stored=${r.storedVal}  fromBookings=${r.fromBookings}  drift=${r.drift}`)
}

const EXPECTED_BOOKING_COLS = ['paymentStatus', 'paymentProofUrl', 'paymentNotes', 'paymentMethod', 'paymentRejectReason', 'groupId']
const presentCols = await rows(`
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='Booking'
    AND COLUMN_NAME IN (${EXPECTED_BOOKING_COLS.map((c) => `'${c}'`).join(',')})
`)
const presentSet = new Set(presentCols.map((r) => r.COLUMN_NAME))
const missingCols = EXPECTED_BOOKING_COLS.filter((c) => !presentSet.has(c))
if (missingCols.length) {
  console.log(`\n!! Booking table is missing ${missingCols.length} column(s) the code writes to:`)
  for (const c of missingCols) console.log(`   ${c}`)
  console.log('   → apply prisma/migrations or db push BEFORE deploying this code')
}

const destTable = await one(
  `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Destination'`,
)
if (!Number(destTable.n)) {
  console.log('\n!! Destination table is missing — /api/destinations will 500.')
}

await conn.end()
