/**
 * Charter bookings are a separate product, and they stay separate.
 *
 * A charter books a whole bus. It creates a CharterBooking row, not a
 * CompanyBooking row, and it makes no seat allocation — so it consumes none
 * of the ordinary company seat limits: not the daily cap, not the route
 * allowance, not the per-trip quota, not the ten-seat per-booking rule.
 *
 * These are the tests that keep it that way. They would fail if a charter
 * were ever counted as ordinary seat occupancy.
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-charter-isolation.ts
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'
import { routeKeyOfStops, travelDateOf } from '../src/lib/route-key'
import { resolveBookingLimits, readBookingLimits } from '../src/lib/company-quota'
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

async function main() {
  const company = await prisma.company.create({
    data: {
      name: `Charter Co ${SUFFIX}`, subdomain: `charter-${SUFFIX}`, isActive: true,
      creditLimit: 500000, walletBalance: 500000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
      maxDailySeats: 10,
    },
  })

  const bus = await prisma.bus.create({
    data: { name: `Charter Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 50, companyId: company.id },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 10, cols: 6, aisleAfter: 2 } })
  let seatCount = 0
  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 6; col++) {
      seatCount++
      await prisma.seat.create({ data: { layoutId: layout.id, label: `S${row}-${col}`, row, col, type: 'NORMAL', price: 100 } })
    }
  }

  const station = await prisma.station.upsert({
    where: { name_city: { name: `Charter Stn ${SUFFIX}`, city: 'charter' } },
    create: { name: `Charter Stn ${SUFFIX}`, city: 'charter' },
    update: {},
  })
  const route = [station.id]
  const routeKey = routeKeyOfStops(route.map((s, i) => ({ stationId: s, stopOrder: i + 1 })))!

  const departure = new Date(Date.now() + 2 * 86400000)
  departure.setUTCHours(9, 0, 0, 0)
  const travelDate = travelDateOf(departure)!

  // A seat trip and a charter trip on the same route, the same day.
  const seatTrip = await prisma.trip.create({
    data: {
      busId: bus.id, origin: 'A', destination: 'B',
      departure, arrival: new Date(departure.getTime() + 6 * 3600000),
      price: 100, status: 'SCHEDULED', bookingMode: 'SEAT',
      routeKey, travelDate,
      tripStops: { create: route.map((s, i) => ({ stationId: s, stopOrder: i + 1, priceFromOrigin: i * 50 })) },
    },
  })
  const charterTrip = await prisma.trip.create({
    data: {
      busId: bus.id, origin: 'A', destination: 'B',
      departure, arrival: new Date(departure.getTime() + 6 * 3600000),
      price: 1000, busPrice: 5000, status: 'SCHEDULED', bookingMode: 'BUS',
      routeKey, travelDate,
      tripStops: { create: route.map((s, i) => ({ stationId: s, stopOrder: i + 1, priceFromOrigin: i * 50 })) },
    },
  })

  // A daily allowance of ten seats, and a route allowance of four.
  await prisma.companyRouteQuota.upsert({
    where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
    create: { companyId: company.id, routeKey, travelDate, maxSeats: 4 },
    update: { maxSeats: 4 },
  })

  console.log('a charter booking does not consume the ordinary daily cap')
  // The charter takes the whole bus: fifty seats, on a trip with a daily cap
  // of ten.
  const charter = await prisma.charterBooking.create({
    data: {
      tripId: charterTrip.id,
      companyId: company.id,
      price: 5000,
      status: 'confirmed',
      paidFromWallet: 5000,
      paidOnCredit: 0,
    },
  })
  check('the charter booking is confirmed', charter.status === 'confirmed')
  check('the bus has sixty seats', seatCount === 60, String(seatCount))

  const companyRow = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  const tripRow = await prisma.trip.findUniqueOrThrow({
    where: { id: seatTrip.id },
    include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
  })

  const limits = await prisma.$transaction(async (tx) => {
    const c = await tx.company.findUniqueOrThrow({ where: { id: company.id } })
    return resolveBookingLimits(tx, {
      company: c,
      tripId: seatTrip.id,
      trip: tripRow,
      requestedSeats: 4,
    })
  }, BOOKING_ISOLATION)

  check('the daily cap still reads ten', limits.dailyLimit === 10, String(limits.dailyLimit))
  check('and the charter has taken none of it', limits.dailyUsed === 0, String(limits.dailyUsed))
  check('the route allowance still reads four', limits.routeLimit === 4, String(limits.routeLimit))
  check('and the charter has taken none of that either', limits.routeUsed === 0, String(limits.routeUsed))

  console.log('and the charter is not an ordinary booking at all')
  check('there is no company booking for it',
    (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 0)
  check('it is a charter booking', (await prisma.charterBooking.count({ where: { companyId: company.id } })) === 1)

  console.log('ordinary bookings still obey every limit')
  // The usage is read through the read-only path, so the reading does not
  // itself need a seat to be free.
  const four = await readBookingLimits(prisma, {
    company: companyRow,
    tripId: seatTrip.id,
    trip: tripRow,
  })
  check('four seats fit under the route allowance of four', four.routeLimit === 4, String(four.routeLimit))
  check('with nothing held yet', four.routeUsed === 0 && four.dailyUsed === 0,
    `route ${four.routeUsed} daily ${four.dailyUsed}`)

  // Writing four ordinary bookings fills the route allowance, and the fifth
  // is refused by it.
  for (let i = 0; i < 4; i++) {
    await prisma.companyBooking.create({
      data: {
        reference: `charter-seats-${SUFFIX}-${i}`,
        companyId: company.id, tripId: seatTrip.id, seatLabel: `S1-${i + 1}`,
        status: 'PENDING', total: 100, fromStopOrder: 1, toStopOrder: 1,
      },
    })
  }
  const afterFour = await readBookingLimits(prisma, {
    company: companyRow,
    tripId: seatTrip.id,
    trip: tripRow,
  })
  check('the route allowance now counts the four ordinary seats', afterFour.routeUsed === 4,
    String(afterFour.routeUsed))
  check('and the daily cap counts them too', afterFour.dailyUsed === 4, String(afterFour.dailyUsed))

  let refused = false
  try {
    await prisma.$transaction(async (tx) => {
      const c = await tx.company.findUniqueOrThrow({ where: { id: company.id } })
      const t = await tx.trip.findUniqueOrThrow({
        where: { id: seatTrip.id },
        include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
      })
      return resolveBookingLimits(tx, { company: c, tripId: seatTrip.id, trip: t, requestedSeats: 1 })
    }, BOOKING_ISOLATION)
  } catch (e: any) {
    refused = e?.code === 'TRIP_QUOTA_EXCEEDED'
  }
  check('the fifth ordinary seat is refused by the route allowance', refused)

  // The company itself was not changed by any of this.
  const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the company was not charged for the charter', after.walletBalance === companyRow.walletBalance,
    `${companyRow.walletBalance} -> ${after.walletBalance}`)
  check('and nothing went on credit by the charter', after.outstandingBalance === companyRow.outstandingBalance)

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.booking.deleteMany({ where: { tripId: { in: [seatTrip.id, charterTrip.id] } } })
  await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.charterBooking.deleteMany({ where: { companyId: company.id } })
  await prisma.creditLog.deleteMany({ where: { companyId: company.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.seatHold.deleteMany({ where: { tripId: { in: [seatTrip.id, charterTrip.id] } } })
  await prisma.seatBlock.deleteMany({ where: { tripId: { in: [seatTrip.id, charterTrip.id] } } })
  await prisma.walletTransaction.deleteMany({ where: { companyId: company.id } })
  await prisma.tripStop.deleteMany({ where: { tripId: { in: [seatTrip.id, charterTrip.id] } } })
  await prisma.trip.deleteMany({ where: { id: { in: [seatTrip.id, charterTrip.id] } } })
  await prisma.seat.deleteMany({ where: { layoutId: layout.id } })
  await prisma.busLayout.delete({ where: { id: layout.id } })
  await prisma.bus.delete({ where: { id: bus.id } })
  await prisma.station.deleteMany({ where: { id: station.id, tripStops: { none: {} } } })
  await prisma.user.updateMany({ where: { companyId: company.id }, data: { companyId: null } })
  await prisma.company.delete({ where: { id: company.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
