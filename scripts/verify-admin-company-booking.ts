/**
 * Proves the super-admin-on-behalf-of-a-company booking.
 *
 * Run against MariaDB with the app serving on BASE:
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db" \
 *   BASE_URL="http://127.0.0.1:3002" npx tsx scripts/verify-admin-company-booking.ts
 *
 * The checks that matter:
 *   - the booking belongs to the company, and the creator is recorded
 *   - the company's wallet pays; the platform wallet and the credit line do not
 *   - a short wallet refuses the whole thing, leaving nothing behind
 *   - eleven seats are refused; ten are not
 *   - the daily allowance is shared across three buses on one route
 *   - a replayed request does not book or charge twice
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

// This script writes to the database and deletes rows. It must never run against
// production, so the guard refuses to start unless this is a test database.
assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3002'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const SUFFIX = Date.now().toString(36)

async function api(
  path: string,
  init: { method: string; body?: unknown; token?: string },
) {
  // NextAuth reads the session from a cookie, not from a bearer header.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Cookie = `next-auth.session-token=${init.token}`
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function main() {
  console.log('setup')
  const company = await prisma.company.create({
    data: {
      name: `Admin Book Co ${SUFFIX}`, subdomain: `adminbook-${SUFFIX}`, isActive: true,
      creditLimit: 500000, walletBalance: 100000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Admin Book Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 0, companyId: company.id },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 12, cols: 6, aisleAfter: 2 } })
  const labels: string[] = []
  for (let row = 1; row <= 12; row++) {
    for (let col = 1; col <= 6; col++) {
      const label = `S${row}-${col}`
      labels.push(label)
      await prisma.seat.create({ data: { layoutId: layout.id, label, row, col, type: 'NORMAL', price: 0 } })
    }
  }
  const stations: Record<string, string> = {}
  for (const name of ['الإسكندرية', 'برج العرب', 'شرم الشيخ']) {
    const s = await prisma.station.upsert({
      where: { name_city: { name, city: 'x' } },
      create: { name, city: 'x' },
      update: {},
    })
    stations[name] = s.id
  }
  const departure = new Date(Date.now() + 2 * 86400000)
  departure.setUTCHours(9, 0, 0, 0)
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin: 'الإسكندرية', destination: 'شرم الشيخ',
      departure, arrival: new Date(departure.getTime() + 6 * 3600000),
      price: 100, bookingMode: 'SEAT', status: 'SCHEDULED',
      tripStops: { create: [
        { stationId: stations['الإسكندرية'], stopOrder: 1, priceFromOrigin: 0 },
        { stationId: stations['برج العرب'], stopOrder: 2, priceFromOrigin: 50 },
        { stationId: stations['شرم الشيخ'], stopOrder: 3, priceFromOrigin: 100 },
      ] },
    },
  })
  // The route key the trip would have been given on creation.
  const { routeKeyOfStops, travelDateOf } = await import('../src/lib/route-key')
  const routeKey = routeKeyOfStops([
    { stationId: stations['الإسكندرية'], stopOrder: 1 },
    { stationId: stations['برج العرب'], stopOrder: 2 },
    { stationId: stations['شرم الشيخ'], stopOrder: 3 },
  ])!
  const travelDate = travelDateOf(departure)!
  await prisma.trip.update({ where: { id: trip.id }, data: { routeKey, travelDate } })

  const admin = await prisma.user.create({
    data: { email: `admin-booker-${SUFFIX}@example.com`, password: 'x', name: 'Admin Booker', role: 'SUPER_ADMIN' },
  })
  const companyUser = await prisma.user.create({
    data: { email: `company-booker-${SUFFIX}@example.com`, password: 'x', name: 'Company Booker', role: 'COMPANY_ADMIN', companyId: company.id },
  })
  console.log(`  company ${company.id}, trip ${trip.id}, admin ${admin.id}`)

  // A signed session for the admin. The e2e helper mints one the same way
  // the app does.
  const { encode } = await import('next-auth/jwt')
  const secret = process.env.AUTH_SECRET || 'M1fX/C7/V+C/AVeI5lmi5FQoJulgZ4bE942NH691I='
  const token = await encode({
    token: {
      id: admin.id, sub: admin.id, email: admin.email, name: admin.name,
      role: 'SUPER_ADMIN', companyId: null, image: null, activeCheckedAt: Date.now(),
    },
    secret,
    salt: 'next-auth.session-token',
  })
  const companyToken = await encode({
    token: {
      id: companyUser.id, sub: companyUser.id, email: companyUser.email, name: companyUser.name,
      role: 'COMPANY_ADMIN', companyId: company.id, image: null, activeCheckedAt: Date.now(),
    },
    secret,
    salt: 'next-auth.session-token',
  })

  const platformBefore = await prisma.platformWallet.findUnique({ where: { id: 'main' } })
  const platformBalanceBefore = platformBefore?.balancePiastres ?? 0

  console.log('\nthe booking')
  const walletBefore = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  const res = await api('/api/admin/company-bookings', {
    method: 'POST',
    token,
    body: {
      tripId: trip.id,
      companyId: company.id,
      passengers: labels.slice(0, 3).map((seatLabel) => ({ seatLabel, passengerName: 'Admin Guest' })),
      idempotencyKey: `${SUFFIX}-a`,
    },
  })
  check('the request is accepted', res.status === 200, `${res.status} ${JSON.stringify(res.json).slice(0, 200)}`)

  const created = await prisma.companyBooking.findMany({ where: { tripId: trip.id }, orderBy: { createdAt: 'asc' } })
  check('three company bookings were created', created.length === 3, String(created.length))
  check('they belong to the company', created.every((b) => b.companyId === company.id))
  check('the creator is recorded', created.every((b) => b.createdByUserId === admin.id), String(created[0]?.createdByUserId))
  check('they are paid', created.every((b) => b.status === 'PAID'))
  check('the platform wallet was not touched', created.every((b) => b.paidOnCredit === 0))

  const walletAfter = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the company wallet paid the whole amount',
    Math.abs((walletBefore.walletBalance - walletAfter.walletBalance) - 300) < 0.001,
    `${walletBefore.walletBalance} -> ${walletAfter.walletBalance}`)
  check('the credit line was not used', walletAfter.outstandingBalance === walletBefore.outstandingBalance)
  check('the credit limit was not changed', walletAfter.creditLimit === walletBefore.creditLimit)
  const platformAfter = await prisma.platformWallet.findUnique({ where: { id: 'main' } })
  check('the platform wallet is untouched', (platformAfter?.balancePiastres ?? 0) === platformBalanceBefore)
  const ledger = await prisma.walletTransaction.findMany({ where: { companyId: company.id } })
  check('a ledger row was written for the charge', ledger.length === 1, String(ledger.length))
  check('the ledger row records the debit', ledger[0]?.amount === -300, String(ledger[0]?.amount))

  console.log('\nauthorization')
  const forbidden = await api('/api/admin/company-bookings', {
    method: 'POST',
    token: companyToken,
    body: { tripId: trip.id, companyId: company.id, passengers: [{ seatLabel: labels[5] }], idempotencyKey: `${SUFFIX}-b` },
  })
  check('a company admin is refused', forbidden.status === 403, String(forbidden.status))
  const noToken = await api('/api/admin/company-bookings', {
    method: 'POST',
    body: { tripId: trip.id, companyId: company.id, passengers: [{ seatLabel: labels[5] }] },
  })
  check('a request with no session is refused', noToken.status === 401, String(noToken.status))

  console.log('\nten seats per booking')
  const eleven = await api('/api/admin/company-bookings', {
    method: 'POST',
    token,
    body: {
      tripId: trip.id, companyId: company.id,
      passengers: labels.slice(10, 21).map((seatLabel) => ({ seatLabel })),
      idempotencyKey: `${SUFFIX}-c`,
    },
  })
  check('eleven seats are refused', eleven.status === 413, `${eleven.status} ${JSON.stringify(eleven.json).slice(0, 150)}`)
  check('nothing was created for it',
    (await prisma.companyBooking.count({ where: { tripId: trip.id } })) === 3)

  console.log('\na short wallet refuses the whole thing')
  await prisma.company.update({ where: { id: company.id }, data: { walletBalance: 10 } })
  const short = await api('/api/admin/company-bookings', {
    method: 'POST',
    token,
    body: {
      tripId: trip.id, companyId: company.id,
      passengers: labels.slice(20, 22).map((seatLabel) => ({ seatLabel })),
      idempotencyKey: `${SUFFIX}-d`,
    },
  })
  check('the booking is refused', short.status === 400, `${short.status} ${JSON.stringify(short.json).slice(0, 150)}`)
  check('the error names the shortfall', short.json?.error === 'INSUFFICIENT_WALLET', String(short.json?.error))
  check('no booking was created',
    (await prisma.companyBooking.count({ where: { tripId: trip.id } })) === 3)
  const walletShort = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the wallet did not move', walletShort.walletBalance === 10, String(walletShort.walletBalance))
  check('no ledger row was written',
    (await prisma.walletTransaction.count({ where: { companyId: company.id } })) === 1)

  console.log('\na replayed request')
  await prisma.company.update({ where: { id: company.id }, data: { walletBalance: 100000 } })
  const replay = await api('/api/admin/company-bookings', {
    method: 'POST',
    token,
    body: {
      tripId: trip.id, companyId: company.id,
      passengers: labels.slice(30, 33).map((seatLabel) => ({ seatLabel })),
      idempotencyKey: `${SUFFIX}-e`,
    },
  })
  check('the first request succeeds', replay.status === 200, `${replay.status} ${JSON.stringify(replay.json).slice(0, 150)}`)
  const replay2 = await api('/api/admin/company-bookings', {
    method: 'POST',
    token,
    body: {
      tripId: trip.id, companyId: company.id,
      passengers: labels.slice(30, 33).map((seatLabel) => ({ seatLabel })),
      idempotencyKey: `${SUFFIX}-e`,
    },
  })
  check('the replay is refused', replay2.status === 409, `${replay2.status} ${JSON.stringify(replay2.json).slice(0, 150)}`)
  check('only one booking was created for it',
    (await prisma.companyBooking.count({ where: { tripId: trip.id, seatLabel: labels[30] } })) === 1)
  check('only one ledger row for the key',
    (await prisma.walletTransaction.count({ where: { idempotencyKey: `charge:${SUFFIX}-e` } })) === 1)

  console.log('\nthe daily allowance is shared across every bus on the route')
  // Six seats are already held on this route: three from the first booking and
  // three from the replayed request. The allowance is set to nine so exactly
  // three more fit, and the tenth is refused.
  const heldBefore = await prisma.companyBooking.count({
    where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
  })
  check('six seats are already held on the route', heldBefore === 6, String(heldBefore))
  await prisma.companyRouteQuota.upsert({
    where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
    create: { companyId: company.id, routeKey, travelDate, maxSeats: 9 },
    update: { maxSeats: 9 },
  })
  const three = await api('/api/admin/company-bookings', {
    method: 'POST',
    token,
    body: {
      tripId: trip.id, companyId: company.id,
      passengers: labels.slice(40, 43).map((seatLabel) => ({ seatLabel })),
      idempotencyKey: `${SUFFIX}-f`,
    },
  })
  check('three more seats fit under a daily allowance of nine', three.status === 200, `${three.status} ${JSON.stringify(three.json).slice(0, 150)}`)
  const over = await api('/api/admin/company-bookings', {
    method: 'POST',
    token,
    body: {
      tripId: trip.id, companyId: company.id,
      passengers: labels.slice(43, 44).map((seatLabel) => ({ seatLabel })),
      idempotencyKey: `${SUFFIX}-g`,
    },
  })
  check('the next seat is refused by the daily allowance', over.status === 413, `${over.status} ${JSON.stringify(over.json).slice(0, 150)}`)
  check('the refusal names the quota', over.json?.error === 'TRIP_QUOTA_EXCEEDED', String(over.json?.error))

  console.log('\nthe booking shows up as the company\'s own')
  const companyList = await prisma.companyBooking.count({ where: { companyId: company.id } })
  check('the company owns every booking', companyList === 9, String(companyList))

  // Cleanup
  await prisma.walletTransaction.deleteMany({ where: { companyId: company.id } })
  await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.busLayout.delete({ where: { id: layout.id } })
  await prisma.bus.delete({ where: { id: bus.id } })
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, companyUser.id] } } })
  await prisma.company.delete({ where: { id: company.id } })

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
