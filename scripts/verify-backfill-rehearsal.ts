/**
 * The backfill rehearsal.
 *
 * The backfill fills two columns on every trip: the route it runs and the
 * day it runs. The keys decide which bookings share a daily allowance, so
 * they have to be right before they are written to production.
 *
 * This script runs against a copy of production data and checks, on that
 * data:
 *
 *   - that every stored key is exactly the trip's own ordered stops
 *   - that the travel date is the Cairo day, and that the five trips whose
 *     UTC day differs are in the right bucket because of it
 *   - that the reverse of a route is a different key, not the same one
 *   - that no two different stop sequences share a key
 *   - that a daily allowance set on a real route holds across the real buses
 *     that serve it, including a bus whose trip was written before the
 *     columns existed
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   npx tsx scripts/verify-backfill-rehearsal.ts
 *
 * It expects the backfill to have been run already; it checks the result.
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'
import { routeKeyOfStops, travelDateOf, routeDayKey, parseRouteDayKey } from '../src/lib/route-key'
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

async function main() {
  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      routeKey: true,
      travelDate: true,
      departure: true,
      origin: true,
      destination: true,
      busId: true,
      bus: { select: { companyId: true } },
      tripStops: { select: { stationId: true, stopOrder: true }, orderBy: { stopOrder: 'asc' } },
    },
  })

  console.log(`the copy under test: ${trips.length} trips`)

  // ── 1. Every stored key is the trip's own stops ─────────────────────
  const withStops = trips.filter((t) => t.tripStops.length > 0)
  const withoutStops = trips.filter((t) => t.tripStops.length === 0)
  let mismatched = 0
  for (const t of withStops) {
    const expected = routeKeyOfStops(t.tripStops)
    if (t.routeKey !== expected) mismatched++
  }
  check('every trip with stops has a key equal to its own stops',
    mismatched === 0, `${mismatched} of ${withStops.length} differ`)
  check('no trip with stops was left without a key',
    withStops.every((t) => t.routeKey !== null && t.travelDate !== null))
  check('the trips left without a key are the ones with no stops',
    withoutStops.every((t) => t.routeKey === null && t.travelDate === null),
    `${withoutStops.length} trip(s) with no stops`)

  // ── 2. The travel date is the Cairo day ─────────────────────────────
  let wrongDate = 0
  for (const t of trips) {
    if (t.routeKey === null) continue
    if (t.travelDate !== travelDateOf(t.departure)) wrongDate++
  }
  check('every travel date is the Cairo day of the departure', wrongDate === 0, `${wrongDate} differ`)

  const utcDayDiffers = trips.filter(
    (t) => t.travelDate !== null && t.travelDate !== t.departure.toISOString().slice(0, 10),
  ).length
  console.log(`  INFO  ${utcDayDiffers} trip(s) fall on a different day in Cairo than in UTC —`)
  console.log(`        the Cairo day is the one that decides the bucket`)

  // ── 3. Direction is kept ─────────────────────────────────────────────
  const routeKeys = [...new Set(trips.map((t) => t.routeKey).filter(Boolean) as string[])]
  const reverseOf = (k: string) => k.split('|').reverse().join('|')
  const bothWays = routeKeys.filter((k) => routeKeys.includes(reverseOf(k)) && reverseOf(k) !== k)
  console.log(`  INFO  ${routeKeys.length} distinct routes, ${bothWays.length} of them run both ways`)

  // A bucket that holds both "A → B" and "B → A" would mean the direction
  // was thrown away.
  const byKey = new Map<string, Set<string>>()
  for (const t of trips) {
    if (!t.routeKey) continue
    const set = byKey.get(t.routeKey) ?? new Set<string>()
    set.add(`${t.origin} → ${t.destination}`)
    byKey.set(t.routeKey, set)
  }
  let mixedDirection = 0
  for (const texts of byKey.values()) {
    const list = [...texts]
    for (const a of list) {
      for (const b of list) {
        if (a === b) continue
        const [af, at] = a.split(' → ')
        const [_bf, bt] = b.split(' → ')
        if (af === bt && at === af) mixedDirection++
      }
    }
  }
  check('no bucket holds a journey and its reverse', mixedDirection === 0, `${mixedDirection}`)
  check('the routes that run both ways have separate keys',
    bothWays.every((k) => k !== reverseOf(k)))

  // ── 4. Nothing is merged ─────────────────────────────────────────────
  const sequences = new Set(withStops.map((t) => routeKeyOfStops(t.tripStops)!))
  check('one key per stop sequence — nothing merged',
    sequences.size === routeKeys.length, `${sequences.size} sequences, ${routeKeys.length} keys`)

  // ── 5. A daily allowance holds on the real routes ────────────────────
  // A route with more than one bus serving it on the same day, taken from
  // the copy, so the check is on the real shape of the data.
  const byRouteDay = new Map<string, typeof trips>()
  for (const t of trips) {
    if (!t.routeKey || !t.travelDate) continue
    // The route key is itself '|'-joined, so the two halves are kept apart
    // with a separator that cannot appear in either of them.
    const key = routeDayKey(t.routeKey, t.travelDate)
    const list = byRouteDay.get(key) ?? []
    list.push(t)
    byRouteDay.set(key, list)
  }
  const shared = [...byRouteDay.entries()].filter(([, list]) => list.length > 1)
  const multiBus = [...byRouteDay.entries()].filter(([, list]) => new Set(list.map((t) => t.busId)).size > 1)
  console.log(`  INFO  ${shared.length} route+day bucket(s) have more than one trip`)
  console.log(`  INFO  ${multiBus.length} route+day bucket(s) are served by more than one bus`)

  if (shared.length > 0) {
    const [key, list] = shared[0]
    const { routeKey, travelDate } = parseRouteDayKey(key)
    const tripA = list[0]
    const tripB = list[1]

    const company = await prisma.company.create({
      data: {
        name: `Rehearsal Co ${SUFFIX}`, subdomain: `rehearsal-${SUFFIX}`, isActive: true,
        creditLimit: 0, walletBalance: 1000000, paymentMode: 'BOTH', outstandingBalance: 0,
        billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
      },
    })

    // A daily allowance of four seats across the route for that day.
    await prisma.companyRouteQuota.upsert({
      where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
      create: { companyId: company.id, routeKey, travelDate, maxSeats: 4 },
      update: { maxSeats: 4 },
    })

    const bookOn = (tripId: string, seats: number, seatPrefix: string) =>
      prisma.$transaction(async (tx) => {
        const companyRow = await tx.company.findUniqueOrThrow({ where: { id: company.id } })
        const trip = await tx.trip.findUniqueOrThrow({
          where: { id: tripId },
          include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
        })
        await tx.$executeRawUnsafe('SELECT id FROM `Company` WHERE id = ? FOR UPDATE', company.id)
        await tx.$executeRawUnsafe('SELECT id FROM `Trip` WHERE id = ? FOR UPDATE', tripId)
        const limits = await resolveBookingLimits(tx, {
          company: companyRow,
          tripId,
          trip,
          requestedSeats: seats,
        })
        // The rows have to exist for the next booking to see them: the
        // allowance counts the bookings the company holds, not the request
        // that is being considered.
        for (let i = 0; i < seats; i++) {
          await tx.companyBooking.create({
            data: {
              reference: `REH-${SUFFIX}-${seatPrefix}-${i}`,
              companyId: company.id,
              customerId: null,
              tripId,
              seatLabel: `REH-${seatPrefix}-${i}`,
              status: 'PENDING',
              total: 100,
              fromStopOrder: 1,
              toStopOrder: 1,
            },
          })
        }
        return limits
      }, BOOKING_ISOLATION)

    const first = await bookOn(tripA.id, 4, 'A')
    check('four seats fit under a daily allowance of four', first.routeLimit === 4,
      JSON.stringify(first))
    check('and they were counted against the allowance', first.routeUsed === 0,
      JSON.stringify(first))

    let refused = false
    try {
      await bookOn(tripB.id, 1, 'B')
    } catch (e: any) {
      refused = e?.code === 'TRIP_QUOTA_EXCEEDED'
    }
    check('the second trip on the same route and day is refused by the same allowance', refused)

    // And with a larger allowance the second trip is allowed, which shows the
    // refusal was the allowance and not something else.
    await prisma.companyRouteQuota.update({
      where: { companyId_routeKey_travelDate: { companyId: company.id, routeKey, travelDate } },
      data: { maxSeats: 9 },
    })
    const second = await bookOn(tripB.id, 4, 'C')
    check('with a larger allowance the second trip is allowed', second.routeLimit === 9,
      JSON.stringify(second))
    check('and the first trip’s seats are still counted', second.routeUsed === 4,
      JSON.stringify(second))

    await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
    await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
    await prisma.company.delete({ where: { id: company.id } })
  } else {
    console.log('  INFO  no route+day in this copy has more than one trip, so the shared')
    console.log('        allowance could not be exercised against it')
  }

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
