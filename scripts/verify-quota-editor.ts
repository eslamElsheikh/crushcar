/**
 * A smoke test for the two new read/write surfaces:
 *
 *   - GET  /api/admin/company-bookings/preview — what the company has left
 *   - GET/PUT/DELETE /api/admin/companies/[id]/route-quotas — the daily
 *     allowance, set from the company surface
 *
 * Run against MariaDB with the app serving on BASE:
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-quota-editor.ts
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

async function api(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Cookie = `next-auth.session-token=${init.token}`
  const res = await fetch(`${BASE}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function main() {
  const { authSecret } = await import('./lib/auth-secret')
  const secret = authSecret()

  const admin = await prisma.user.create({
    data: {
      email: `quota-${SUFFIX}@example.com`,
      name: 'Quota Admin',
      role: 'SUPER_ADMIN',
      password: 'x',
    },
  })
  const { encode } = await import('next-auth/jwt')
  const token = await encode({
    token: {
      id: admin.id, sub: admin.id, email: admin.email, name: admin.name,
      role: 'SUPER_ADMIN', companyId: null, image: null, activeCheckedAt: Date.now(),
    },
    secret,
    salt: 'next-auth.session-token',
  })

  const company = await prisma.company.create({
    data: {
      name: `Quota Co ${SUFFIX}`, subdomain: `quota-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 5000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Quota Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 1, companyId: company.id },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 1, cols: 1, aisleAfter: 0 } })
  await prisma.seat.create({ data: { layoutId: layout.id, label: 'S1-1', row: 1, col: 1, type: 'NORMAL', price: 100 } })

  const stationA = await prisma.station.create({
    data: { name: `Station A ${SUFFIX}`, city: 'Cairo' },
  })
  const stationB = await prisma.station.create({
    data: { name: `Station B ${SUFFIX}`, city: 'Hurghada' },
  })

  const travelDate = '2026-12-24'
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin: 'Cairo', destination: 'Hurghada',
      departure: new Date('2026-12-24T10:00:00Z'), arrival: new Date('2026-12-24T16:00:00Z'),
      price: 100, status: 'SCHEDULED',
      routeKey: `${stationA.id}|${stationB.id}`,
      travelDate,
    },
  })
  await prisma.tripStop.createMany({
    data: [
      { tripId: trip.id, stationId: stationA.id, stopOrder: 1, priceFromOrigin: 0 },
      { tripId: trip.id, stationId: stationB.id, stopOrder: 2, priceFromOrigin: 100 },
    ],
  })

  // ── The preview ──────────────────────────────────────────────────────
  const preview = await api(`/api/admin/company-bookings/preview?companyId=${company.id}&tripId=${trip.id}`, { token })
  check('the preview answers', preview.status === 200, `status=${preview.status}`)
  check(
    'the preview shows the wallet balance',
    preview.json?.company?.walletBalance === 5000,
    `wallet=${preview.json?.company?.walletBalance}`
  )
  check(
    'the preview shows the per-booking cap',
    preview.json?.limits?.maxSeats === 10,
    `maxSeats=${preview.json?.limits?.maxSeats}`
  )
  check(
    'the preview shows the seat price',
    Number(preview.json?.seatPrice) === 100,
    `seatPrice=${preview.json?.seatPrice}`
  )
  check(
    'an uncapped company can take the full ten seats',
    preview.json?.availableSeats === 10,
    `available=${preview.json?.availableSeats}`
  )

  // ── The route quota editor ───────────────────────────────────────────
  const set = await api(`/api/admin/companies/${company.id}/route-quotas`, {
    method: 'PUT',
    token,
    body: { routeKey: `${stationA.id}|${stationB.id}`, travelDate, maxSeats: 6 },
  })
  check('a quota can be set', set.status === 200, `status=${set.status} ${JSON.stringify(set.json).slice(0, 120)}`)

  const list = await api(`/api/admin/companies/${company.id}/route-quotas`, { token })
  check('the quota is listed', list.json?.quotas?.length === 1, `count=${list.json?.quotas?.length}`)
  check(
    'the quota carries the cap',
    list.json?.quotas?.[0]?.maxSeats === 6,
    `maxSeats=${list.json?.quotas?.[0]?.maxSeats}`
  )
  check(
    'the quota shows the route by name',
    String(list.json?.quotas?.[0]?.routeName || '').includes('→'),
    `routeName=${list.json?.quotas?.[0]?.routeName}`
  )
  check(
    "the company's own routes are offered",
    list.json?.routes?.some((r: any) => r.routeKey === `${stationA.id}|${stationB.id}`),
    `routes=${JSON.stringify(list.json?.routes)}`
  )

  // The preview must now show the smaller allowance.
  const preview2 = await api(`/api/admin/company-bookings/preview?companyId=${company.id}&tripId=${trip.id}`, { token })
  check(
    'the preview shows the daily route allowance',
    preview2.json?.limits?.routeLimit === 6,
    `routeLimit=${preview2.json?.limits?.routeLimit}`
  )
  check(
    'the preview shows the seats that are actually left',
    preview2.json?.availableSeats === 6,
    `available=${preview2.json?.availableSeats}`
  )

  // A bad value is refused rather than stored.
  const bad = await api(`/api/admin/companies/${company.id}/route-quotas`, {
    method: 'PUT',
    token,
    body: { routeKey: `${stationA.id}|${stationB.id}`, travelDate, maxSeats: 0 },
  })
  check('a zero cap is refused', bad.status === 400, `status=${bad.status}`)
  check('and it says which values are allowed',
    bad.json?.error === 'INVALID_SEAT_CAP' && bad.json?.min === 1 && bad.json?.max === 500,
    JSON.stringify(bad.json).slice(0, 140))

  // A cap above the bound is refused too, and nothing is written.
  const tooBig = await api(`/api/admin/companies/${company.id}/route-quotas`, {
    method: 'PUT',
    token,
    body: { routeKey: `${stationA.id}|${stationB.id}`, travelDate, maxSeats: 501 },
  })
  check('a cap above 500 is refused', tooBig.status === 400, `status=${tooBig.status}`)

  // And the largest allowed cap is accepted, so the bound is a bound and not
  // a smaller rule.
  const atTheBound = await api(`/api/admin/companies/${company.id}/route-quotas`, {
    method: 'PUT',
    token,
    body: { routeKey: `${stationA.id}|${stationB.id}`, travelDate, maxSeats: 500 },
  })
  check('a cap of exactly 500 is allowed', atTheBound.status === 200, `status=${atTheBound.status}`)


  const badDate = await api(`/api/admin/companies/${company.id}/route-quotas`, {
    method: 'PUT',
    token,
    body: { routeKey: `${stationA.id}|${stationB.id}`, travelDate: 'not-a-date', maxSeats: 5 },
  })
  check('a malformed date is refused', badDate.status === 400, `status=${badDate.status}`)

  // A company admin may not read another company's quotas.
  const forbidden = await api(`/api/admin/companies/${company.id}/route-quotas`)
  check('an anonymous request is refused', forbidden.status === 401, `status=${forbidden.status}`)

  // Removing the quota puts the route back to no limit.
  const removed = await api(
    `/api/admin/companies/${company.id}/route-quotas?routeKey=${encodeURIComponent(`${stationA.id}|${stationB.id}`)}&travelDate=${travelDate}`,
    { method: 'DELETE', token }
  )
  check('the quota can be removed', removed.status === 200, `status=${removed.status}`)

  const list2 = await api(`/api/admin/companies/${company.id}/route-quotas`, { token })
  check('the quota is gone', list2.json?.quotas?.length === 0, `count=${list2.json?.quotas?.length}`)

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.tripStop.deleteMany({ where: { tripId: trip.id } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.seat.deleteMany({ where: { layoutId: layout.id } })
  await prisma.busLayout.delete({ where: { id: layout.id } })
  await prisma.bus.delete({ where: { id: bus.id } })
  await prisma.station.deleteMany({ where: { id: { in: [stationA.id, stationB.id] } } })
  await prisma.company.delete({ where: { id: company.id } })
  await prisma.user.delete({ where: { id: admin.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
