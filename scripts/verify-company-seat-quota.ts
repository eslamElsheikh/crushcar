/**
 * T2 — Company seat quota semantics verification.
 *
 * Requirements:
 * - round trip counts 1 seat of the quota (evaluated on the outbound date)
 * - one-way counts 1 seat
 * - two trips on the same outbound date share the quota
 * - different dates/routes do not share
 * - cancel releases quota
 * - concurrent bookings cannot exceed the quota
 */
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { assertTestDatabase } from './lib/test-db-guard'
import { routeKeyOfStops, travelDateOf } from '../src/lib/route-key'

assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3070'
const SUFFIX = Date.now().toString(36)
let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function api(path: string, init: { method: string; body?: unknown; token?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Cookie = `next-auth.session-token=${init.token}`
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(text) as Record<string, unknown> } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function mintToken(user: { id: string; email: string; name: string; role: string; companyId: string | null }) {
  const secret = process.env.AUTH_SECRET || 'M1fX/C7/V+C/AVeI5lmi5FQoJulgZ4bE942NH691I='
  return encode({
    token: {
      id: user.id, sub: user.id, email: user.email, name: user.name,
      role: user.role, companyId: user.companyId, image: null,
      activeCheckedAt: Date.now(),
    },
    secret,
    salt: 'next-auth.session-token',
  })
}

async function makeCompany(label: string, opts: { creditLimit: number; walletBalance: number; autoPay: boolean; seatQuota?: number | null }) {
  return prisma.company.create({
    data: {
      name: `${label} ${SUFFIX}`,
      subdomain: `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${SUFFIX}`,
      isActive: true,
      creditLimit: opts.creditLimit,
      walletBalance: opts.walletBalance,
      paymentMode: 'CREDIT',
      outstandingBalance: 0,
      billingCycle: 'MONTHLY',
      autoPayEnabled: opts.autoPay,
      seatQuota: opts.seatQuota ?? null,
    },
  })
}

async function makeTrip(label: string, origin: string, destination: string, departure: Date, stationIds: [string, string]) {
  const bus = await prisma.bus.create({
    data: { name: `${label} ${SUFFIX}`, type: 'COACH_BUS', seatCount: 0 },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 12, cols: 6, aisleAfter: 2 } })
  const labels: string[] = []
  for (let row = 1; row <= 12; row++) {
    for (let col = 1; col <= 6; col++) {
      const seatLabel = `S${row}-${col}`
      labels.push(seatLabel)
      await prisma.seat.create({ data: { layoutId: layout.id, label: seatLabel, row, col, type: 'NORMAL', price: 0 } })
    }
  }
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin, destination, departure,
      arrival: new Date(departure.getTime() + 6 * 3600000),
      price: 100, bookingMode: 'SEAT', status: 'SCHEDULED',
      tripStops: { create: [
        { stationId: stationIds[0], stopOrder: 1, priceFromOrigin: 0 },
        { stationId: stationIds[1], stopOrder: 2, priceFromOrigin: 100 },
      ] },
    },
  })
  const routeKey = routeKeyOfStops([
    { stationId: stationIds[0], stopOrder: 1 },
    { stationId: stationIds[1], stopOrder: 2 },
  ])!
  await prisma.trip.update({ where: { id: trip.id }, data: { routeKey, travelDate: travelDateOf(departure)! } })
  return { trip, labels }
}

function passenger(seatLabel: string) {
  return { seatLabel, passengerName: `T2 ${SUFFIX}`, passengerPhone: '01000000000' }
}

