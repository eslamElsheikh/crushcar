/**
 * Proves the company seat limits and the wallet-only charge.
 *
 * Run against MariaDB:
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db" npx tsx scripts/verify-company-limits.ts
 *
 * This calls the real modules — resolveBookingLimits and
 * chargeCompanyWalletOnly — rather than a copy of the rules, so a change to
 * the production logic is what gets tested. Only the row creation is local,
 * because that is the part the API route owns.
 *
 * The ceilings, in the order they apply:
 *   1. ten seats per booking, which is the hard business rule
 *   2. a company may be given a lower ceiling, never a higher one
 *   3. a per-trip cap
 *   4. a daily allowance for the route, shared by every bus on that route
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

// This script writes to the database and deletes rows. It must never run against
// production, so the guard refuses to start unless this is a test database.
assertTestDatabase()
import { resolveBookingLimits } from '../src/lib/company-quota'
import { BOOKING_ISOLATION } from '../src/lib/transaction-isolation'
import { chargeCompanyWalletOnly, splitCharge } from '../src/lib/company-charge'
import { effectiveMaxSeatsPerBooking, MAX_SEATS_PER_BOOKING } from '../src/lib/booking-limits'
import { routeKeyOfStops, travelDateOf } from '../src/lib/route-key'

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

async function makeBus(companyId: string, name: string, seatCount: number) {
  const bus = await prisma.bus.create({
    data: { name, type: 'COACH_BUS', seatCount, companyId },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 12, cols: 6, aisleAfter: 2 } })
  const labels: string[] = []
  let n = 0
  for (let row = 1; row <= 12; row++) {
    for (let col = 1; col <= 6; col++) {
      n++
      const label = `S${n}`
      labels.push(label)
      await prisma.seat.create({ data: { layoutId: layout.id, label, row, col, type: 'NORMAL', price: 0 } })
    }
  }
  return { bus, labels }
}

async function makeTrip(
  busId: string,
  from: string,
  to: string,
  stationIds: string[],
  dayOffset: number,
  /**
   * A legacy trip: one that existed before the route-key columns were added,
   * so the stored key and travel date are still null even though it has
   * perfectly good stops. The application has to place it in the right
   * bucket from its stops, because a trip with a null key that nobody counts
   * is a trip that sits outside every daily allowance.
   */
  legacy = false,
) {
  const departure = new Date(Date.now() + (dayOffset + 1) * 86400000)
  departure.setUTCHours(9, 0, 0, 0)
  return prisma.trip.create({
    data: {
      busId,
      origin: from,
      destination: to,
      departure,
      arrival: new Date(departure.getTime() + 6 * 3600000),
      price: 100,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      routeKey: legacy ? null : routeKeyOfStops(stationIds.map((stationId, i) => ({ stationId, stopOrder: i + 1 }))),
      travelDate: legacy ? null : travelDateOf(departure),
      tripStops: {
        create: stationIds.map((stationId, i) => ({ stationId, stopOrder: i + 1, priceFromOrigin: i * 50 })),
      },
    },
    include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
  })
}

/**
 * Books seats the way the API route does: ask the shared limits whether it
 * fits, then write the rows. The limit decision is production code; only the
 * insert is local.
 */
async function book(
  companyId: string,
  tripId: string,
  seatLabels: string[],
  opts: { roundTripGroupId?: string | null; price?: number } = {},
) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
    })
    await tx.$executeRawUnsafe('SELECT id FROM `Trip` WHERE id = ? FOR UPDATE', tripId)
    await tx.$executeRawUnsafe('SELECT id FROM `Company` WHERE id = ? FOR UPDATE', companyId)

    const limits = await resolveBookingLimits(tx, {
      company,
      tripId,
      trip,
      requestedSeats: seatLabels.length,
      roundTripGroupId: opts.roundTripGroupId ?? null,
    })

    const taken = new Set(
      (await tx.companyBooking.findMany({ where: { tripId }, select: { seatLabel: true } })).map((b) => b.seatLabel),
    )
    const free = seatLabels.filter((s) => !taken.has(s))
    if (free.length !== seatLabels.length) {
      const err = new Error('SEAT_CONFLICT')
      ;(err as Error & { code?: string }).code = 'SEAT_CONFLICT'
      throw err
    }

    for (const label of free) {
      await tx.companyBooking.create({
        data: {
          reference: `LIM-${SUFFIX}-${Math.random().toString(36).slice(2, 10)}`,
          companyId,
          tripId,
          seatLabel: label,
          status: 'PENDING',
          total: opts.price ?? 100,
          fromStopOrder: 1,
          toStopOrder: 1,
          roundTripGroupId: opts.roundTripGroupId ?? null,
        },
      })
    }
    return { ok: true as const, created: free.length, limits }
  }, BOOKING_ISOLATION)
}

