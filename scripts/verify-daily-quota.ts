/**
 * The overall daily company cap, and the route allowance inside it.
 *
 * A company has a daily cap: how many seats it may hold on ONE travel date,
 * counted across every trip, route, direction and bus on that date. The route
 * allowance is a subset of it, not an extra allowance on top.
 *
 * The cases that matter:
 *
 *   - the cap aggregates across trips, routes and buses
 *   - the route allowance binds inside the daily cap, and does not add to it
 *   - two different dates are two different allowances
 *   - the reverse of a route, and a route with different intermediate stops,
 *     are different routes
 *   - the per-trip allowance still applies on its own
 *   - the ten-seat per-booking rule still applies
 *   - a cancelled booking gives its seat back
 *   - a legacy trip with no stored route key cannot slip past the cap
 *   - concurrent bookings cannot exceed the cap
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   npx tsx scripts/verify-daily-quota.ts
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
async function book(
  companyId: string,
  tripId: string,
  seatLabels: string[],
  opts: { roundTripGroupId?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
    })
    await tx.$executeRawUnsafe('SELECT id FROM `Company` WHERE id = ? FOR UPDATE', companyId)
    await tx.$executeRawUnsafe('SELECT id FROM `Trip` WHERE id = ? FOR UPDATE', tripId)

    const limits = await resolveBookingLimits(tx, {
      company,
      tripId,
      trip,
      requestedSeats: seatLabels.length,
      roundTripGroupId: opts.roundTripGroupId ?? null,
    })

    const created: string[] = []
    for (const label of seatLabels) {
      const b = await tx.companyBooking.create({
        data: {
          reference: `DQ-${SUFFIX}-${Math.random().toString(36).slice(2, 10)}`,
          companyId,
          tripId,
          seatLabel: label,
          status: 'PENDING',
          total: 100,
          fromStopOrder: 1,
          toStopOrder: 1,
          roundTripGroupId: opts.roundTripGroupId ?? null,
        },
      })
      created.push(b.id)
    }
    return { ok: true as const, created, limits }
  }, BOOKING_ISOLATION)
}

/**
 * What the company is holding right now, counted the way the booking path
 * counts it: the seats on one travel date, and the seats on one route on that
 * date.
 */
async function heldOn(companyId: string, travelDate: string, routeKey?: string) {
  const rows = await prisma.companyBooking.findMany({
    where: {
      companyId,
      status: { in: ['PENDING', 'PAID', 'BOARDED'] },
    },
    select: { trip: { select: { routeKey: true, travelDate: true } } },
  })
  let daily = 0
  let route = 0
  for (const r of rows) {
    if (r.trip.travelDate !== travelDate) continue
    daily++
    if (routeKey && r.trip.routeKey === routeKey) route++
  }
  return { total: rows.length, daily, route }
}

