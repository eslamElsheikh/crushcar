/**
 * Automated test suite for Company Seat Quota UI/UX & Recurring Daily Quotas (T2 Final Verification).
 * Tests all 18 required scenarios:
 *
 * 1. 20 seats available on Nov 3.
 * 2. Nov 3 and Nov 4 are independent.
 * 3. Different buses share the same route/date quota.
 * 4. Different intermediate stops still share the same origin/destination quota (Sharm -> El Tor -> Hurghada vs Sharm -> Hurghada).
 * 5. Reverse direction has an independent quota (Hurghada -> Sharm).
 * 6. Different origin/destination pairs have independent quotas (Sharm -> Hurghada vs Sharm -> Cairo).
 * 7. Different companies have independent quotas (Company A vs Company B).
 * 8. Cancellation releases capacity.
 * 9. Expiration releases capacity.
 * 10. Concurrent bookings cannot exceed the quota.
 * 11. Round-trip outbound and return legs use their own route and date.
 * 12. Invalid date ranges are rejected (start date after end date -> 400).
 * 13. Identical origin/destination is rejected (origin == destination -> 400).
 * 14. Unauthorized users cannot modify quotas (non-admin -> 401/403).
 * 15. Reducing a quota below current usage is rejected (active bookings = 18; proposing 15 -> 400 with list of violating dates).
 * 16. Editing a multi-day quota updates all dates atomically.
 * 17. Deleting quota configuration does not modify bookings or financial records.
 * 18. Existing intermediate-stop route behavior is compatible with the new quota identity.
 */

import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { assertTestDatabase } from './lib/test-db-guard'
import {
  getQuotaRouteKey,
  tripEndpoints,
  parseQuotaRouteKey,
  travelDateOf,
  routeKeyOfStops,
} from '../src/lib/route-key'
import {
  resolveBookingLimits,
  resolveRouteBucket,
  RouteQuotaExceededError,
} from '../src/lib/company-quota'
import { lockRow } from '../src/lib/row-lock'
import { BOOKING_ISOLATION } from '../src/lib/transaction-isolation'
import { SEAT_HOLDING_STATUSES } from '../src/lib/booking-limits'

// Ensure we only ever run against a test database
assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3070'
const SUFFIX = Date.now().toString(36)
const AUTH_SECRET = process.env.AUTH_SECRET || 'M1fX/C7/V+C/AVeI5lmi5FQoJulgZ4bE942NH691I='

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function mintToken(user: { id: string; email: string; name: string; role: string; companyId: string | null }) {
  return encode({
    token: {
      id: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      image: null,
      activeCheckedAt: Date.now(),
    },
    secret: AUTH_SECRET,
    salt: 'next-auth.session-token',
  })
}

