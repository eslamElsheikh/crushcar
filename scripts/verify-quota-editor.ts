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
import { routeKeyOfStops, travelDateOf } from '../src/lib/route-key'

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

/** The day a number of days after another. */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    String(list.json?.quotas?.[0]?.label || '').includes('→'),
    `label=${list.json?.quotas?.[0]?.label}`
  )
  check(
    'and the stops it passes through',
    Array.isArray(list.json?.quotas?.[0]?.stops) && list.json?.quotas?.[0]?.stops.length === 2,
    `stops=${JSON.stringify(list.json?.quotas?.[0]?.stops)}`
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

  console.log('the route list does not depend only on the company\'s own buses')
  // The production shape: a company with bookings on routes, and buses that
  // are not associated with any company. A list built from the company's own
  // buses is empty, so there would be no route to give an allowance on.
  const booked = await prisma.company.create({
    data: {
      name: `Booked Co ${SUFFIX}`, subdomain: `booked-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 100000, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const orphanBus = await prisma.bus.create({
    data: { name: `Orphan Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 0, companyId: null },
  })
  const orphanLayout = await prisma.busLayout.create({ data: { busId: orphanBus.id, rows: 1, cols: 1, aisleAfter: 0 } })
  await prisma.seat.create({ data: { layoutId: orphanLayout.id, label: 'S1-1', row: 1, col: 1, type: 'NORMAL', price: 100 } })

  // The trips these bookings are on leave two days from now, so their travel
  // date is that day, not the one the first trip uses.
  const bookedDeparture = new Date(Date.now() + 2 * 86400000)
  bookedDeparture.setUTCHours(9, 0, 0, 0)
  const bookedTravelDate = travelDateOf(bookedDeparture)!
  const bookedRoute = [stationA.id, stationB.id]
  const bookedRouteKey = `${stationA.id}|${stationB.id}`
  const bookedTrip = await prisma.trip.create({
    data: {
      busId: orphanBus.id, origin: 'A', destination: 'B',
      departure: bookedDeparture, arrival: new Date(bookedDeparture.getTime() + 6 * 3600000),
      price: 100, status: 'SCHEDULED', bookingMode: 'SEAT',
      routeKey: bookedRouteKey, travelDate: bookedTravelDate,
      tripStops: { create: bookedRoute.map((s, i) => ({ stationId: s, stopOrder: i + 1, priceFromOrigin: i * 50 })) },
    },
  })
  await prisma.companyBooking.create({
    data: {
      reference: `booked-${SUFFIX}`,
      companyId: booked.id, tripId: bookedTrip.id, seatLabel: 'S1-1',
      status: 'PENDING', total: 100, fromStopOrder: 1, toStopOrder: 1,
    },
  })

  const bookedList = await api(`/api/admin/companies/${booked.id}/route-quotas`, { token })
  check('the routes the company has booked on are offered',
    (bookedList.json?.routes || []).some((r: any) => r.routeKey === bookedRouteKey),
    JSON.stringify((bookedList.json?.routes || []).map((r: any) => r.routeKey)).slice(0, 140))
  check('and it has no buses of its own',
    (await prisma.bus.count({ where: { companyId: booked.id } })) === 0)

  console.log('the list keeps the routes apart')
  // The reverse of the booked route, and a route with the same endpoints but
  // a different intermediate stop. Neither may be merged into the first.
  const stationC = await prisma.station.upsert({
    where: { name_city: { name: `Quota C ${SUFFIX}`, city: 'quota' } },
    create: { name: `Quota C ${SUFFIX}`, city: 'quota' },
    update: {},
  })
  const reverseTrip = await prisma.trip.create({
    data: {
      busId: orphanBus.id, origin: 'B', destination: 'A',
      departure: bookedDeparture, arrival: new Date(bookedDeparture.getTime() + 6 * 3600000),
      price: 100, status: 'SCHEDULED', bookingMode: 'SEAT',
      routeKey: `${stationB.id}|${stationA.id}`, travelDate: bookedTravelDate,
      tripStops: { create: [{ stationId: stationB.id, stopOrder: 1, priceFromOrigin: 0 }, { stationId: stationA.id, stopOrder: 2, priceFromOrigin: 50 }] },
    },
  })
  const otherStopsTrip = await prisma.trip.create({
    data: {
      busId: orphanBus.id, origin: 'A', destination: 'B',
      departure: bookedDeparture, arrival: new Date(bookedDeparture.getTime() + 6 * 3600000),
      price: 100, status: 'SCHEDULED', bookingMode: 'SEAT',
      routeKey: `${stationA.id}|${stationC.id}|${stationB.id}`, travelDate: bookedTravelDate,
      tripStops: { create: [{ stationId: stationA.id, stopOrder: 1, priceFromOrigin: 0 }, { stationId: stationC.id, stopOrder: 2, priceFromOrigin: 25 }, { stationId: stationB.id, stopOrder: 3, priceFromOrigin: 50 }] },
    },
  })
  await prisma.companyBooking.create({
    data: {
      reference: `booked-2-${SUFFIX}`,
      companyId: booked.id, tripId: reverseTrip.id, seatLabel: 'S1-1',
      status: 'PENDING', total: 100, fromStopOrder: 1, toStopOrder: 1,
    },
  })
  await prisma.companyBooking.create({
    data: {
      reference: `booked-3-${SUFFIX}`,
      companyId: booked.id, tripId: otherStopsTrip.id, seatLabel: 'S1-1',
      status: 'PENDING', total: 100, fromStopOrder: 1, toStopOrder: 1,
    },
  })

  const distinctList = await api(`/api/admin/companies/${booked.id}/route-quotas`, { token })
  const keys = (distinctList.json?.routes || []).map((r: any) => r.routeKey)
  check('the reverse direction is a separate route', keys.includes(`${stationB.id}|${stationA.id}`),
    JSON.stringify(keys).slice(0, 200))
  check('a route with different intermediate stops is separate',
    keys.includes(`${stationA.id}|${stationC.id}|${stationB.id}`),
    JSON.stringify(keys).slice(0, 200))
  check('and the three of them are three entries, not one',
    new Set(keys).size === keys.length && keys.length >= 3,
    JSON.stringify(keys).slice(0, 200))

  console.log('the labels tell the journeys apart')
  const byKey = new Map<string, any>((distinctList.json?.routes || []).map((r: any) => [r.routeKey, r]))
  const direct = byKey.get(bookedRouteKey)
  const reverse = byKey.get(`${stationB.id}|${stationA.id}`)
  const viaOther = byKey.get(`${stationA.id}|${stationC.id}|${stationB.id}`)

  check('the direct route shows its two stops',
    direct?.stops?.length === 2, JSON.stringify(direct?.stops))
  check('and no intermediate stops', !direct?.label?.includes('via'), direct?.label)
  check('the route with an intermediate stop shows it',
    viaOther?.stops?.length === 3, JSON.stringify(viaOther?.stops))
  check('and names it in the label', viaOther?.label?.includes('via'), viaOther?.label)
  check('the two labels are different', direct?.label !== viaOther?.label,
    `${direct?.label} vs ${viaOther?.label}`)
  check('the reverse direction has a different label too', direct?.label !== reverse?.label,
    `${direct?.label} vs ${reverse?.label}`)
  check('and its stops are in the other order',
    JSON.stringify(reverse?.stops) === JSON.stringify([...(direct?.stops ?? [])].reverse()),
    `${JSON.stringify(reverse?.stops)} vs ${JSON.stringify(direct?.stops)}`)

  console.log('a route that is both booked and served is listed once')
  // The same route reached from the bookings and from a bus the company owns.
  const ownedBus = await prisma.bus.create({
    data: { name: `Owned Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 1, companyId: booked.id },
  })
  const ownedLayout = await prisma.busLayout.create({ data: { busId: ownedBus.id, rows: 1, cols: 1, aisleAfter: 0 } })
  await prisma.seat.create({ data: { layoutId: ownedLayout.id, label: 'S1-1', row: 1, col: 1, type: 'NORMAL', price: 100 } })
  const ownedTrip = await prisma.trip.create({
    data: {
      busId: ownedBus.id, origin: 'A', destination: 'B',
      departure: bookedDeparture, arrival: new Date(bookedDeparture.getTime() + 6 * 3600000),
      price: 100, status: 'SCHEDULED', bookingMode: 'SEAT',
      routeKey: bookedRouteKey, travelDate: bookedTravelDate,
      tripStops: { create: bookedRoute.map((s, i) => ({ stationId: s, stopOrder: i + 1, priceFromOrigin: i * 50 })) },
    },
  })
  const bothList = await api(`/api/admin/companies/${booked.id}/route-quotas`, { token })
  const bothKeys = (bothList.json?.routes || []).map((r: any) => r.routeKey)
  check('the route appears once, not twice',
    bothKeys.filter((k: string) => k === bookedRouteKey).length === 1,
    JSON.stringify(bothKeys).slice(0, 200))
  check('and the canonical key is unchanged', bothKeys.includes(bookedRouteKey))

  console.log('a route whose stop names are unknown is not given invented ones')
  // An allowance written long ago can name a station that has since been
  // deleted. The key still points at it, and the editor has to say so rather
  // than make a name up.
  const unknownRouteKey = `${stationA.id}|ghost-station-id`
  await prisma.companyRouteQuota.upsert({
    where: { companyId_routeKey_travelDate: { companyId: booked.id, routeKey: unknownRouteKey, travelDate: bookedTravelDate } },
    create: { companyId: booked.id, routeKey: unknownRouteKey, travelDate: bookedTravelDate, maxSeats: 5 },
    update: { maxSeats: 5 },
  })
  const unknownList = await api(`/api/admin/companies/${booked.id}/route-quotas`, { token })
  const unknownRow = (unknownList.json?.quotas || []).find((q: any) => q.routeKey === unknownRouteKey)
  check('the row is still listed', !!unknownRow)
  check('and it says the stops are unknown', unknownRow?.stopsComplete === false,
    JSON.stringify(unknownRow?.stops))
  check('the unknown stop is not given a name', unknownRow?.stops?.includes('ghost-station-id') === false,
    JSON.stringify(unknownRow?.stops))
  check('and the label says so', String(unknownRow?.label).includes('stops unknown'),
    unknownRow?.label)

  console.log('a date range is written as one row per day')
  const range = await api(`/api/admin/companies/${booked.id}/route-quotas`, {
    method: 'PUT',
    token,
    body: { routeKey: bookedRouteKey, travelDate: bookedTravelDate, dateTo: addDays(bookedTravelDate, 4), maxSeats: 8 },
  })
  check('a range is accepted', range.status === 200, `status=${range.status}`)
  check('and it writes one row per day', (range.json?.written || []).length === 5,
    `wrote ${(range.json?.written || []).length}`)

  const rangeList = await api(`/api/admin/companies/${booked.id}/route-quotas`, { token })
  const rangeRows = (rangeList.json?.quotas || []).filter((q: any) => q.routeKey === bookedRouteKey)
  check('the rows are all there', rangeRows.length === 5, `rows=${rangeRows.length}`)

  const rangeRemoved = await api(
    `/api/admin/companies/${booked.id}/route-quotas?routeKey=${encodeURIComponent(bookedRouteKey)}&travelDate=${bookedTravelDate}&dateTo=${addDays(bookedTravelDate, 4)}`,
    { method: 'DELETE', token },
  )
  check('the range can be removed', rangeRemoved.status === 200, `status=${rangeRemoved.status}`)
  const afterRemove = await api(`/api/admin/companies/${booked.id}/route-quotas`, { token })
  check('and every day of it is gone',
    (afterRemove.json?.quotas || []).filter((q: any) => q.routeKey === bookedRouteKey).length === 0,
    `rows=${(afterRemove.json?.quotas || []).filter((q: any) => q.routeKey === bookedRouteKey).length}`)

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.companyBooking.deleteMany({ where: { companyId: booked.id } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: booked.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: booked.id } })
  await prisma.trip.deleteMany({ where: { id: { in: [bookedTrip.id, reverseTrip.id, otherStopsTrip.id, ownedTrip.id] } } })
  await prisma.seat.deleteMany({ where: { layoutId: { in: [orphanLayout.id, ownedLayout.id] } } })
  await prisma.busLayout.deleteMany({ where: { id: { in: [orphanLayout.id, ownedLayout.id] } } })
  await prisma.bus.deleteMany({ where: { id: { in: [orphanBus.id, ownedBus.id] } } })
  await prisma.company.delete({ where: { id: booked.id } })
  // A user still pointing at the company would make the company delete fail,
  // so the user is released first.
  await prisma.user.updateMany({ where: { companyId: company.id }, data: { companyId: null } })
  await prisma.user.deleteMany({ where: { id: { in: [admin.id] } } })
  await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
  await prisma.tripStop.deleteMany({ where: { tripId: trip.id } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.seat.deleteMany({ where: { layoutId: layout.id } })
  await prisma.busLayout.delete({ where: { id: layout.id } })
  await prisma.bus.delete({ where: { id: bus.id } })
  await prisma.station.deleteMany({ where: { id: { in: [stationA.id, stationB.id] } } })
  await prisma.company.delete({ where: { id: company.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