async function main() {
  console.log(`T2 company seat quota verification (${BASE})`)

  const s1 = await prisma.station.upsert({ where: { name_city: { name: `منصورة-q-${SUFFIX}`, city: 'x' } }, create: { name: `منصورة-q-${SUFFIX}`, city: 'x' }, update: {} })
  const s2 = await prisma.station.upsert({ where: { name_city: { name: `الغردقة-q-${SUFFIX}`, city: 'x' } }, create: { name: `الغردقة-q-${SUFFIX}`, city: 'x' }, update: {} })
  const s3 = await prisma.station.upsert({ where: { name_city: { name: `شرم-q-${SUFFIX}`, city: 'x' } }, create: { name: `شرم-q-${SUFFIX}`, city: 'x' }, update: {} })

  // Day 1
  const depDay1A = new Date(Date.now() + 4 * 86400000); depDay1A.setUTCHours(8, 0, 0, 0)
  const depDay1B = new Date(Date.now() + 4 * 86400000); depDay1B.setUTCHours(14, 0, 0, 0)
  // Day 2
  const depDay2 = new Date(Date.now() + 5 * 86400000); depDay2.setUTCHours(8, 0, 0, 0)
  // Return Day 5
  const retDay5 = new Date(Date.now() + 9 * 86400000); retDay5.setUTCHours(9, 0, 0, 0)

  // Trips:
  // Route 1 (Mansoura -> Hurghada) on Day 1: Bus A and Bus B
  const tripRoute1Day1A = await makeTrip('T2-R1-D1A', `منصورة-q-${SUFFIX}`, `الغردقة-q-${SUFFIX}`, depDay1A, [s1.id, s2.id])
  const tripRoute1Day1B = await makeTrip('T2-R1-D1B', `منصورة-q-${SUFFIX}`, `الغردقة-q-${SUFFIX}`, depDay1B, [s1.id, s2.id])
  // Route 1 return (Hurghada -> Mansoura) on Day 5
  const tripReturnDay5 = await makeTrip('T2-R1-Ret', `الغردقة-q-${SUFFIX}`, `منصورة-q-${SUFFIX}`, retDay5, [s2.id, s1.id])
  // Route 1 on Day 2
  const tripRoute1Day2 = await makeTrip('T2-R1-D2', `منصورة-q-${SUFFIX}`, `الغردقة-q-${SUFFIX}`, depDay2, [s1.id, s2.id])
  // Route 2 (Mansoura -> Sharm) on Day 1
  const tripRoute2Day1 = await makeTrip('T2-R2-D1', `منصورة-q-${SUFFIX}`, `شرم-q-${SUFFIX}`, depDay1A, [s1.id, s3.id])

  // Company with quota of 4 seats per route/day
  const company = await makeCompany('T2Comp', { creditLimit: 100000, walletBalance: 0, autoPay: true, seatQuota: 4 })
  const user = await prisma.user.create({
    data: { email: `t2-user-${SUFFIX}@example.com`, password: 'x', name: 'T2 User', role: 'COMPANY_ADMIN', companyId: company.id },
  })
  const token = await mintToken(user)

  // ── 1. One-way booking consumes quota ────────────────────────────────
  console.log('\n1. one-way booking consumes quota')
  const book1 = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute1Day1A.trip.id,
      passengers: [passenger('S1-1'), passenger('S1-2')],
      fromStationId: s1.id, toStationId: s2.id,
    },
  })
  check('one-way booking of 2 seats accepted', book1.status === 200, `status ${book1.status}`)

  // ── 2. Round-trip booking: outbound consumes 1, return does not ───────
  console.log('\n2. round-trip booking: outbound consumes 1, return does not')
  const group1 = `t2-group-${SUFFIX}-1`
  const outLeg = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute1Day1A.trip.id,
      passengers: [passenger('S1-3')],
      fromStationId: s1.id, toStationId: s2.id,
      roundTripGroupId: group1,
    },
  })
  check('round-trip outbound leg accepted (3 seats used total so far)', outLeg.status === 200, `status ${outLeg.status}`)

  const retLeg = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripReturnDay5.trip.id,
      passengers: [passenger('S1-1')],
      fromStationId: s2.id, toStationId: s1.id,
      roundTripGroupId: group1,
    },
  })
  check('round-trip return leg accepted and did not consume quota', retLeg.status === 200, `status ${retLeg.status}`)

  // ── 3. Same route trips on the same outbound date share quota ─────────
  console.log('\n3. same route trips on the same outbound date share quota')
  // We have 3 seats used on Route 1 Day 1 (out of quota 4). Only 1 seat left.
  // Trying to book 2 seats on Bus B of the same route and day should be rejected!
  const overBooking = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute1Day1B.trip.id,
      passengers: [passenger('S2-1'), passenger('S2-2')],
      fromStationId: s1.id, toStationId: s2.id,
    },
  })
  check('booking 2 seats when only 1 is left is rejected with 400', overBooking.status === 400, `status ${overBooking.status} ${JSON.stringify(overBooking.json)}`)
  check(
    'rejection error is SEAT_QUOTA_EXCEEDED with Arabic message showing used and remaining',
    overBooking.json.error === 'SEAT_QUOTA_EXCEEDED' && /المتبقي/.test(String(overBooking.json.message || '')),
    JSON.stringify(overBooking.json),
  )

  // Booking exactly 1 seat on Bus B should succeed and fill the quota (4 / 4)
  const fitBooking = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute1Day1B.trip.id,
      passengers: [passenger('S2-1')],
      fromStationId: s1.id, toStationId: s2.id,
    },
  })
  check('booking 1 seat on same-day bus B fits quota and is accepted', fitBooking.status === 200, `status ${fitBooking.status}`)

  // Now quota on Route 1 Day 1 is full (4 / 4). Any additional seat must be rejected.
  const fullRejection = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute1Day1A.trip.id,
      passengers: [passenger('S3-1')],
      fromStationId: s1.id, toStationId: s2.id,
    },
  })
  check('further booking on route 1 day 1 rejected when quota is full', fullRejection.status === 400 && fullRejection.json.error === 'SEAT_QUOTA_EXCEEDED')

  // ── 4. Different dates and routes do not consume each other's quota ───
  console.log('\n4. different dates and routes do not consume each other\'s quota')
  // Route 1 on Day 2: quota is 4, used is 0
  const day2Booking = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute1Day2.trip.id,
      passengers: [passenger('S1-1'), passenger('S1-2')],
      fromStationId: s1.id, toStationId: s2.id,
    },
  })
  check('route 1 on different travel date has fresh quota and accepts booking', day2Booking.status === 200, `status ${day2Booking.status}`)

  // Route 2 on Day 1 (different route): quota is 4, used is 0
  const route2Booking = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute2Day1.trip.id,
      passengers: [passenger('S1-1'), passenger('S1-2')],
      fromStationId: s1.id, toStationId: s3.id,
    },
  })
  check('different route on the same date has fresh quota and accepts booking', route2Booking.status === 200, `status ${route2Booking.status}`)

  // ── 5. Cancellation releases quota ───────────────────────────────────
  console.log('\n5. cancellation releases quota')
  const toCancel = await prisma.companyBooking.findFirstOrThrow({
    where: { tripId: tripRoute1Day1B.trip.id, seatLabel: 'S2-1', status: 'PAID' },
  })
  const cancelRes = await api(`/api/company/bookings/${toCancel.id}`, {
    method: 'PATCH', token,
    body: { status: 'CANCELLED', reason: 'T2 release test' },
  })
  check('cancellation accepted', cancelRes.status === 200, `status ${cancelRes.status}`)

  // After cancelling 1 seat, 1 seat should be available again on Route 1 Day 1
  const rebook = await api('/api/company/bookings', {
    method: 'POST', token,
    body: {
      tripId: tripRoute1Day1A.trip.id,
      passengers: [passenger('S4-1')],
      fromStationId: s1.id, toStationId: s2.id,
    },
  })
  check('released quota seat can now be booked successfully', rebook.status === 200, `status ${rebook.status}`)

  // ── 6. Concurrent race against quota limit ───────────────────────────
  console.log('\n6. concurrent race against quota limit')
  // New company with strict quota of 2
  const raceCompany = await makeCompany('T2Race', { creditLimit: 100000, walletBalance: 0, autoPay: true, seatQuota: 2 })
  const raceUser = await prisma.user.create({
    data: { email: `t2-race-${SUFFIX}@example.com`, password: 'x', name: 'T2 Race User', role: 'COMPANY_ADMIN', companyId: raceCompany.id },
  })
  const raceToken = await mintToken(raceUser)

  // Two concurrent requests each trying to book 2 seats on tripRoute1Day2 (which has 2 quota limit)
  const [resA, resB] = await Promise.all([
    api('/api/company/bookings', {
      method: 'POST', token: raceToken,
      body: { tripId: tripRoute1Day2.trip.id, passengers: [passenger('S5-1'), passenger('S5-2')], fromStationId: s1.id, toStationId: s2.id },
    }),
    api('/api/company/bookings', {
      method: 'POST', token: raceToken,
      body: { tripId: tripRoute1Day2.trip.id, passengers: [passenger('S5-3'), passenger('S5-4')], fromStationId: s1.id, toStationId: s2.id },
    }),
  ])

  const statuses = [resA.status, resB.status].sort()
  check('exactly one racer succeeds with 200 and the other is rejected with 400', statuses[0] === 200 && statuses[1] === 400, `${statuses.join('/')}`)

  const activeSeats = await prisma.companyBooking.count({
    where: { companyId: raceCompany.id, status: { in: ['PAID', 'PENDING', 'BOARDED'] } },
  })
  check('total seats held by company never exceeds quota limit of 2', activeSeats === 2, `active: ${activeSeats}`)

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