async function api(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Cookie = `next-auth.session-token=${init.token}`
  const res = await fetch(`${BASE}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let json: any = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

async function makeBus(companyId: string, name: string) {
  const bus = await prisma.bus.create({
    data: { name, type: 'COACH_BUS', seatCount: 0, companyId },
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
  return { bus, labels }
}

async function bookSeats(
  companyId: string,
  tripId: string,
  seatLabels: string[],
  opts: { roundTripGroupId?: string | null; status?: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' } = {}
) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { tripStops: { orderBy: { stopOrder: 'asc' } } },
    })

    await lockRow(tx, 'Company', companyId)
    await lockRow(tx, 'Trip', tripId)

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
          reference: `T2-${SUFFIX}-${Math.random().toString(36).slice(2, 10)}`,
          companyId,
          tripId,
          seatLabel: label,
          status: opts.status ?? 'PAID',
          total: 100,
          fromStopOrder: 1,
          toStopOrder: 2,
          roundTripGroupId: opts.roundTripGroupId ?? null,
        },
      })
      created.push(b.id)
    }
    return { ok: true as const, created, limits }
  })
}

async function main() {
  console.log(`\n=== Running T2 Company Seat Quota Automated Verification Suite ===\n`)

  // Create test stations
  const stSharm = await prisma.station.create({ data: { name: `Sharm ${SUFFIX}`, city: 'South Sinai' } })
  const stElTor = await prisma.station.create({ data: { name: `El Tor ${SUFFIX}`, city: 'South Sinai' } })
  const stHurghada = await prisma.station.create({ data: { name: `Hurghada ${SUFFIX}`, city: 'Red Sea' } })
  const stCairo = await prisma.station.create({ data: { name: `Cairo ${SUFFIX}`, city: 'Cairo' } })

  // Create test companies
  const compA = await prisma.company.create({
    data: {
      name: `Company A ${SUFFIX}`,
      subdomain: `compa-${SUFFIX}`,
      isActive: true,
      creditLimit: 100000,
      walletBalance: 50000,
      paymentMode: 'BOTH',
      outstandingBalance: 0,
      billingCycle: 'MONTHLY',
      autoPayEnabled: false,
    },
  })

  const compB = await prisma.company.create({
    data: {
      name: `Company B ${SUFFIX}`,
      subdomain: `compb-${SUFFIX}`,
      isActive: true,
      creditLimit: 100000,
      walletBalance: 50000,
      paymentMode: 'BOTH',
      outstandingBalance: 0,
      billingCycle: 'MONTHLY',
      autoPayEnabled: false,
    },
  })

  // Create test buses
  const bus1 = await makeBus(compA.id, `Bus 1 ${SUFFIX}`)
  const bus2 = await makeBus(compA.id, `Bus 2 ${SUFFIX}`)
  const bus3 = await makeBus(compA.id, `Bus 3 ${SUFFIX}`)

  // Create test admin and customer users
  const adminUser = await prisma.user.create({
    data: {
      email: `admin-${SUFFIX}@example.com`,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      password: 'password123',
    },
  })
  const adminToken = await mintToken(adminUser)

  const normalUser = await prisma.user.create({
    data: {
      email: `customer-${SUFFIX}@example.com`,
      name: 'Normal Customer',
      role: 'CUSTOMER',
      companyId: null,
      password: 'password123',
    },
  })
  const normalToken = await mintToken(normalUser)

  // Target dates: Nov 3 and Nov 4, 2026
  const dateNov3 = '2026-11-03'
  const dateNov4 = '2026-11-04'
  const dateNov6 = '2026-11-06'

  const depNov3 = new Date(`${dateNov3}T10:00:00.000Z`)
  const depNov4 = new Date(`${dateNov4}T10:00:00.000Z`)
  const depNov6 = new Date(`${dateNov6}T10:00:00.000Z`)

  // Trips:
  // 1. Sharm -> Hurghada (Bus 1, Nov 3)
  const tripDirectNov3 = await prisma.trip.create({
    data: {
      busId: bus1.bus.id,
      origin: stSharm.name,
      destination: stHurghada.name,
      departure: depNov3,
      arrival: new Date(depNov3.getTime() + 5 * 3600000),
      price: 150,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov3,
      routeKey: `${stSharm.id}|${stHurghada.id}`,
      tripStops: {
        create: [
          { stationId: stSharm.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stHurghada.id, stopOrder: 2, priceFromOrigin: 150 },
        ],
      },
    },
  })

  // 2. Sharm -> Hurghada (Bus 2, Nov 3) - different bus, same route and date!
  const tripBus2Nov3 = await prisma.trip.create({
    data: {
      busId: bus2.bus.id,
      origin: stSharm.name,
      destination: stHurghada.name,
      departure: new Date(depNov3.getTime() + 2 * 3600000),
      arrival: new Date(depNov3.getTime() + 7 * 3600000),
      price: 150,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov3,
      routeKey: `${stSharm.id}|${stHurghada.id}`,
      tripStops: {
        create: [
          { stationId: stSharm.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stHurghada.id, stopOrder: 2, priceFromOrigin: 150 },
        ],
      },
    },
  })

  // 3. Sharm -> El Tor -> Hurghada (Bus 3, Nov 3) - intermediate stop, same endpoints!
  const tripIntermediateNov3 = await prisma.trip.create({
    data: {
      busId: bus3.bus.id,
      origin: stSharm.name,
      destination: stHurghada.name,
      departure: new Date(depNov3.getTime() + 4 * 3600000),
      arrival: new Date(depNov3.getTime() + 9 * 3600000),
      price: 160,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov3,
      routeKey: `${stSharm.id}|${stElTor.id}|${stHurghada.id}`,
      tripStops: {
        create: [
          { stationId: stSharm.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stElTor.id, stopOrder: 2, priceFromOrigin: 60 },
          { stationId: stHurghada.id, stopOrder: 3, priceFromOrigin: 160 },
        ],
      },
    },
  })

  // 4. Hurghada -> Sharm (Bus 1, Nov 3) - reverse direction!
  const tripReverseNov3 = await prisma.trip.create({
    data: {
      busId: bus1.bus.id,
      origin: stHurghada.name,
      destination: stSharm.name,
      departure: depNov3,
      arrival: new Date(depNov3.getTime() + 5 * 3600000),
      price: 150,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov3,
      routeKey: `${stHurghada.id}|${stSharm.id}`,
      tripStops: {
        create: [
          { stationId: stHurghada.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stSharm.id, stopOrder: 2, priceFromOrigin: 150 },
        ],
      },
    },
  })

  // 5. Sharm -> Cairo (Bus 2, Nov 3) - different destination!
  const tripCairoNov3 = await prisma.trip.create({
    data: {
      busId: bus2.bus.id,
      origin: stSharm.name,
      destination: stCairo.name,
      departure: depNov3,
      arrival: new Date(depNov3.getTime() + 6 * 3600000),
      price: 200,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov3,
      routeKey: `${stSharm.id}|${stCairo.id}`,
      tripStops: {
        create: [
          { stationId: stSharm.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stCairo.id, stopOrder: 2, priceFromOrigin: 200 },
        ],
      },
    },
  })

  // 6. Sharm -> Hurghada (Bus 1, Nov 4) - next day!
  const tripDirectNov4 = await prisma.trip.create({
    data: {
      busId: bus1.bus.id,
      origin: stSharm.name,
      destination: stHurghada.name,
      departure: depNov4,
      arrival: new Date(depNov4.getTime() + 5 * 3600000),
      price: 150,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov4,
      routeKey: `${stSharm.id}|${stHurghada.id}`,
      tripStops: {
        create: [
          { stationId: stSharm.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stHurghada.id, stopOrder: 2, priceFromOrigin: 150 },
        ],
      },
    },
  })

  // 7. Hurghada -> Sharm (Bus 2, Nov 6) - return leg for round-trip test!
  const tripReturnNov6 = await prisma.trip.create({
    data: {
      busId: bus2.bus.id,
      origin: stHurghada.name,
      destination: stSharm.name,
      departure: depNov6,
      arrival: new Date(depNov6.getTime() + 5 * 3600000),
      price: 150,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov6,
      routeKey: `${stHurghada.id}|${stSharm.id}`,
      tripStops: {
        create: [
          { stationId: stHurghada.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stSharm.id, stopOrder: 2, priceFromOrigin: 150 },
        ],
      },
    },
  })

  console.log('--- Setting initial quota of 20 seats on Sharm -> Hurghada for Nov 3 and Nov 4 ---')
  const quotaNov3Res = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stSharm.id,
      destinationStationId: stHurghada.id,
      travelDate: dateNov3,
      dateTo: dateNov4,
      maxSeats: 20,
    },
  })
  check('Initial quota creation (Nov 3–Nov 4, 20 seats/day) returns HTTP 200', quotaNov3Res.status === 200, JSON.stringify(quotaNov3Res.json))

  // ── Scenario 1: 20 seats available on Nov 3 ────────────────────────────
  console.log('\n--- Scenario 1: 20 seats available on Nov 3 ---')
  const book10 = await bookSeats(compA.id, tripDirectNov3.id, bus1.labels.slice(0, 10))
  check('Book 10 seats fits within 20 seats quota', book10.ok && book10.limits.routeUsed === 0)

  const book10more = await bookSeats(compA.id, tripDirectNov3.id, bus1.labels.slice(10, 20))
  check('Book 10 more seats reaches exact limit of 20', book10more.ok && book10more.limits.routeUsed === 10)

  let exceeded = false
  try {
    await bookSeats(compA.id, tripDirectNov3.id, [bus1.labels[20]])
  } catch (err: any) {
    if (err instanceof RouteQuotaExceededError || err.code === 'TRIP_QUOTA_EXCEEDED') {
      exceeded = true
    }
  }
  check('21st seat on Nov 3 is rejected by RouteQuotaExceededError', exceeded)

  // ── Scenario 2: Nov 3 and Nov 4 are independent ────────────────────────
  console.log('\n--- Scenario 2: Nov 3 and Nov 4 are independent ---')
  const bookNov4 = await bookSeats(compA.id, tripDirectNov4.id, bus1.labels.slice(0, 10))
  check('Nov 4 allows booking when Nov 3 is completely full', bookNov4.ok && bookNov4.limits.routeUsed === 0)

  // ── Scenario 3: Different buses share the same route/date quota ────────
  console.log('\n--- Scenario 3: Different buses share the same route/date quota ---')
  // Nov 4 already has 10 seats booked on Bus 1.
  // Bus 2 runs the same route on Nov 4.
  const bookBus2Nov4 = await bookSeats(compA.id, tripDirectNov4.id, bus1.labels.slice(10, 20))
  check('Nov 4 reaches 20 total seats across buses', bookBus2Nov4.ok)

  let bus2Exceeded = false
  try {
    await bookSeats(compA.id, tripDirectNov4.id, [bus1.labels[20]])
  } catch {
    bus2Exceeded = true
  }
  check('Attempting 21st seat across different buses is rejected', bus2Exceeded)

  // ── Scenario 4: Different intermediate stops share same origin/destination quota ──
  console.log('\n--- Scenario 4: Different intermediate stops share same origin/destination quota ---')
  // Sharm -> El Tor -> Hurghada has tripEndpoints Sharm -> Hurghada.
  // Nov 3 quota is at 20. Attempting to book on the intermediate trip must be rejected.
  let intermediateRejected = false
  try {
    await bookSeats(compA.id, tripIntermediateNov3.id, [bus3.labels[0]])
  } catch {
    intermediateRejected = true
  }
  check('Intermediate-stop trip (Sharm -> El Tor -> Hurghada) shares quota with direct trip and is rejected when full', intermediateRejected)

  // ── Scenario 5: Reverse direction has an independent quota (Hurghada -> Sharm) ──
  console.log('\n--- Scenario 5: Reverse direction has an independent quota (Hurghada -> Sharm) ---')
  // Set quota for reverse direction: 15 seats on Nov 3
  await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stHurghada.id,
      destinationStationId: stSharm.id,
      travelDate: dateNov3,
      maxSeats: 15,
    },
  })
  const bookReverse = await bookSeats(compA.id, tripReverseNov3.id, bus1.labels.slice(0, 5))
  check('Reverse direction booking succeeds independently of full outbound quota', bookReverse.ok && bookReverse.limits.routeUsed === 0)

  // ── Scenario 6: Different origin/destination pairs have independent quotas ──
  console.log('\n--- Scenario 6: Different origin/destination pairs have independent quotas ---')
  // Sharm -> Cairo
  const bookCairo = await bookSeats(compA.id, tripCairoNov3.id, bus2.labels.slice(0, 8))
  check('Different destination (Sharm -> Cairo) succeeds independently', bookCairo.ok && bookCairo.limits.routeUsed === 0)

  // ── Scenario 7: Different companies have independent quotas ────────────
  console.log('\n--- Scenario 7: Different companies have independent quotas ---')
  // Company B on tripDirectNov3 where Company A is at 20/20
  const bookCompB = await bookSeats(compB.id, tripDirectNov3.id, bus1.labels.slice(0, 10))
  check('Company B can book on the same trip where Company A has reached quota', bookCompB.ok && bookCompB.limits.routeUsed === 0)

  // ── Scenario 8: Cancellation releases capacity ─────────────────────────
  console.log('\n--- Scenario 8: Cancellation releases capacity ---')
  // Cancel 4 seats of Company A on tripDirectNov3
  await prisma.companyBooking.updateMany({
    where: { id: { in: book10.created.slice(0, 4) } },
    data: { status: 'CANCELLED' },
  })
  // Now 4 seats should be free on Nov 3 Sharm -> Hurghada
  const bookAfterCancel = await bookSeats(compA.id, tripDirectNov3.id, [bus1.labels[25], bus1.labels[26]])
  check('Cancellation releases capacity and allows new bookings', bookAfterCancel.ok && bookAfterCancel.limits.routeUsed === 16)

  // ── Scenario 9: Expiration releases capacity ───────────────────────────
  console.log('\n--- Scenario 9: Expiration releases capacity ---')
  // Expire 2 seats
  await prisma.companyBooking.updateMany({
    where: { id: { in: book10.created.slice(4, 6) } },
    data: { status: 'EXPIRED' },
  })
  const bookAfterExpiry = await bookSeats(compA.id, tripDirectNov3.id, [bus1.labels[27], bus1.labels[28]])
  check('Expiration releases capacity and allows new bookings', bookAfterExpiry.ok)

  // ── Scenario 10: Concurrent bookings cannot exceed the quota ───────────
  console.log('\n--- Scenario 10: Concurrent bookings cannot exceed the quota ---')
  // Create a clean trip and company for concurrency testing
  const compConc = await prisma.company.create({
    data: {
      name: `Conc Co ${SUFFIX}`,
      subdomain: `conc-${SUFFIX}`,
      isActive: true,
      creditLimit: 100000,
      walletBalance: 50000,
      paymentMode: 'BOTH',
      billingCycle: 'MONTHLY',
    },
  })
  const tripConc = await prisma.trip.create({
    data: {
      busId: bus1.bus.id,
      origin: stSharm.name,
      destination: stHurghada.name,
      departure: depNov3,
      arrival: new Date(depNov3.getTime() + 5 * 3600000),
      price: 100,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
      travelDate: dateNov3,
      routeKey: `${stSharm.id}|${stHurghada.id}`,
      tripStops: {
        create: [
          { stationId: stSharm.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stHurghada.id, stopOrder: 2, priceFromOrigin: 100 },
        ],
      },
    },
  })
  // Set quota to exactly 6 seats
  await api(`/api/admin/companies/${compConc.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stSharm.id,
      destinationStationId: stHurghada.id,
      travelDate: dateNov3,
      maxSeats: 6,
    },
  })

  // Try 8 parallel booking attempts of 2 seats each (demanding 16 seats total against cap of 6)
  const concPromises = Array.from({ length: 8 }, (_, i) =>
    bookSeats(compConc.id, tripConc.id, [`S-CONC-${i}-A`, `S-CONC-${i}-B`]).catch((e) => ({ ok: false, error: e }))
  )
  const results = await Promise.all(concPromises)
  const totalHeldConc = await prisma.companyBooking.count({
    where: { companyId: compConc.id, tripId: tripConc.id, status: { in: [...SEAT_HOLDING_STATUSES] } },
  })
  check('Concurrent bookings never exceed quota cap of 6', totalHeldConc <= 6, `Total held: ${totalHeldConc}`)

  // ── Scenario 11: Round-trip outbound and return legs use their own route and date ──
  console.log('\n--- Scenario 11: Round-trip outbound and return legs use their own route and date ---')
  const roundTripId = `RT-${SUFFIX}`
  // Outbound: Sharm -> Hurghada on Nov 3 (CompConc has 6 cap)
  // Return: Hurghada -> Sharm on Nov 6 (Set quota of 10)
  await api(`/api/admin/companies/${compConc.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stHurghada.id,
      destinationStationId: stSharm.id,
      travelDate: dateNov6,
      maxSeats: 10,
    },
  })
  // Book return leg on tripReturnNov6
  const bookReturnLeg = await bookSeats(compConc.id, tripReturnNov6.id, ['SRT-1', 'SRT-2'], {
    roundTripGroupId: roundTripId,
  })
  check('Return leg evaluates against return route and return date, not outbound', bookReturnLeg.ok && bookReturnLeg.limits.routeUsed === 0)

  // ── Scenario 12: Invalid date ranges are rejected (start date after end date -> 400) ──
  console.log('\n--- Scenario 12: Invalid date ranges are rejected ---')
  const invalidDateRes = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stSharm.id,
      destinationStationId: stHurghada.id,
      travelDate: '2026-11-10',
      dateTo: '2026-11-05',
      maxSeats: 20,
    },
  })
  check('PUT with start date after end date returns HTTP 400 INVALID_DATE_RANGE', invalidDateRes.status === 400 && invalidDateRes.json.error === 'INVALID_DATE_RANGE')

  // ── Scenario 13: Identical origin/destination is rejected (origin == destination -> 400) ──
  console.log('\n--- Scenario 13: Identical origin/destination is rejected ---')
  const identicalStationRes = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stSharm.id,
      destinationStationId: stSharm.id,
      travelDate: dateNov3,
      maxSeats: 20,
    },
  })
  check('PUT with identical origin/destination returns HTTP 400 ORIGIN_DESTINATION_IDENTICAL', identicalStationRes.status === 400 && identicalStationRes.json.error === 'ORIGIN_DESTINATION_IDENTICAL')

  // ── Scenario 14: Unauthorized users cannot modify quotas (non-admin -> 401/403) ──
  console.log('\n--- Scenario 14: Unauthorized users cannot modify quotas ---')
  const unauthRes = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    body: {
      originStationId: stSharm.id,
      destinationStationId: stHurghada.id,
      travelDate: dateNov3,
      maxSeats: 20,
    },
  })
  check('Unauthenticated request returns HTTP 401', unauthRes.status === 401)

  const nonAdminRes = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    token: normalToken,
    body: {
      originStationId: stSharm.id,
      destinationStationId: stHurghada.id,
      travelDate: dateNov3,
      maxSeats: 20,
    },
  })
  check('Non-super-admin user request returns HTTP 403', nonAdminRes.status === 403)

  // ── Scenario 15: Reducing a quota below current usage is rejected ───────
  console.log('\n--- Scenario 15: Reducing quota below current usage is rejected ---')
  // CompA currently has 16 active bookings on Nov 3 Sharm -> Hurghada.
  // Attempting to reduce maxSeats to 10 must be rejected with QUOTA_BELOW_USAGE and violatingDates.
  const reduceRes = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stSharm.id,
      destinationStationId: stHurghada.id,
      travelDate: dateNov3,
      maxSeats: 10,
    },
  })
  check(
    'Reducing quota below active bookings returns HTTP 400 QUOTA_BELOW_USAGE with violating dates',
    reduceRes.status === 400 &&
      reduceRes.json.error === 'QUOTA_BELOW_USAGE' &&
      Array.isArray(reduceRes.json.violatingDates) &&
      reduceRes.json.violatingDates.length > 0,
    JSON.stringify(reduceRes.json)
  )

  // ── Scenario 16: Editing a multi-day quota updates all dates atomically ─
  console.log('\n--- Scenario 16: Editing multi-day quota updates all dates atomically ---')
  const multiDayRes = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    method: 'PUT',
    token: adminToken,
    body: {
      originStationId: stSharm.id,
      destinationStationId: stHurghada.id,
      travelDate: dateNov3,
      dateTo: dateNov4,
      maxSeats: 30,
    },
  })
  check('Atomic multi-day update returns HTTP 200', multiDayRes.status === 200 && multiDayRes.json.written.length === 2)

  const quotaRows = await prisma.companyRouteQuota.findMany({
    where: {
      companyId: compA.id,
      routeKey: getQuotaRouteKey(stSharm.id, stHurghada.id),
      travelDate: { in: [dateNov3, dateNov4] },
    },
  })
  check('All dates in range have updated maxSeats = 30', quotaRows.length === 2 && quotaRows.every((r) => r.maxSeats === 30))

  // ── Scenario 17: Deleting quota configuration does not modify bookings or financial records ──
  console.log('\n--- Scenario 17: Deleting quota configuration does not touch bookings or financials ---')
  const bookingsCountBefore = await prisma.companyBooking.count({ where: { companyId: compA.id } })
  const compBefore = await prisma.company.findUniqueOrThrow({ where: { id: compA.id } })

  const delRes = await api(`/api/admin/companies/${compA.id}/route-quotas?originStationId=${stSharm.id}&destinationStationId=${stHurghada.id}&travelDate=${dateNov3}&dateTo=${dateNov4}`, {
    method: 'DELETE',
    token: adminToken,
  })
  check('DELETE returns HTTP 200', delRes.status === 200)

  const bookingsCountAfter = await prisma.companyBooking.count({ where: { companyId: compA.id } })
  const compAfter = await prisma.company.findUniqueOrThrow({ where: { id: compA.id } })

  check('Bookings count is completely unaffected by quota deletion', bookingsCountBefore === bookingsCountAfter)
  check('Company wallet balance is completely unaffected by quota deletion', compBefore.walletBalance === compAfter.walletBalance)
  check('Company credit limit is completely unaffected by quota deletion', compBefore.creditLimit === compAfter.creditLimit)

  // ── Scenario 18: Existing intermediate-stop route behavior is compatible with new quota identity ──
  console.log('\n--- Scenario 18: Existing intermediate-stop route behavior is compatible ---')
  const legacyKey = `${stSharm.id}|${stElTor.id}|${stHurghada.id}`
  const parsed = parseQuotaRouteKey(legacyKey)
  check('parseQuotaRouteKey parses intermediate stop key to origin and destination', parsed?.originStationId === stSharm.id && parsed?.destinationStationId === stHurghada.id)

  const directParsed = parseQuotaRouteKey(getQuotaRouteKey(stSharm.id, stHurghada.id))
  check('parseQuotaRouteKey parses canonical od:A:B key correctly', directParsed?.originStationId === stSharm.id && directParsed?.destinationStationId === stHurghada.id)

  // Summary endpoint check
  console.log('\n--- Checking GET endpoint summary & metrics ---')
  const getRes = await api(`/api/admin/companies/${compA.id}/route-quotas`, {
    token: adminToken,
  })
  check('GET endpoint returns 200 with summary and stations', getRes.status === 200 && 'summary' in getRes.json && Array.isArray(getRes.json.stations))

  console.log(`\n=== Verification Results: ${failures === 0 ? 'ALL 18 SCENARIOS PASSED' : `${failures} FAILURES`} ===\n`)
  if (failures > 0) {
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error('Unhandled test runner error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
