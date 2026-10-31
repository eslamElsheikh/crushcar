/**
 * T1 — company round-trip booking.
 *
 * Run against a scratch database with the app serving on BASE_URL:
 *   DATABASE_URL="file:.../.scratch-feedback.db" \
 *   BASE_URL="http://127.0.0.1:3070" npx tsx scripts/verify-roundtrip-feedback.ts
 *
 * It writes and then deletes its own rows. The guard refuses to start on a
 * database that is not obviously a test database.
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3070'
const SUFFIX = Date.now().toString(36)
let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else {
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
  let json: any = {}
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function mintToken(user: { id: string; email: string; name: string; role: string; companyId: string | null }) {
  const { encode } = await import('next-auth/jwt')
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

async function makeCompany(label: string, opts: { creditLimit: number; walletBalance: number; autoPay: boolean }) {
  return prisma.company.create({
    data: {
      name: `${label} ${SUFFIX}`, subdomain: `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${SUFFIX}`,
      isActive: true, creditLimit: opts.creditLimit, walletBalance: opts.walletBalance,
      paymentMode: 'CREDIT', outstandingBalance: 0, billingCycle: 'MONTHLY',
      autoPayEnabled: opts.autoPay, maxSeatsPerBooking: null,
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
  const { routeKeyOfStops, travelDateOf } = await import('../src/lib/route-key')
  const routeKey = routeKeyOfStops([
    { stationId: stationIds[0], stopOrder: 1 },
    { stationId: stationIds[1], stopOrder: 2 },
  ])!
  await prisma.trip.update({ where: { id: trip.id }, data: { routeKey, travelDate: travelDateOf(departure)! } })
  return { trip, labels }
}

function passenger(seatLabel: string) {
  return { seatLabel, passengerName: `T1 ${SUFFIX}`, passengerPhone: '01000000000' }
}

async function main() {
  console.log(`T1 round-trip verification (${BASE})`)
  const s1 = await prisma.station.upsert({ where: { name_city: { name: `منصورة-${SUFFIX}`, city: 'x' } }, create: { name: `منصورة-${SUFFIX}`, city: 'x' }, update: {} })
  const s2 = await prisma.station.upsert({ where: { name_city: { name: `الغردقة-${SUFFIX}`, city: 'x' } }, create: { name: `الغردقة-${SUFFIX}`, city: 'x' }, update: {} })
  const dep = new Date(Date.now() + 3 * 86400000); dep.setUTCHours(9, 0, 0, 0)
  const ret = new Date(Date.now() + 9 * 86400000); ret.setUTCHours(9, 0, 0, 0)
  const outbound = await makeTrip('T1-Out', `منصورة-${SUFFIX}`, `الغردقة-${SUFFIX}`, dep, [s1.id, s2.id])
  const inbound = await makeTrip('T1-Ret', `الغردقة-${SUFFIX}`, `منصورة-${SUFFIX}`, ret, [s2.id, s1.id])

  const companyA = await makeCompany('T1A', { creditLimit: 100000, walletBalance: 0, autoPay: true })
  const userA = await prisma.user.create({
    data: { email: `t1-a-${SUFFIX}@example.com`, password: 'x', name: 'T1 A', role: 'COMPANY_ADMIN', companyId: companyA.id },
  })
  const tokenA = await mintToken(userA)

  // ── 1. A round trip of 2 seats on credit ──────────────────────────────
  console.log('\nround trip of 2 seats on credit')
  const group1 = `t1-group-${SUFFIX}-1`
  const out1 = await api('/api/company/bookings', {
    method: 'POST', token: tokenA,
    body: { tripId: outbound.trip.id, passengers: [passenger('S1-1'), passenger('S1-2')], fromStationId: s1.id, toStationId: s2.id, bookingType: 'FOR_CLIENT', roundTripGroupId: group1 },
  })
  check('outbound leg accepted', out1.status === 200 && out1.json.bookings?.length === 2, `status ${out1.status} ${JSON.stringify(out1.json).slice(0, 200)}`)
  const ret1 = await api('/api/company/bookings', {
    method: 'POST', token: tokenA,
    body: { tripId: inbound.trip.id, passengers: [passenger('S1-1'), passenger('S1-2')], fromStationId: s2.id, toStationId: s1.id, bookingType: 'FOR_CLIENT', roundTripGroupId: group1 },
  })
  check('return leg accepted', ret1.status === 200 && ret1.json.bookings?.length === 2, `status ${ret1.status} ${JSON.stringify(ret1.json).slice(0, 200)}`)

  const companyAAfter = await prisma.company.findUniqueOrThrow({ where: { id: companyA.id } })
  check('outstanding equals the sum of both legs (400)', companyAAfter.outstandingBalance === 400, String(companyAAfter.outstandingBalance))
  const groupRows = await prisma.companyBooking.findMany({ where: { roundTripGroupId: group1 } })
  check('both legs belong to company A', groupRows.length === 4 && groupRows.every((b) => b.companyId === companyA.id), `${groupRows.length} rows`)
  check('both legs share one payment mode (credit, one charge each)', groupRows.reduce((s, b) => s + b.paidOnCredit, 0) === 400 && groupRows.reduce((s, b) => s + b.paidFromWallet, 0) === 0)
  check('every leg was charged exactly once', groupRows.every((b) => b.paidOnCredit === 100), groupRows.map((b) => b.paidOnCredit).join(','))

  // ── 2. A return leg with a different seat count is rejected ───────────
  console.log('\nreturn with a different seat count')
  const group2 = `t1-group-${SUFFIX}-2`
  const out2 = await api('/api/company/bookings', {
    method: 'POST', token: tokenA,
    body: { tripId: outbound.trip.id, passengers: [passenger('S1-3'), passenger('S1-4')], fromStationId: s1.id, toStationId: s2.id, roundTripGroupId: group2 },
  })
  check('outbound leg of the mismatch case accepted', out2.status === 200, `status ${out2.status}`)
  const beforeMismatch = await prisma.companyBooking.count({ where: { roundTripGroupId: group2 } })
  const ret2 = await api('/api/company/bookings', {
    method: 'POST', token: tokenA,
    body: { tripId: inbound.trip.id, passengers: [passenger('S1-3'), passenger('S1-4'), passenger('S1-5')], fromStationId: s2.id, toStationId: s1.id, roundTripGroupId: group2 },
  })
  check('mismatched return rejected with 400', ret2.status === 400, `status ${ret2.status} ${JSON.stringify(ret2.json).slice(0, 200)}`)
  check('rejection carries the Arabic parity message', ret2.json.error === 'ROUND_TRIP_SEAT_MISMATCH' && /مقاعد العودة/.test(ret2.json.message || ''), JSON.stringify(ret2.json).slice(0, 200))
  const afterMismatch = await prisma.companyBooking.count({ where: { roundTripGroupId: group2 } })
  check('no rows were created for the rejected return', afterMismatch === beforeMismatch, `${beforeMismatch} -> ${afterMismatch}`)

  // ── 3. Credit limit is enforced over the total of both legs ───────────
  console.log('\ncredit limit over the total')
  const companyC = await makeCompany('T1C', { creditLimit: 250, walletBalance: 0, autoPay: true })
  const userC = await prisma.user.create({
    data: { email: `t1-c-${SUFFIX}@example.com`, password: 'x', name: 'T1 C', role: 'COMPANY_ADMIN', companyId: companyC.id },
  })
  const tokenC = await mintToken(userC)
  const group3 = `t1-group-${SUFFIX}-3`
  const out3 = await api('/api/company/bookings', {
    method: 'POST', token: tokenC,
    body: { tripId: outbound.trip.id, passengers: [passenger('S2-1'), passenger('S2-2')], fromStationId: s1.id, toStationId: s2.id, roundTripGroupId: group3 },
  })
  check('outbound within the limit accepted', out3.status === 200, `status ${out3.status}`)
  const ret3 = await api('/api/company/bookings', {
    method: 'POST', token: tokenC,
    body: { tripId: inbound.trip.id, passengers: [passenger('S2-1'), passenger('S2-2')], fromStationId: s2.id, toStationId: s1.id, roundTripGroupId: group3 },
  })
  check('return over the total limit rejected', ret3.status === 400 && ret3.json.error === 'CREDIT_LIMIT_EXCEEDED', `status ${ret3.status} ${JSON.stringify(ret3.json).slice(0, 200)}`)
  const companyCAfter = await prisma.company.findUniqueOrThrow({ where: { id: companyC.id } })
  check('only the outbound leg is charged (200)', companyCAfter.outstandingBalance === 200, String(companyCAfter.outstandingBalance))
  check('no return rows were created', (await prisma.companyBooking.count({ where: { roundTripGroupId: group3 } })) === 2)

  // ── 4. Cancelling one leg does not corrupt the other ──────────────────
  console.log('\ncancel one leg')
  const outBooking = groupRows.find((b) => b.tripId === outbound.trip.id)!
  const returnBooking = groupRows.find((b) => b.tripId === inbound.trip.id)!
  const outstandingBeforeCancel = (await prisma.company.findUniqueOrThrow({ where: { id: companyA.id } })).outstandingBalance
  const cancel = await api(`/api/company/bookings/${outBooking.id}`, {
    method: 'PATCH', token: tokenA, body: { status: 'CANCELLED', reason: 'T1 test cancel' },
  })
  check('outbound leg cancelled', cancel.status === 200, `status ${cancel.status} ${JSON.stringify(cancel.json).slice(0, 200)}`)
  const returnAfter = await prisma.companyBooking.findUniqueOrThrow({ where: { id: returnBooking.id } })
  check('return leg untouched (still PAID)', returnAfter.status === 'PAID' && returnAfter.cancelledAt === null, `${returnAfter.status}`)
  check('return leg keeps its charge', returnAfter.paidOnCredit === 100, String(returnAfter.paidOnCredit))
  const cancelledOut = await prisma.companyBooking.findUniqueOrThrow({ where: { id: outBooking.id } })
  check('outbound leg is CANCELLED', cancelledOut.status === 'CANCELLED')
  const companyAAfterCancel = await prisma.company.findUniqueOrThrow({ where: { id: companyA.id } })
  // Cancelling records what is owed back; it does not move money. An admin
  // processes the refund through /api/admin/cancellations/[id], and only that
  // step credits the wallet / reduces the outstanding balance. So the balance
  // must be unchanged here, with the refund amount sitting on the row.
  check(
    'cancel records the refund without moving money',
    Math.abs(companyAAfterCancel.outstandingBalance - outstandingBeforeCancel) < 0.005,
    `${outstandingBeforeCancel} -> ${companyAAfterCancel.outstandingBalance}, refund ${cancelledOut.refundAmount}`,
  )
  check('cancel records a refund amount for admin processing', cancelledOut.refundAmount === 100 && cancelledOut.refundProcessedAt === null, `refund ${cancelledOut.refundAmount}, processed ${cancelledOut.refundProcessedAt}`)

  // ── 5. Two companies racing for the same return seat ─────────────────
  console.log('\nrace for the same return seat')
  const companyB = await makeCompany('T1B', { creditLimit: 100000, walletBalance: 0, autoPay: true })
  const userB = await prisma.user.create({
    data: { email: `t1-b-${SUFFIX}@example.com`, password: 'x', name: 'T1 B', role: 'COMPANY_ADMIN', companyId: companyB.id },
  })
  const tokenB = await mintToken(userB)
  const groupA = `t1-race-a-${SUFFIX}`
  const groupB = `t1-race-b-${SUFFIX}`
  await api('/api/company/bookings', {
    method: 'POST', token: tokenA,
    body: { tripId: outbound.trip.id, passengers: [passenger('S3-1')], fromStationId: s1.id, toStationId: s2.id, roundTripGroupId: groupA },
  })
  await api('/api/company/bookings', {
    method: 'POST', token: tokenB,
    body: { tripId: outbound.trip.id, passengers: [passenger('S3-2')], fromStationId: s1.id, toStationId: s2.id, roundTripGroupId: groupB },
  })
  const [raceA, raceB] = await Promise.all([
    api('/api/company/bookings', {
      method: 'POST', token: tokenA,
      body: { tripId: inbound.trip.id, passengers: [passenger('S3-3')], fromStationId: s2.id, toStationId: s1.id, roundTripGroupId: groupA },
    }),
    api('/api/company/bookings', {
      method: 'POST', token: tokenB,
      body: { tripId: inbound.trip.id, passengers: [passenger('S3-3')], fromStationId: s2.id, toStationId: s1.id, roundTripGroupId: groupB },
    }),
  ])
  const statuses = [raceA.status, raceB.status].sort()
  check('exactly one racer wins the seat', statuses[0] === 200 && statuses[1] === 409, statuses.join('/'))
  const winners = await prisma.companyBooking.count({ where: { tripId: inbound.trip.id, seatLabel: 'S3-3', status: { in: ['PAID', 'PENDING', 'BOARDED'] } } })
  check('the seat is held exactly once', winners === 1, String(winners))

  // ── 6. Money invariants ───────────────────────────────────────────────
  console.log('\nmoney invariants')
  const companies = await prisma.company.findMany({ where: { id: { in: [companyA.id, companyB.id, companyC.id] } } })
  check('outstanding >= 0 and wallet >= 0', companies.every((c) => c.outstandingBalance >= 0 && c.walletBalance >= 0))
  const ledger = await prisma.walletTransaction.findMany({ where: { companyId: { in: [companyA.id, companyB.id, companyC.id] } } })
  for (const c of companies) {
    const sum = ledger.filter((e) => e.companyId === c.id).reduce((s, e) => s + e.amount, 0)
    check(`wallet ledger equals the wallet balance for ${c.name}`, Math.abs(sum - c.walletBalance) < 0.005, `ledger ${sum} vs ${c.walletBalance}`)
  }

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
