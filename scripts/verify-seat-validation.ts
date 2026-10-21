/**
 * Server-side seat validation.
 *
 * The trip page will not let anybody pick a seat that is taken, and it hides
 * the seats an administrator has blocked. Neither of those is a rule: they
 * are conveniences, and a request written by hand does not have to use the
 * page. These checks are about the server refusing what the page would not
 * offer.
 *
 *   - a seat that is not in the bus layout is refused
 *   - a seat an administrator has blocked is refused
 *   - a seat somebody is already holding is refused
 *   - two requests for the same seat at the same moment: one wins
 *
 * The first and the last are the ones that matter most. A phantom seat is a
 * booking of nothing, and a race for one seat is a seat sold twice.
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-seat-validation.ts
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'
import { routeKeyOfStops, travelDateOf } from '../src/lib/route-key'

// This script writes to the database and deletes rows. It must never run
// against production, so the guard refuses to start unless this is a test database.
assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3005'

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

async function post(path: string, body: unknown, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `next-auth.session-token=${token}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function main() {
  const { authSecret } = await import('./lib/auth-secret')
  const secret = authSecret()

  const admin = await prisma.user.create({
    data: {
      email: `seats-${SUFFIX}@example.com`,
      name: 'Seat Admin',
      role: 'SUPER_ADMIN',
      password: 'x',
    },
  })
  const company = await prisma.company.create({
    data: {
      name: `Seats Co ${SUFFIX}`, subdomain: `seats-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 100000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const companyUser = await prisma.user.create({
    data: {
      email: `seats-co-${SUFFIX}@example.com`,
      name: 'Seats Company Admin',
      role: 'COMPANY_ADMIN',
      companyId: company.id,
      password: 'x',
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Seats Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 4, companyId: company.id },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 2, cols: 2, aisleAfter: 0 } })
  const labels: string[] = []
  for (const [i, label] of ['S1-1', 'S1-2', 'S2-1', 'S2-2'].entries()) {
    labels.push(label)
    await prisma.seat.create({ data: { layoutId: layout.id, label, row: 1, col: (i % 2) + 1, type: 'NORMAL', price: 100 } })
  }

  // The trip needs stops, or it has no route identity and the daily allowance
  // cannot be applied to it — which is itself a refusal.
  const st: Record<string, string> = {}
  for (const name of ['Seats A', 'Seats B']) {
    const s = await prisma.station.upsert({
      where: { name_city: { name: `${name} ${SUFFIX}`, city: 'seats' } },
      create: { name: `${name} ${SUFFIX}`, city: 'seats' },
      update: {},
    })
    st[name] = s.id
  }
  const route = [st['Seats A'], st['Seats B']]

  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin: 'A', destination: 'B',
      departure: new Date(Date.now() + 86400000), arrival: new Date(Date.now() + 90000000),
      price: 100, status: 'SCHEDULED', bookingMode: 'SEAT',
      routeKey: routeKeyOfStops(route.map((stationId, i) => ({ stationId, stopOrder: i + 1 }))),
      travelDate: travelDateOf(new Date(Date.now() + 86400000)),
      tripStops: {
        create: route.map((stationId, i) => ({ stationId, stopOrder: i + 1, priceFromOrigin: i * 50 })),
      },
    },
  })

  const { encode } = await import('next-auth/jwt')
  const adminToken = await encode({
    token: {
      id: admin.id, sub: admin.id, email: admin.email, name: admin.name,
      role: 'SUPER_ADMIN', companyId: null, image: null, activeCheckedAt: Date.now(),
    },
    secret, salt: 'next-auth.session-token',
  })
  const companyToken = await encode({
    token: {
      id: companyUser.id, sub: companyUser.id, email: companyUser.email, name: companyUser.name,
      role: 'COMPANY_ADMIN', companyId: company.id, image: null, activeCheckedAt: Date.now(),
    },
    secret, salt: 'next-auth.session-token',
  })

  console.log('a seat that is not in the bus layout')
  const ghostAdmin = await post('/api/admin/company-bookings', {
    tripId: trip.id,
    companyId: company.id,
    passengers: [{ seatLabel: 'NOT-A-SEAT' }],
    idempotencyKey: `ghost-admin-${SUFFIX}`,
  }, adminToken)
  check('the super admin booking is refused', ghostAdmin.status === 400, `status=${ghostAdmin.status}`)
  check('and it says the seat does not exist', ghostAdmin.json?.error === 'UNKNOWN_SEAT',
    JSON.stringify(ghostAdmin.json).slice(0, 120))

  const ghostCompany = await post('/api/company/bookings', {
    tripId: trip.id,
    passengers: [{ seatLabel: 'NOT-A-SEAT' }],
  }, companyToken)
  check('the company booking is refused', ghostCompany.status === 400, `status=${ghostCompany.status}`)
  check('and it says the seat does not exist', ghostCompany.json?.error === 'UNKNOWN_SEAT',
    JSON.stringify(ghostCompany.json).slice(0, 120))

  check('nothing was booked',
    (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 0)

  console.log('a seat an administrator has blocked')
  await prisma.seatBlock.create({
    data: { tripId: trip.id, seatLabel: labels[1] },
  })
  const blockedAdmin = await post('/api/admin/company-bookings', {
    tripId: trip.id,
    companyId: company.id,
    passengers: [{ seatLabel: labels[1] }],
    idempotencyKey: `blocked-admin-${SUFFIX}`,
  }, adminToken)
  check('the super admin booking of a blocked seat is refused', blockedAdmin.status === 409,
    `status=${blockedAdmin.status}`)
  check('and it says the seat is blocked', blockedAdmin.json?.error === 'SEAT_BLOCKED',
    JSON.stringify(blockedAdmin.json).slice(0, 120))

  const blockedCompany = await post('/api/company/bookings', {
    tripId: trip.id,
    passengers: [{ seatLabel: labels[1] }],
  }, companyToken)
  check('the company booking of a blocked seat is refused', blockedCompany.status === 409,
    `status=${blockedCompany.status}`)
  check('and it says the seat is blocked', blockedCompany.json?.error === 'SEAT_BLOCKED',
    JSON.stringify(blockedCompany.json).slice(0, 120))

  check('still nothing was booked',
    (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 0)

  console.log('a seat somebody is already holding')
  const first = await post('/api/admin/company-bookings', {
    tripId: trip.id,
    companyId: company.id,
    passengers: [{ seatLabel: labels[0] }],
    idempotencyKey: `first-${SUFFIX}`,
  }, adminToken)
  check('the first booking of a free seat succeeds', first.status === 200, `status=${first.status}`)

  const second = await post('/api/admin/company-bookings', {
    tripId: trip.id,
    companyId: company.id,
    passengers: [{ seatLabel: labels[0] }],
    idempotencyKey: `second-${SUFFIX}`,
  }, adminToken)
  check('the second booking of the same seat is refused', second.status === 409,
    `status=${second.status}`)
  check('and it says the seat is taken', second.json?.error === 'SEAT_TAKEN',
    JSON.stringify(second.json).slice(0, 120))
  check('the seat is held once',
    (await prisma.companyBooking.count({ where: { companyId: company.id, seatLabel: labels[0] } })) === 1)

  console.log('two requests for the same free seat at the same moment')
  const freeSeat = labels[2]
  const racers = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      post('/api/admin/company-bookings', {
        tripId: trip.id,
        companyId: company.id,
        passengers: [{ seatLabel: freeSeat }],
        idempotencyKey: `race-${SUFFIX}-${i}`,
      }, adminToken)
    )
  )
  const won = racers.filter((r) => r.status === 200)
  const lost = racers.filter((r) => r.status !== 200)
  check('exactly one of them wins', won.length === 1, `won=${won.length} statuses=${racers.map((r) => r.status).join(',')}`)
  check('the rest are refused', lost.length === 7, `lost=${lost.length}`)
  check('the seat is booked once',
    (await prisma.companyBooking.count({ where: { companyId: company.id, seatLabel: freeSeat } })) === 1)

  console.log('and the money matches the bookings')
  const bookings = await prisma.companyBooking.findMany({ where: { companyId: company.id } })
  const charged = bookings.reduce((sum, b) => sum + b.total, 0)
  const wallet = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the company was charged for the bookings that won',
    Math.abs((100000 - wallet.walletBalance) - charged) < 0.001,
    `charged=${100000 - wallet.walletBalance} bookings=${charged}`)

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.booking.deleteMany({ where: { tripId: trip.id } })
  await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.seatBlock.deleteMany({ where: { tripId: trip.id } })
  await prisma.seatHold.deleteMany({ where: { tripId: trip.id } })
  await prisma.walletTransaction.deleteMany({ where: { companyId: company.id } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.seat.deleteMany({ where: { layoutId: layout.id } })
  await prisma.busLayout.delete({ where: { id: layout.id } })
  await prisma.bus.delete({ where: { id: bus.id } })
  await prisma.station.deleteMany({ where: { id: { in: Object.values(st) }, tripStops: { none: {} } } })
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, companyUser.id] } } })
  await prisma.company.delete({ where: { id: company.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
