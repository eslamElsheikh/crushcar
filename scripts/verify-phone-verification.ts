/**
 * T4 - Boarding verification by phone test suite.
 *
 * Requirements:
 * - Staff only: SUPER_ADMIN sees all; COMPANY_ADMIN sees only own company
 * - Anonymous / CUSTOMER denied (401 / 403)
 * - Company A cannot see Company B
 * - Egyptian phone normalization variants match (+20, 0020, Arabic-Indic numerals, spaces)
 * - Zero payment fields returned (minimal fields + masked phone)
 * - Audited per lookup
 * - Rate limiting
 * - Upcoming vs older grouping
 */
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { assertTestDatabase } from './lib/test-db-guard'
import { travelDateOf } from '../src/lib/route-key'

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
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
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

async function makeCompany(label: string) {
  return prisma.company.create({
    data: {
      name: `${label} ${SUFFIX}`,
      subdomain: `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${SUFFIX}`,
      isActive: true,
      creditLimit: 1000,
      walletBalance: 0,
      billingCycle: 'MONTHLY',
      paymentMode: 'PREPAID',
    },
  })
}

async function makeTrip(label: string, origin: string, destination: string, departure: Date, stationIds: [string, string]) {
  const bus = await prisma.bus.create({
    data: { name: `Bus-${label}-${SUFFIX}`, type: 'COACH_BUS', seatCount: 20 },
  })
  const layout = await prisma.busLayout.create({
    data: { busId: bus.id, rows: 5, cols: 4 },
  })
  for (let i = 1; i <= 8; i++) {
    await prisma.seat.create({
      data: { layoutId: layout.id, label: `S-${i}`, row: Math.floor((i - 1) / 4) + 1, col: ((i - 1) % 4) + 1, type: 'NORMAL', price: 0 },
    })
  }
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin, destination, departure,
      arrival: new Date(departure.getTime() + 4 * 3600000),
      price: 150, bookingMode: 'SEAT', status: 'SCHEDULED',
      tripStops: { create: [
        { stationId: stationIds[0], stopOrder: 1, priceFromOrigin: 0 },
        { stationId: stationIds[1], stopOrder: 2, priceFromOrigin: 150 },
      ] },
    },
  })
  await prisma.trip.update({ where: { id: trip.id }, data: { travelDate: travelDateOf(departure)! } })
  return trip
}