async function main() {
  console.log('the hard per-booking rule')
  const company = await prisma.company.create({
    data: {
      name: `Limits Co ${SUFFIX}`, subdomain: `limits-${SUFFIX}`, isActive: true,
      creditLimit: 500000, walletBalance: 500000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const otherCompany = await prisma.company.create({
    data: {
      name: `Other Co ${SUFFIX}`, subdomain: `other-${SUFFIX}`, isActive: true,
      creditLimit: 500000, walletBalance: 500000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })

  const busA = await makeBus(company.id, `Bus A ${SUFFIX}`, 72)
  const busB = await makeBus(company.id, `Bus B ${SUFFIX}`, 72)
  const busC = await makeBus(company.id, `Bus C ${SUFFIX}`, 72)
  const busOther = await makeBus(otherCompany.id, `Bus X ${SUFFIX}`, 72)

  const st: Record<string, string> = {}
  for (const name of ['المنصورة', 'الزقازيق', 'شرم الشيخ', 'الغردقة', 'الإسكندرية']) {
    // Reuse a station that already exists rather than failing on the
    // (name, city) unique key.
    const s = await prisma.station.upsert({
      where: { name_city: { name, city: 'x' } },
      create: { name, city: 'x' },
      update: {},
    })
    st[name] = s.id
  }
  const route = [st['المنصورة'], st['الزقازيق'], st['شرم الشيخ']]
  const routeRev = [st['شرم الشيخ'], st['الزقازيق'], st['المنصورة']]
  const otherRoute = [st['المنصورة'], st['الزقازيق'], st['الغردقة']]

  // Three buses on the same route, same day. Plus a reverse, a different
  // route, and a different day.
  const tripA1 = await makeTrip(busA.bus.id, 'المنصورة', 'شرم الشيخ', route, 0)
  const tripA2 = await makeTrip(busB.bus.id, 'المنصورة', 'شرم الشيخ', route, 0)
  const tripA3 = await makeTrip(busC.bus.id, 'المنصورة', 'شرم الشيخ', route, 0)
  const tripRev = await makeTrip(busA.bus.id, 'شرم الشيخ', 'المنصورة', routeRev, 0)
  const tripOtherRoute = await makeTrip(busA.bus.id, 'المنصورة', 'الغردقة', otherRoute, 0)
  const tripOtherDay = await makeTrip(busA.bus.id, 'المنصورة', 'شرم الشيخ', route, 1)
  const tripOtherCo = await makeTrip(busOther.bus.id, 'المنصورة', 'شرم الشيخ', route, 0)

  check('three buses on one route share a route key',
    tripA1.routeKey === tripA2.routeKey && tripA2.routeKey === tripA3.routeKey,
    `${tripA1.routeKey} / ${tripA2.routeKey}`)
  check('the reverse direction is a different route', tripRev.routeKey !== tripA1.routeKey)
  check('a different route is a different route', tripOtherRoute.routeKey !== tripA1.routeKey)
  check('the same route on another day has the same key', tripOtherDay.routeKey === tripA1.routeKey)
  check('but a different travel date', tripOtherDay.travelDate !== tripA1.travelDate)
  check('another company on the same route has its own bucket',
    tripOtherCo.routeKey === tripA1.routeKey && tripOtherCo.travelDate === tripA1.travelDate)

  console.log('ten seats per booking')
  const ten = await book(company.id, tripA1.id, busA.labels.slice(0, 10))
  check('a booking of ten is allowed', ten.ok, JSON.stringify(ten.limits))
  let elevenRefused = false
  try {
    await book(company.id, tripA1.id, busA.labels.slice(10, 21))
  } catch (e: any) {
    elevenRefused = e?.code === 'SEAT_CAP_EXCEEDED'
  }
  check('a booking of eleven is refused', elevenRefused)
  check('the refused booking created nothing',
    (await prisma.companyBooking.count({ where: { companyId: company.id, tripId: tripA1.id } })) === 10)

  console.log('a company may be given a lower ceiling, never a higher one')
  check('a stored value of 500 does not raise the ceiling',
    effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: 500 }) === MAX_SEATS_PER_BOOKING,
    String(effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: 500 })))
  check('a stored value of 4 lowers the ceiling',
    effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: 4 }) === 4)
  await prisma.company.update({ where: { id: company.id }, data: { maxSeatsPerBooking: 3 } })
  let fourRefused = false
  try {
    await book(company.id, tripA1.id, busA.labels.slice(20, 24))
  } catch (e: any) {
    fourRefused = e?.code === 'SEAT_CAP_EXCEEDED'
  }
  check('a booking of four is refused under a ceiling of three', fourRefused)
  await prisma.company.update({ where: { id: company.id }, data: { maxSeatsPerBooking: null } })

  console.log('the daily allowance for the route, shared by every bus')
  await prisma.companyRouteQuota.upsert({
    where: {
      companyId_routeKey_travelDate: {
        companyId: company.id, routeKey: tripA1.routeKey!, travelDate: tripA1.travelDate!,
      },
    },
    create: { companyId: company.id, routeKey: tripA1.routeKey!, travelDate: tripA1.travelDate!, maxSeats: 15 },
    update: { maxSeats: 15 },
  })
  // Ten are already held on tripA1. Five more fit on another bus, and no more.
  const five = await book(company.id, tripA2.id, busB.labels.slice(0, 5))
  check('five more on a second bus fit under a daily allowance of fifteen', five.ok, JSON.stringify(five.limits))
  let quotaRefused = false
  try {
    await book(company.id, tripA3.id, busC.labels.slice(0, 1))
  } catch (e: any) {
    quotaRefused = e?.code === 'TRIP_QUOTA_EXCEEDED'
  }
  check('the next seat on a third bus is refused by the daily allowance', quotaRefused)
  check('fifteen seats are held across the three buses',
    (await prisma.companyBooking.count({
      where: { companyId: company.id, status: { in: ['PENDING', 'PAID', 'BOARDED'] }, trip: { routeKey: tripA1.routeKey, travelDate: tripA1.travelDate } },
    })) === 15)

  console.log('the buckets are independent')
  const rev = await book(company.id, tripRev.id, busA.labels.slice(30, 34))
  check('the reverse direction has its own allowance', rev.ok, JSON.stringify(rev.limits))
  const otherRouteBooking = await book(company.id, tripOtherRoute.id, busA.labels.slice(40, 43))
  check('a different route has its own allowance', otherRouteBooking.ok)
  const otherDayBooking = await book(company.id, tripOtherDay.id, busA.labels.slice(50, 53))
  check('a different travel date has its own allowance', otherDayBooking.ok)
  const otherCoBooking = await book(otherCompany.id, tripOtherCo.id, busOther.labels.slice(0, 3))
  check('another company has its own allowance', otherCoBooking.ok)

  console.log('a cancelled booking gives its seats back')
  const first = await prisma.companyBooking.findFirst({
    where: { companyId: company.id, tripId: tripA1.id }, orderBy: { createdAt: 'asc' },
  })
  await prisma.companyBooking.update({ where: { id: first!.id }, data: { status: 'CANCELLED' } })
  const freed = await book(company.id, tripA3.id, busC.labels.slice(1, 2))
  check('the seat a cancelled booking gave back is available again', freed.ok, JSON.stringify(freed.limits))

  console.log('legacy trips, whose stored route key is still null')
  // Two buses on the same route and the same day, both of them legacy: their
  // stored route key and travel date are null, and only their stops say what
  // route they are on.
  const legacyA = await makeTrip(busA.bus.id, 'المنصورة', 'شرم الشيخ', route, 2, true)
  const legacyB = await makeTrip(busB.bus.id, 'المنصورة', 'شرم الشيخ', route, 2, true)
  // And a legacy trip in the other direction, and one on another day, so the
  // test proves the buckets are still kept apart.
  const legacyRev = await makeTrip(busC.bus.id, 'شرم الشيخ', 'المنصورة', routeRev, 2, true)
  const legacyOtherDay = await makeTrip(busA.bus.id, 'المنصورة', 'شرم الشيخ', route, 3, true)

  check('the legacy trips really do have no stored key',
    legacyA.routeKey === null && legacyA.travelDate === null)
  check('they still have stops, so their route can be derived',
    legacyA.tripStops.length === route.length)

  const legacyKey = routeKeyOfStops(route.map((stationId, i) => ({ stationId, stopOrder: i + 1 })))
  const legacyDate = travelDateOf(legacyA.departure)
  await prisma.companyRouteQuota.upsert({
    where: {
      companyId_routeKey_travelDate: {
        companyId: company.id, routeKey: legacyKey!, travelDate: legacyDate!,
      },
    },
    create: { companyId: company.id, routeKey: legacyKey!, travelDate: legacyDate!, maxSeats: 4 },
    update: { maxSeats: 4 },
  })

  const legacyFirst = await book(company.id, legacyA.id, busA.labels.slice(60, 64))
  check('a legacy trip can be booked under the daily allowance', legacyFirst.ok, JSON.stringify(legacyFirst.limits))
  check('the legacy trip was counted against the daily allowance',
    legacyFirst.ok && legacyFirst.limits.routeUsed === 0,
    JSON.stringify(legacyFirst.limits))

  let legacySecondRefused = false
  try {
    await book(company.id, legacyB.id, busB.labels.slice(0, 1))
  } catch (e: any) {
    legacySecondRefused = e?.code === 'TRIP_QUOTA_EXCEEDED'
  }
  check('the next legacy trip on the same route and day is refused by the daily allowance',
    legacySecondRefused)

  const legacyRevBooking = await book(company.id, legacyRev.id, busC.labels.slice(0, 2))
  check('a legacy trip in the other direction has its own allowance', legacyRevBooking.ok,
    JSON.stringify(legacyRevBooking.limits))
  const legacyOtherDayBooking = await book(company.id, legacyOtherDay.id, busA.labels.slice(0, 2))
  check('a legacy trip on another day has its own allowance', legacyOtherDayBooking.ok,
    JSON.stringify(legacyOtherDayBooking.limits))

  console.log('a trip with no stops at all is refused, not quietly exempt')
  const noStops = await prisma.trip.create({
    data: {
      busId: busA.bus.id,
      origin: 'المنصورة', destination: 'شرم الشيخ',
      departure: new Date(Date.now() + 5 * 86400000),
      arrival: new Date(Date.now() + 5 * 86400000 + 6 * 3600000),
      price: 100, bookingMode: 'SEAT', status: 'SCHEDULED',
    },
  })
  let noStopsRefused = false
  try {
    await book(company.id, noStops.id, busA.labels.slice(10, 11))
  } catch (e: any) {
    noStopsRefused = e?.code === 'UNRESOLVED_ROUTE'
  }
  check('a trip with no stops is refused instead of escaping the daily allowance', noStopsRefused)
  check('and nothing was booked on it',
    (await prisma.companyBooking.count({ where: { companyId: company.id, tripId: noStops.id } })) === 0)


  console.log('the wallet-only charge')
  const before = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  const charge = await prisma.$transaction((tx) =>
    chargeCompanyWalletOnly(tx, {
      companyId: company.id,
      total: 300,
      reference: 'booking-1',
      description: 'test',
      idempotencyKey: `charge:${SUFFIX}:1`,
      actorId: 'admin-1',
      actorEmail: 'admin@example.com',
    }),
  )
  const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the wallet was charged', Math.abs((before.walletBalance - after.walletBalance) - 300) < 0.001,
    `${before.walletBalance} -> ${after.walletBalance}`)
  check('the whole amount came from the wallet', charge.paidFromWallet === 300)
  check('nothing went on the credit line', after.outstandingBalance === before.outstandingBalance)
  check('the credit limit was not touched', after.creditLimit === before.creditLimit)
  const ledger = await prisma.walletTransaction.findFirst({ where: { idempotencyKey: `charge:${SUFFIX}:1` } })
  check('a ledger row was written', !!ledger)
  check('the ledger row records the debit', (ledger?.amount ?? 0) === -300, String(ledger?.amount))

  console.log('a short wallet refuses the whole thing')
  await prisma.company.update({ where: { id: company.id }, data: { walletBalance: 10 } })
  let shortRefused = false
  try {
    await prisma.$transaction((tx) =>
      chargeCompanyWalletOnly(tx, {
        companyId: company.id, total: 300, reference: 'booking-2', description: 'test',
        idempotencyKey: `charge:${SUFFIX}:2`, actorId: 'admin-1', actorEmail: 'admin@example.com',
      }),
    )
  } catch (e: any) {
    shortRefused = e?.code === 'INSUFFICIENT_WALLET'
  }
  check('the charge is refused', shortRefused)
  const afterShort = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the wallet did not move', afterShort.walletBalance === 10, String(afterShort.walletBalance))
  check('no ledger row was written for it',
    (await prisma.walletTransaction.count({ where: { idempotencyKey: `charge:${SUFFIX}:2` } })) === 0)

  console.log('the same idempotency key twice')
  await prisma.company.update({ where: { id: company.id }, data: { walletBalance: 1000 } })
  await prisma.$transaction((tx) =>
    chargeCompanyWalletOnly(tx, {
      companyId: company.id, total: 300, reference: 'booking-3', description: 'test',
      idempotencyKey: `charge:${SUFFIX}:3`, actorId: 'admin-1', actorEmail: 'admin@example.com',
    }),
  )
  let duplicateRefused = false
  try {
    await prisma.$transaction((tx) =>
      chargeCompanyWalletOnly(tx, {
        companyId: company.id, total: 300, reference: 'booking-3', description: 'test',
        idempotencyKey: `charge:${SUFFIX}:3`, actorId: 'admin-1', actorEmail: 'admin@example.com',
      }),
    )
  } catch (e: any) {
    duplicateRefused = e?.code === 'DUPLICATE_CHARGE'
  }
  check('the second charge is refused', duplicateRefused)
  check('only one ledger row exists',
    (await prisma.walletTransaction.count({ where: { idempotencyKey: `charge:${SUFFIX}:3` } })) === 1)

  console.log('the per-seat figures add back up')
  check('a hundred over three seats is 33.33/33.33/33.34',
    JSON.stringify(splitCharge(100, 3)) === '[33.33,33.33,33.34]', JSON.stringify(splitCharge(100, 3)))
  check('the shares sum to the total',
    Math.abs(splitCharge(100, 3).reduce((a, b) => a + b, 0) - 100) < 0.001)

  // Cleanup. Stations are shared with anything else in the database, so they
  // are only removed when nothing references them any more.
  await prisma.walletTransaction.deleteMany({ where: { companyId: { in: [company.id, otherCompany.id] } } })
  await prisma.companyBooking.deleteMany({ where: { companyId: { in: [company.id, otherCompany.id] } } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: { in: [company.id, otherCompany.id] } } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: { in: [company.id, otherCompany.id] } } })
  await prisma.trip.deleteMany({ where: { id: { in: [tripA1.id, tripA2.id, tripA3.id, tripRev.id, tripOtherRoute.id, tripOtherDay.id, tripOtherCo.id, legacyA.id, legacyB.id, legacyRev.id, legacyOtherDay.id, noStops.id] } } })
  await prisma.busLayout.deleteMany({ where: { busId: { in: [busA.bus.id, busB.bus.id, busC.bus.id, busOther.bus.id] } } })
  await prisma.bus.deleteMany({ where: { id: { in: [busA.bus.id, busB.bus.id, busC.bus.id, busOther.bus.id] } } })
  await prisma.station.deleteMany({ where: { id: { in: Object.values(st) }, tripStops: { none: {} } } })
  await prisma.user.deleteMany({ where: { companyId: { in: [company.id, otherCompany.id] } } })
  await prisma.company.deleteMany({ where: { id: { in: [company.id, otherCompany.id] } } })

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
