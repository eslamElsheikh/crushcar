/**
 * Concurrency: concurrent admin bookings must not exceed a limit, must not
 * overdraw a wallet, and must not book the same seat twice.
 *
 * Run against MariaDB with the app serving on BASE:
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-admin-booking-race.ts
 *
 * SQLite cannot prove any of this — it has one writer — so the target is the
 * engine production runs on.
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

// This script writes to the database and deletes rows. It must never run against
// production, so the guard refuses to start unless this is a test database.
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
  const company = await prisma.company.create({
    data: {
      name: `Race Co ${SUFFIX}`, subdomain: `race-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 100000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Race Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 0, companyId: company.id },
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
  for (const name of ['بنها', 'أبو كبير', 'الغردقة']) {
    const s = await prisma.station.upsert({
      where: { name_city: { name, city: 'x' } },
      create: { name, city: 'x' },
      update: {},
    })
    stations[name] = s.id
  }
  const departure = new Date(Date.now() + 3 * 86400000)
  departure.setUTCHours(9, 0, 0, 0)
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin: 'بنها', destination: 'الغردقة',
      departure, arrival: new Date(departure.getTime() + 6 * 3600000),
      price: 100, bookingMode: 'SEAT', status: 'SCHEDULED',
      tripStops: { create: [
        { stationId: stations['بنها'], stopOrder: 1, priceFromOrigin: 0 },
        { stationId: stations['أبو كبير'], stopOrder: 2, priceFromOrigin: 50 },
        { stationId: stations['الغردقة'], stopOrder: 3, priceFromOrigin: 100 },
      ] },
    },
  })
  const { routeKeyOfStops, travelDateOf } = await import('../src/lib/route-key')
  const routeKey = routeKeyOfStops([
    { stationId: stations['بنها'], stopOrder: 1 },
    { stationId: stations['أبو كبير'], stopOrder: 2 },
    { stationId: stations['الغردقة'], stopOrder: 3 },
  ])!
  const travelDate = travelDateOf(departure)!
  await prisma.trip.update({ where: { id: trip.id }, data: { routeKey, travelDate } })

  const admin = await prisma.user.create({
    data: { email: `race-admin-${SUFFIX}@example.com`, password: 'x', name: 'Race Admin', role: 'SUPER_ADMIN' },
  })
  const { encode } = await import('next-auth/jwt')
  const { authSecret } = await import('./lib/auth-secret')
  const secret = authSecret()
  const token = await encode({
    token: { id: admin.id, sub: admin.id, email: admin.email, name: admin.name, role: 'SUPER_ADMIN', companyId: null, image: null, activeCheckedAt: Date.now() },
    secret, salt: 'next-auth.session-token',
  })

  const CONCURRENCY = Number(process.env.RACE_CONCURRENCY || 12)

  console.log(`twelve concurrent requests for the same seats (concurrency ${CONCURRENCY})`)
  // Every request asks for the same three seats. At most one may win.
  const same = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      post('/api/admin/company-bookings', {
        tripId: trip.id, companyId: company.id,
        passengers: labels.slice(0, 3).map((seatLabel) => ({ seatLabel })),
        idempotencyKey: `${SUFFIX}-same-${i}`,
      }, token),
    ),
  )
  const won = same.filter((r) => r.status === 200).length
  const rejectedSample = same.find((r) => r.status !== 200)
  if (rejectedSample) {
    console.log(`  INFO  first rejection was ${rejectedSample.status}: ${JSON.stringify(rejectedSample.json).slice(0, 220)}`)
  }
  const bookings = await prisma.companyBooking.findMany({ where: { tripId: trip.id } })
  console.log(`  INFO  ${won} of 12 requests were accepted; ${bookings.length} booking rows exist`)
  check('the same seats were booked at most once', bookings.length === 3, String(bookings.length))
  check('the wallet was charged once', (await prisma.walletTransaction.count({ where: { companyId: company.id } })) === 1,
    String(await prisma.walletTransaction.count({ where: { companyId: company.id } })))
  const walletAfterSame = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the wallet was charged for three seats, once', Math.abs((100000 - walletAfterSame.walletBalance) - 300) < 0.001,
    String(walletAfterSame.walletBalance))

  console.log('\ntwelve concurrent requests for different seats, under a daily allowance of nine')
  await prisma.company.update({ where: { id: company.id }, data: { walletBalance: 100000 } })
  await prisma.companyRouteQuota.upsert({
    where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
    create: { companyId: company.id, routeKey, travelDate, maxSeats: 9 },
    update: { maxSeats: 9 },
  })
  const different = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      post('/api/admin/company-bookings', {
        tripId: trip.id, companyId: company.id,
        passengers: [{ seatLabel: labels[10 + i] }],
        idempotencyKey: `${SUFFIX}-diff-${i}`,
      }, token),
    ),
  )
  const accepted = different.filter((r) => r.status === 200).length
  const held = await prisma.companyBooking.count({
    where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
  })
  console.log(`  INFO  ${accepted} of 12 were accepted; ${held} seats are held in total (3 already booked, allowance 9)`)
  check('the daily allowance was not exceeded', held <= 9, String(held))
  check('the allowance was reached', held === 9, String(held))
  const walletFinal = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  // The wallet was reset to 100000 before this group, and this group booked
  // six seats — one request each — so six hundred is what left it. The three
  // seats booked by the first group were charged before the reset.
  check('the wallet paid for exactly the seats this group booked',
    Math.abs((100000 - walletFinal.walletBalance) - accepted * 100) < 0.001,
    `wallet ${walletFinal.walletBalance}, ${accepted} accepted`)
  check('the wallet did not go negative', walletFinal.walletBalance >= 0, String(walletFinal.walletBalance))
  // One ledger row per request, not per seat: a request that covers three
  // seats is one charge.
  const ledgerCount = await prisma.walletTransaction.count({ where: { companyId: company.id } })
  check('one ledger row per accepted request', ledgerCount === 1 + accepted, `${ledgerCount} rows for ${accepted + 1} requests`)

  // Cleanup
  await prisma.walletTransaction.deleteMany({ where: { companyId: company.id } })
  await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.busLayout.delete({ where: { id: layout.id } })
  await prisma.bus.delete({ where: { id: bus.id } })
  await prisma.user.delete({ where: { id: admin.id } })
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