async function main() {
  console.log(`T4 boarding verification by phone test suite (${BASE})`)

  // Setup entities
  const s1 = await prisma.station.upsert({ where: { name_city: { name: `محطة-1-${SUFFIX}`, city: 'c1' } }, create: { name: `محطة-1-${SUFFIX}`, city: 'c1' }, update: {} })
  const s2 = await prisma.station.upsert({ where: { name_city: { name: `محطة-2-${SUFFIX}`, city: 'c2' } }, create: { name: `محطة-2-${SUFFIX}`, city: 'c2' }, update: {} })

  const futureDep = new Date(Date.now() + 2 * 86400000)
  const pastDep = new Date(Date.now() - 2 * 86400000)

  const futureTrip = await makeTrip('Fut', `محطة-1-${SUFFIX}`, `محطة-2-${SUFFIX}`, futureDep, [s1.id, s2.id])
  const pastTrip = await makeTrip('Past', `محطة-1-${SUFFIX}`, `محطة-2-${SUFFIX}`, pastDep, [s1.id, s2.id])

  const companyA = await makeCompany('CoA')
  const companyB = await makeCompany('CoB')

  // Users
  const adminUser = await prisma.user.create({
    data: { email: `admin-v4-${SUFFIX}@safro.test`, name: 'Admin', role: 'SUPER_ADMIN', password: 'x', isActive: true },
  })
  const adminToken = await mintToken(adminUser)

  const userCoA = await prisma.user.create({
    data: { email: `coa-v4-${SUFFIX}@safro.test`, name: 'CoA Manager', role: 'COMPANY_ADMIN', companyId: companyA.id, password: 'x', isActive: true },
  })
  const tokenCoA = await mintToken(userCoA)

  const userCoB = await prisma.user.create({
    data: { email: `cob-v4-${SUFFIX}@safro.test`, name: 'CoB Manager', role: 'COMPANY_ADMIN', companyId: companyB.id, password: 'x', isActive: true },
  })
  const tokenCoB = await mintToken(userCoB)

  const customerUser = await prisma.user.create({
    data: { email: `cust-v4-${SUFFIX}@safro.test`, name: 'Cust', role: 'CUSTOMER', password: 'x', isActive: true },
  })
  const customerToken = await mintToken(customerUser)

  // Seed bookings
  // 1. Company A booking with phone 01011112222 (future)
  const bCoA = await prisma.companyBooking.create({
    data: {
      reference: `V4-COA-${SUFFIX}`,
      companyId: companyA.id,
      tripId: futureTrip.id,
      seatLabel: 'S-1',
      passengerName: 'Passenger CoA',
      passengerPhone: '01011112222',
      status: 'PAID',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  // 2. Company B booking with phone 01033334444 (future)
  await prisma.companyBooking.create({
    data: {
      reference: `V4-COB-${SUFFIX}`,
      companyId: companyB.id,
      tripId: futureTrip.id,
      seatLabel: 'S-2',
      passengerName: 'Passenger CoB',
      passengerPhone: '01033334444',
      status: 'PAID',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  // 3. Customer booking with dynamic phone (future)
  const testPhone = '010' + String(Date.now()).slice(-8)
  await prisma.booking.create({
    data: {
      reference: `V4-CUST-FUT-${SUFFIX}`,
      tripId: futureTrip.id,
      userId: customerUser.id,
      seatLabel: 'S-3',
      passengerName: 'Customer Future',
      passengerPhone: testPhone,
      status: 'PAID',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  // 4. Customer booking with same dynamic phone (past)
  await prisma.booking.create({
    data: {
      reference: `V4-CUST-PAST-${SUFFIX}`,
      tripId: pastTrip.id,
      userId: customerUser.id,
      seatLabel: 'S-4',
      passengerName: 'Customer Past',
      passengerPhone: testPhone,
      status: 'PAID',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Role denial tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Role denial tests')
  const anon = await api('/api/admin/verify/lookup?phone=01011112222', { method: 'GET' })
  check('anonymous request rejected with 401', anon.status === 401, `status: ${anon.status}`)

  const cust = await api('/api/admin/verify/lookup?phone=01011112222', { method: 'GET', token: customerToken })
  check('customer request rejected with 403', cust.status === 403, `status: ${cust.status}`)

  const staff = await api('/api/admin/verify/lookup?phone=01011112222', { method: 'GET', token: adminToken })
  check('super admin request allowed with 200', staff.status === 200, `status: ${staff.status}`)

  const coStaff = await api('/api/admin/verify/lookup?phone=01011112222', { method: 'GET', token: tokenCoA })
  check('company admin request allowed with 200', coStaff.status === 200, `status: ${coStaff.status}`)

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Tenant isolation: Company A vs Company B
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2. Tenant isolation (Company A cannot see Company B)')
  // Company B searches for Company A's passenger phone 01011112222
  const coBsearchCoA = await api('/api/admin/verify/lookup?phone=01011112222', { method: 'GET', token: tokenCoB })
  const coBdata = coBsearchCoA.json as any
  check('company B cannot see Company A booking (returns 0)', coBdata.total === 0 && (coBdata.upcoming || []).length === 0, `total: ${coBdata.total}`)

  // Company A searches for its own passenger phone 01011112222
  const coAsearchCoA = await api('/api/admin/verify/lookup?phone=01011112222', { method: 'GET', token: tokenCoA })
  const coAdata = coAsearchCoA.json as any
  check('company A finds its own booking', coAdata.total === 1 && coAdata.upcoming?.[0]?.reference === bCoA.reference, `total: ${coAdata.total}`)

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Normalization variants match
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3. Normalization variants match')
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  const arabicIndic = testPhone.split('').map((c) => arabicDigits[Number(c)]).join('')

  const matchArabic = await api(`/api/admin/verify/lookup?phone=${encodeURIComponent(arabicIndic)}`, { method: 'GET', token: adminToken })
  const arabicData = matchArabic.json as any
  check('Arabic-Indic digits match stored booking', arabicData.total === 2, `total: ${arabicData.total}`)

  // International prefix: +20...
  const matchIntl = await api(`/api/admin/verify/lookup?phone=${encodeURIComponent('+20' + testPhone.slice(1))}`, { method: 'GET', token: adminToken })
  check('+20 international format matches', (matchIntl.json as any).total === 2)

  // 0020 prefix
  const match0020 = await api(`/api/admin/verify/lookup?phone=${encodeURIComponent('0020' + testPhone.slice(1))}`, { method: 'GET', token: adminToken })
  check('0020 international format matches', (match0020.json as any).total === 2)

  // Spaces and dashes: e.g. "010-1234 5678"
  const formattedDashes = `${testPhone.slice(0, 3)}-${testPhone.slice(3, 7)} ${testPhone.slice(7)}`
  const matchDashes = await api(`/api/admin/verify/lookup?phone=${encodeURIComponent(formattedDashes)}`, { method: 'GET', token: adminToken })
  check('dashes and spaces format matches', (matchDashes.json as any).total === 2)

  // ───────────────────────────────────────────────────────────────────────────
  console.log('4. Minimal fields & NO payment data')
  const lookupSample = (matchArabic.json as any).upcoming?.[0] || {}
  const returnedKeys = Object.keys(lookupSample)
  const forbiddenPaymentKeys = ['total', 'paidFromWallet', 'paidOnCredit', 'paymentMethod', 'paymentProofUrl', 'collectAmount', 'price']
  const leakedPaymentKeys = forbiddenPaymentKeys.filter((k) => returnedKeys.includes(k) || k in lookupSample)
  check('no payment fields leaked in verification response', leakedPaymentKeys.length === 0, `leaked: ${leakedPaymentKeys.join(', ')}`)

  const expectedMasked = `${testPhone.slice(0, 3)}****${testPhone.slice(-4)}`
  check('maskedPhone is masked with asterisks', lookupSample.maskedPhone === expectedMasked, `got: ${lookupSample.maskedPhone}`)
  check('passengerName, seatLabel, reference, and route returned', !!lookupSample.passengerName && !!lookupSample.seatLabel && !!lookupSample.reference && !!lookupSample.route)

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Categorization: upcoming vs older
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5. Upcoming vs older categorization')
  const multiSearch = await api(`/api/admin/verify/lookup?phone=${testPhone}`, { method: 'GET', token: adminToken })
  const multiData = multiSearch.json as any
  check('future trip is placed in upcoming', multiData.upcoming?.length === 1 && multiData.upcoming[0].isUpcoming === true)
  check('past trip is placed in older', multiData.older?.length === 1 && multiData.older[0].isUpcoming === false)

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Audit log entry
  // ───────────────────────────────────────────────────────────────────────────
  console.log('6. Audit log verification')
  const auditRow = await prisma.auditLog.findFirst({
    where: { entity: 'Booking', action: 'LOOKUP' as any, userId: adminUser.id },
    orderBy: { createdAt: 'desc' },
  })
  check('audit log row recorded for phone lookup', !!auditRow && auditRow.metadata.includes(expectedMasked))

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