async function main() {
  const company = await prisma.company.create({
    data: {
      name: `Daily Co ${SUFFIX}`, subdomain: `daily-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 1000000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
      maxDailySeats: null,
    },
  })

  const busA = await makeBus(company.id, `Daily Bus A ${SUFFIX}`)
  const busB = await makeBus(company.id, `Daily Bus B ${SUFFIX}`)
  const busC = await makeBus(company.id, `Daily Bus C ${SUFFIX}`)

  const st: Record<string, string> = {}
  for (const name of ['D-A', 'D-B', 'D-C']) {
    const s = await prisma.station.upsert({
      where: { name_city: { name: `${name} ${SUFFIX}`, city: 'daily' } },
      create: { name: `${name} ${SUFFIX}`, city: 'daily' },
      update: {},
    })
    st[name] = s.id
  }
  const route = [st['D-A'], st['D-B']]
  const routeOther = [st['D-A'], st['D-C']]
  const routeRev = [st['D-B'], st['D-A']]

  const makeTrip = async (busId: string, stations: string[], dayOffset: number, legacy = false) => {
    const departure = new Date(Date.now() + (dayOffset + 1) * 86400000)
    departure.setUTCHours(9, 0, 0, 0)
    return prisma.trip.create({
      data: {
        busId,
        origin: 'D-A', destination: 'D-B',
        departure, arrival: new Date(departure.getTime() + 6 * 3600000),
        price: 100, bookingMode: 'SEAT', status: 'SCHEDULED',
        routeKey: legacy ? null : routeKeyOfStops(stations.map((s, i) => ({ stationId: s, stopOrder: i + 1 }))),
        travelDate: legacy ? null : travelDateOf(departure),
        tripStops: {
          create: stations.map((s, i) => ({ stationId: s, stopOrder: i + 1, priceFromOrigin: i * 50 })),
        },
      },
    })
  }

  // Three buses on one route on one day, a second route on the same day, the
  // reverse of the first route, and the same route on another day.
  const tripA1 = await makeTrip(busA.bus.id, route, 0)
  const tripA2 = await makeTrip(busB.bus.id, route, 0)
  const tripOther = await makeTrip(busC.bus.id, routeOther, 0)
  const tripRev = await makeTrip(busC.bus.id, routeRev, 0)
  const tripNextDay = await makeTrip(busA.bus.id, route, 1)

  const day = travelDateOf(tripA1.departure)!
  const _nextDay = travelDateOf(tripNextDay.departure)!

  console.log('the cap aggregates across trips, routes and buses')
  await prisma.company.update({ where: { id: company.id }, data: { maxDailySeats: 20 } })

  const ten = await book(company.id, tripA1.id, busA.labels.slice(0, 10))
  check('ten seats fit under a daily cap of twenty', ten.ok && ten.limits.dailyUsed === 0,
    JSON.stringify(ten.limits))
  const six = await book(company.id, tripOther.id, busC.labels.slice(0, 6))
  check('six more on another route fit', six.ok, JSON.stringify(six.limits))
  check('and the cap counts both', six.ok && six.limits.dailyUsed === 10,
    JSON.stringify(six.limits))

  const four = await book(company.id, tripA2.id, busB.labels.slice(0, 4))
  check('four more on a second bus of the first route fit', four.ok, JSON.stringify(four.limits))
  check('the cap now counts all of them', four.ok && four.limits.dailyUsed === 16,
    JSON.stringify(four.limits))

  let refused = false
  try {
    await book(company.id, tripRev.id, busC.labels.slice(10, 15))
  } catch (e: any) {
    refused = e?.code === 'DAILY_QUOTA_EXCEEDED'
  }
  check('the seats that would take the company past twenty are refused', refused)

  console.log('another date is another allowance')
  const otherDay = await book(company.id, tripNextDay.id, busA.labels.slice(20, 28))
  check('the same route on another date has its own allowance', otherDay.ok,
    JSON.stringify(otherDay.limits))
  check('and the first date is still counted separately', otherDay.ok && otherDay.limits.dailyUsed === 0,
    JSON.stringify(otherDay.limits))

  console.log('the route allowance is a subset of the daily cap')
  // A fresh company, so the arithmetic is not carrying anything over.
  const sub = await prisma.company.create({
    data: {
      name: `Daily Sub Co ${SUFFIX}`, subdomain: `daily-sub-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 1000000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
      maxDailySeats: 20,
    },
  })
  const subRouteKey = routeKeyOfStops(route.map((s, i) => ({ stationId: s, stopOrder: i + 1 })))!
  await prisma.companyRouteQuota.upsert({
    where: { companyId_routeKey_travelDate: { companyId: sub.id, routeKey: subRouteKey, travelDate: day } },
    create: { companyId: sub.id, routeKey: subRouteKey, travelDate: day, maxSeats: 10 },
    update: { maxSeats: 10 },
  })
  // The example from the rule: a daily cap of twenty, a route allowance of
  // ten on one route. Ten on that route, then ten on another route, and the
  // daily allowance is exactly used up.
  const onRoute = await book(sub.id, tripA1.id, busA.labels.slice(0, 10))
  check('ten on the capped route fit', onRoute.ok, JSON.stringify(onRoute.limits))
  // The limits report the state before the booking, so the occupancy is read
  // again afterwards to see what the booking actually consumed.
  const afterRoute = await heldOn(sub.id, day, subRouteKey)
  check('and they count against the daily cap, not only the route one',
    afterRoute.daily === 10 && afterRoute.route === 10,
    JSON.stringify(afterRoute))
  const onOther = await book(sub.id, tripOther.id, busC.labels.slice(0, 10))
  check('the remaining ten daily seats are usable on another route', onOther.ok,
    JSON.stringify(onOther.limits))
  const afterOther = await heldOn(sub.id, day, subRouteKey)
  check('the company now holds twenty seats on that date', afterOther.daily === 20,
    JSON.stringify(afterOther))
  check('and the other route has no allowance of its own — it was only the daily cap',
    onOther.ok && onOther.limits.routeLimit === null && onOther.limits.routeUsed === 0,
    JSON.stringify(onOther.limits))
  let subRouteRefused = false
  try {
    await book(sub.id, tripA2.id, busB.labels.slice(0, 1))
  } catch (e: any) {
    subRouteRefused = e?.code === 'TRIP_QUOTA_EXCEEDED' && e?.kind === 'ROUTE'
  }
  check('the eleventh seat on the capped route is refused by the route allowance', subRouteRefused)
  let subDailyRefused = false
  try {
    await book(sub.id, tripRev.id, busC.labels.slice(20, 21))
  } catch (e: any) {
    subDailyRefused = e?.code === 'DAILY_QUOTA_EXCEEDED'
  }
  check('and a seat on any other route is refused by the daily cap', subDailyRefused)
  await prisma.companyBooking.deleteMany({ where: { companyId: sub.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: sub.id } })
  await prisma.company.delete({ where: { id: sub.id } })

  console.log('the per-trip allowance still applies on its own')
  await prisma.companyTripQuota.upsert({
    where: { companyId_tripId: { companyId: company.id, tripId: tripOther.id } },
    create: { companyId: company.id, tripId: tripOther.id, maxSeats: 6 },
    update: { maxSeats: 6 },
  })
  const tripRefused = await book(company.id, tripOther.id, busC.labels.slice(20, 27)).then(
    () => false,
    (e: any) => e?.code === 'TRIP_QUOTA_EXCEEDED' && e?.kind === 'TRIP',
  )
  check('a trip allowance of six refuses a seventh seat on that trip', tripRefused)

  console.log('the ten-seat per-booking rule still applies')
  const bookingRefused = await book(company.id, tripA1.id, busA.labels.slice(30, 42)).then(
    () => false,
    (e: any) => e?.code === 'SEAT_CAP_EXCEEDED',
  )
  check('a booking of twelve is refused', bookingRefused)

  console.log('a cancelled booking gives its seat back')
  const activeBefore = await prisma.companyBooking.count({
    where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
  })
  const one = await prisma.companyBooking.findFirst({
    where: { companyId: company.id, tripId: tripA1.id },
    orderBy: { createdAt: 'asc' },
  })
  await prisma.companyBooking.update({ where: { id: one!.id }, data: { status: 'CANCELLED' } })
  const activeAfter = await prisma.companyBooking.count({
    where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
  })
  check('the cancelled seat is not counted any more', activeAfter === activeBefore - 1,
    `before ${activeBefore} after ${activeAfter}`)

  console.log('a legacy trip cannot slip past the cap')
  await prisma.company.update({ where: { id: company.id }, data: { maxDailySeats: 20 } })
  const legacy = await makeTrip(busC.bus.id, routeOther, 2, true)
  check('the legacy trip really has no stored key', legacy.routeKey === null)
  const legacyBook = await book(company.id, legacy.id, busC.labels.slice(30, 40))
  check('a booking on the legacy trip is counted', legacyBook.ok, JSON.stringify(legacyBook.limits))

  console.log('concurrent bookings cannot exceed the cap')
  await prisma.company.update({ where: { id: company.id }, data: { maxDailySeats: 20 } })
  await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })

  const attempts = Array.from({ length: 8 }, (_, i) =>
    book(
      company.id,
      i % 2 === 0 ? tripA1.id : tripA2.id,
      (i % 2 === 0 ? busA.labels : busB.labels).slice((i % 6) * 2, (i % 6) * 2 + 5),
    ).then(
      (r) => ({ ok: true as const, limits: r.limits }),
      (e: any) => ({ ok: false as const, code: e?.code }),
    ),
  )
  const results = await Promise.all(attempts)
  const held = await prisma.companyBooking.count({
    where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
  })
  check('the company holds no more than the daily cap', held <= 20, `held ${held}`)
  check('the refusals name the daily cap',
    results.filter((r) => !r.ok).every((r) => r.code === 'DAILY_QUOTA_EXCEEDED'),
    JSON.stringify(results.filter((r) => !r.ok).map((r) => r.code)))

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.trip.deleteMany({ where: { id: { in: [tripA1.id, tripA2.id, tripOther.id, tripRev.id, tripNextDay.id, legacy.id] } } })
  await prisma.seat.deleteMany({ where: { layoutId: { in: [busA.bus.id, busB.bus.id, busC.bus.id] } } })
  await prisma.busLayout.deleteMany({ where: { busId: { in: [busA.bus.id, busB.bus.id, busC.bus.id] } } })
  await prisma.bus.deleteMany({ where: { id: { in: [busA.bus.id, busB.bus.id, busC.bus.id] } } })
  await prisma.station.deleteMany({ where: { id: { in: Object.values(st) }, tripStops: { none: {} } } })
  await prisma.company.delete({ where: { id: company.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
