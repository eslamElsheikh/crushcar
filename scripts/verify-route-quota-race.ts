/**
 * The shared daily allowance cannot be exceeded, even by concurrent bookings.
 *
 * The allowance is on a company, a route and a travel date, shared by every
 * bus the company runs on that route. Two bookings at the same moment must
 * not both see the same free seats and both take them — the classic
 * read-then-write race, which is how a company ends up holding twice the
 * seats it was allowed.
 *
 * This runs against MariaDB, because SQLite has one writer and cannot
 * reproduce two transactions overlapping at all.
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-route-quota-race.ts
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'
import { routeKeyOfStops, travelDateOf } from '../src/lib/route-key'
import { resolveBookingLimits } from '../src/lib/company-quota'
import { BOOKING_ISOLATION } from '../src/lib/transaction-isolation'

// This script writes to the database and deletes rows. It must never run
// against production, so the guard refuses to start unless this is a test database.
assertTestDatabase()

const prisma = new PrismaClient()

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

async function makeBus(companyId: string, name: string) {
  const bus = await prisma.bus.create({
    data: { name, type: 'COACH_BUS', seatCount: 0, companyId },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 10, cols: 6, aisleAfter: 2 } })
  const labels: string[] = []
  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 6; col++) {
      const label = `S${row}-${col}`
      labels.push(label)
      await prisma.seat.create({ data: { layoutId: layout.id, label, row, col, type: 'NORMAL', price: 0 } })
    }
  }
  return { bus, labels }
}

/**
 * Books the way the API route does: ask the shared limits whether it fits,
 * then write the rows. The limit decision is production code; only the
 * insert is local.
 */
async function book(companyId: string, tripId: string, seatLabels: string[]) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
    })
    // The same lock order the application uses: company, then trip, then the
    // quota rows.
    await tx.$executeRawUnsafe('SELECT id FROM `Company` WHERE id = ? FOR UPDATE', companyId)
    await tx.$executeRawUnsafe('SELECT id FROM `Trip` WHERE id = ? FOR UPDATE', tripId)

    const limits = await resolveBookingLimits(tx, {
      company,
      tripId,
      trip,
      requestedSeats: seatLabels.length,
    })

    const created: string[] = []
    for (const label of seatLabels) {
      const b = await tx.companyBooking.create({
        data: {
          reference: `RQ-${SUFFIX}-${Math.random().toString(36).slice(2, 10)}`,
          companyId,
          tripId,
          seatLabel: label,
          status: 'PENDING',
          total: 100,
          fromStopOrder: 1,
          toStopOrder: 1,
        },
      })
      created.push(b.id)
    }
    return { ok: true as const, created, limits }
  }, BOOKING_ISOLATION)
}

async function main() {
  const company = await prisma.company.create({
    data: {
      name: `Route Race Co ${SUFFIX}`, subdomain: `route-race-${SUFFIX}`, isActive: true,
      creditLimit: 500000, walletBalance: 500000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })

  const busA = await makeBus(company.id, `Race Bus A ${SUFFIX}`)
  const busB = await makeBus(company.id, `Race Bus B ${SUFFIX}`)

  const st: Record<string, string> = {}
  for (const name of ['Race A', 'Race B', 'Race C']) {
    const s = await prisma.station.upsert({
      where: { name_city: { name: `${name} ${SUFFIX}`, city: 'race' } },
      create: { name: `${name} ${SUFFIX}`, city: 'race' },
      update: {},
    })
    st[name] = s.id
  }
  const route = [st['Race A'], st['Race B'], st['Race C']]

  const departure = new Date(Date.now() + 3 * 86400000)
  departure.setUTCHours(9, 0, 0, 0)
  const routeKey = routeKeyOfStops(route.map((stationId, i) => ({ stationId, stopOrder: i + 1 })))!
  const travelDate = travelDateOf(departure)!

  // Two buses on the same route, same day.
  const makeTripOn = async (busId: string) =>
    prisma.trip.create({
      data: {
        busId,
        origin: 'Race A', destination: 'Race C',
        departure, arrival: new Date(departure.getTime() + 6 * 3600000),
        price: 100, bookingMode: 'SEAT', status: 'SCHEDULED',
        routeKey, travelDate,
        tripStops: {
          create: route.map((stationId, i) => ({ stationId, stopOrder: i + 1, priceFromOrigin: i * 50 })),
        },
      },
    })

  const tripA = await makeTripOn(busA.bus.id)
  const tripB = await makeTripOn(busB.bus.id)

  console.log('the shared daily allowance')
  // A daily allowance of ten seats, shared by the two buses.
  await prisma.companyRouteQuota.upsert({
    where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
    create: { companyId: company.id, routeKey, travelDate, maxSeats: 10 },
    update: { maxSeats: 10 },
  })

  // Ten concurrent requests, five seats each, spread over the two buses. If
  // the count were read before it was written, several of them would see the
  // same free seats and the company would end up with more than ten.
  const attempts = Array.from({ length: 10 }, (_, i) =>
    book(
      company.id,
      i % 2 === 0 ? tripA.id : tripB.id,
      (i % 2 === 0 ? busA.labels : busB.labels).slice((i % 6) * 2, (i % 6) * 2 + 5),
    ).then(
      (r) => ({ ok: true as const, limits: r.limits }),
      (e: any) => ({ ok: false as const, code: e?.code, message: e?.message }),
    ),
  )
  const results = await Promise.all(attempts)
  const accepted = results.filter((r) => r.ok)
  const refused = results.filter((r) => !r.ok)

  check(
    'the refusals name the daily allowance',
    refused.every((r) => r.code === 'TRIP_QUOTA_EXCEEDED'),
    JSON.stringify(refused.map((r) => r.code))
  )

  const held = await prisma.companyBooking.count({
    where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
  })
  check('the company holds no more than the daily allowance', held <= 10, `held ${held}`)
  check('the company does hold seats', held > 0, `held ${held}`)
  check('the allowance was reached, not merely not exceeded',
    held === 10 || (accepted.length === 2 && held === 10),
    `held ${held}, accepted ${accepted.length}`)

  console.log('and the count agrees with the bookings')
  const count = await prisma.companyBooking.groupBy({
    by: ['tripId'],
    where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
    _count: { _all: true },
  })
  const total = count.reduce((sum, c) => sum + c._count._all, 0)
  check('every seat held is a booking row', total === held, `${total} vs ${held}`)

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.trip.deleteMany({ where: { id: { in: [tripA.id, tripB.id] } } })
  await prisma.seat.deleteMany({ where: { layoutId: { in: [busA.bus.id, busB.bus.id] } } })
  await prisma.busLayout.deleteMany({ where: { busId: { in: [busA.bus.id, busB.bus.id] } } })
  await prisma.bus.deleteMany({ where: { id: { in: [busA.bus.id, busB.bus.id] } } })
  await prisma.station.deleteMany({ where: { id: { in: Object.values(st) }, tripStops: { none: {} } } })
  await prisma.company.delete({ where: { id: company.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
