/**
 * The credit policy for a super admin booking on a company's behalf.
 *
 * The order is: the company's wallet, then the credit it already has, and
 * if that is still not enough the credit limit is raised by EXACTLY the
 * shortfall. A prepaid company has no credit line at all, so it is refused
 * when the wallet is short and its limit is not touched.
 *
 * What matters here is that nothing is left half done. A booking that is
 * refused must leave no limit increase, no wallet deduction, no outstanding
 * balance change and no booking. A retried request must not grant a second
 * increase. Two bookings at once must not both decide the same wallet can
 * cover them.
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-credit-policy.ts
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

// This script writes to the database and deletes rows. It must never run
// against production, so the guard refuses to start unless this is a test database.
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

async function post(path: string, body: unknown, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `next-auth.session-token=${token}` },
    body: JSON.stringify(body),
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
      email: `credit-${SUFFIX}@example.com`,
      name: 'Credit Admin',
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

  const station = await prisma.station.upsert({
    where: { name_city: { name: `Credit Stn ${SUFFIX}`, city: 'credit' } },
    create: { name: `Credit Stn ${SUFFIX}`, city: 'credit' },
    update: {},
  })
  const departure = new Date(Date.now() + 3 * 86400000)
  departure.setUTCHours(9, 0, 0, 0)
  const { routeKeyOfStops, travelDateOf } = await import('../src/lib/route-key')
  const routeKey = routeKeyOfStops([{ stationId: station.id, stopOrder: 1 }])!
  const travelDate = travelDateOf(departure)!

  // A company, a bus and a trip, one seat, at a price of 1000.
  const makeCompany = async (name: string, data: Record<string, unknown>) =>
    prisma.company.create({
      data: {
        name: `${name} ${SUFFIX}`, subdomain: `${name.toLowerCase()}-${SUFFIX}`, isActive: true,
        creditLimit: 0, walletBalance: 0, paymentMode: 'BOTH', outstandingBalance: 0,
        billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
        maxDailySeats: null,
        ...data,
      },
    })

  const setup = async (companyId: string, seats = 1) => {
    const bus = await prisma.bus.create({
      data: { name: `Credit Bus ${SUFFIX} ${companyId.slice(-4)}`, type: 'COACH_BUS', seatCount: seats, companyId },
    })
    const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 1, cols: seats, aisleAfter: 0 } })
    const seatLabels: string[] = []
    for (let i = 0; i < seats; i++) {
      const label = `S1-${i + 1}`
      seatLabels.push(label)
      await prisma.seat.create({ data: { layoutId: layout.id, label, row: 1, col: i + 1, type: 'NORMAL', price: 1000 } })
    }
    const trip = await prisma.trip.create({
      data: {
        busId: bus.id, origin: 'Credit A', destination: 'Credit B',
        departure, arrival: new Date(departure.getTime() + 6 * 3600000),
        price: 1000, bookingMode: 'SEAT', status: 'SCHEDULED',
        routeKey, travelDate,
        tripStops: { create: [{ stationId: station.id, stopOrder: 1, priceFromOrigin: 1000 }] },
      },
    })
    return { bus, layout, trip, seatLabels }
  }

  const book = (companyId: string, tripId: string, key: string, seatLabels = ['S1-1']) =>
    post('/api/admin/company-bookings', {
      tripId, companyId,
      passengers: seatLabels.map((seatLabel) => ({ seatLabel })),
      idempotencyKey: key,
    }, token)

  console.log('a wallet that covers the whole amount')
  {
    const company = await makeCompany('Credit Rich', { walletBalance: 1000 })
    const { trip } = await setup(company.id)
    const res = await book(company.id, trip.id, `${SUFFIX}-rich`)
    check('the booking is accepted', res.status === 200, `${res.status} ${JSON.stringify(res.json).slice(0, 150)}`)
    check('the whole amount came from the wallet', res.json?.charged === 1000, String(res.json?.charged))
    check('nothing went on credit', res.json?.chargedOnCredit === 0, String(res.json?.chargedOnCredit))
    check('the credit limit was not raised', res.json?.creditLimitIncrease === 0, String(res.json?.creditLimitIncrease))
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('the wallet paid the whole amount', after.walletBalance === 0, String(after.walletBalance))
    check('nothing is outstanding', after.outstandingBalance === 0, String(after.outstandingBalance))
    check('no credit log row was written', (await prisma.creditLog.count({ where: { companyId: company.id } })) === 0)
  }

  console.log('a wallet that covers part of it')
  {
    // The example from the rule: 1000 to pay, 200 in the wallet, 300 of
    // credit available. 500 has to come from somewhere.
    const company = await makeCompany('Credit Part', { walletBalance: 200, creditLimit: 300 })
    const { trip } = await setup(company.id)
    const res = await book(company.id, trip.id, `${SUFFIX}-part`)
    check('the booking is accepted', res.status === 200, `${res.status} ${JSON.stringify(res.json).slice(0, 150)}`)
    check('two hundred came from the wallet', res.json?.charged === 200, String(res.json?.charged))
    check('eight hundred came on credit', res.json?.chargedOnCredit === 800, String(res.json?.chargedOnCredit))
    check('the limit was raised by exactly the shortfall of five hundred',
      res.json?.creditLimitIncrease === 500, String(res.json?.creditLimitIncrease))
    check('the limit went from three hundred to eight hundred',
      res.json?.previousCreditLimit === 300 && res.json?.newCreditLimit === 800,
      `${res.json?.previousCreditLimit} -> ${res.json?.newCreditLimit}`)
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('the wallet paid two hundred', after.walletBalance === 0, String(after.walletBalance))
    check('eight hundred is outstanding', after.outstandingBalance === 800, String(after.outstandingBalance))
    check('the limit is eight hundred', after.creditLimit === 800, String(after.creditLimit))

    const log = await prisma.creditLog.findFirst({ where: { companyId: company.id } })
    check('a credit log row records the change', !!log)
    check('it records the limit before and after',
      log?.previousLimit === 300 && log?.newLimit === 800 && log?.changeAmount === 500,
      `${log?.previousLimit} -> ${log?.newLimit} (${log?.changeAmount})`)
    check('it names the acting administrator', log?.createdById === admin.id, String(log?.createdById))
    check('it names the booking the increase belongs to', !!log?.bookingReference, String(log?.bookingReference))
    const booking = await prisma.companyBooking.findFirst({ where: { companyId: company.id } })
    check('and the reference is the booking that was made', log?.bookingReference === booking?.reference,
      `${log?.bookingReference} vs ${booking?.reference}`)
  }

  console.log('a company with nothing at all')
  {
    const company = await makeCompany('Credit Empty', { walletBalance: 0, creditLimit: 0 })
    const { trip } = await setup(company.id)
    const res = await book(company.id, trip.id, `${SUFFIX}-empty`)
    check('the booking is accepted', res.status === 200, `${res.status} ${JSON.stringify(res.json).slice(0, 150)}`)
    check('nothing came from the wallet', res.json?.charged === 0, String(res.json?.charged))
    check('the whole amount went on credit', res.json?.chargedOnCredit === 1000, String(res.json?.chargedOnCredit))
    check('the limit was raised by exactly the amount', res.json?.creditLimitIncrease === 1000, String(res.json?.creditLimitIncrease))
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('a thousand is outstanding', after.outstandingBalance === 1000, String(after.outstandingBalance))
    check('the limit is a thousand', after.creditLimit === 1000, String(after.creditLimit))
  }

  console.log('a prepaid company')
  {
    const company = await makeCompany('Credit Prepaid', { walletBalance: 10, creditLimit: 5000, paymentMode: 'PREPAID' })
    const { trip } = await setup(company.id)
    const res = await book(company.id, trip.id, `${SUFFIX}-prepaid`)
    check('the booking is refused', res.status === 400, `${res.status} ${JSON.stringify(res.json).slice(0, 150)}`)
    check('the error names the shortfall', res.json?.error === 'INSUFFICIENT_WALLET', String(res.json?.error))
    check('it says the limit was not raised', res.json?.creditLimitIncreased === false, String(res.json?.creditLimitIncreased))
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('the wallet did not move', after.walletBalance === 10, String(after.walletBalance))
    check('the credit limit was not raised', after.creditLimit === 5000, String(after.creditLimit))
    check('nothing is outstanding', after.outstandingBalance === 0, String(after.outstandingBalance))
    check('no booking was created', (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 0)
    check('no credit log row was written', (await prisma.creditLog.count({ where: { companyId: company.id } })) === 0)
  }

  console.log('a booking the quota refuses')
  {
    // A daily cap of one seat, and a booking of two. The quota refuses it, so
    // the money must never move: no limit increase, no wallet debit, no
    // outstanding balance, no booking.
    const company = await makeCompany('Credit Quota', { walletBalance: 0, creditLimit: 0, maxDailySeats: 1 })
    const { trip, seatLabels } = await setup(company.id, 2)
    const res = await book(company.id, trip.id, `${SUFFIX}-quota`, seatLabels)
    check('the booking is refused', res.status === 413, `${res.status} ${JSON.stringify(res.json).slice(0, 150)}`)
    check('the refusal names the daily cap', res.json?.error === 'DAILY_QUOTA_EXCEEDED', String(res.json?.error))
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('the credit limit was not raised', after.creditLimit === 0, String(after.creditLimit))
    check('nothing is outstanding', after.outstandingBalance === 0, String(after.outstandingBalance))
    check('no credit log row was written', (await prisma.creditLog.count({ where: { companyId: company.id } })) === 0)
    check('no booking was created', (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 0)
  }

  console.log('a booking the seat check refuses')
  {
    const company = await makeCompany('Credit Seat', { walletBalance: 0, creditLimit: 0 })
    const { trip } = await setup(company.id)
    await prisma.seatBlock.create({ data: { tripId: trip.id, seatLabel: 'S1-1' } })
    const res = await post('/api/admin/company-bookings', {
      tripId: trip.id, companyId: company.id,
      passengers: [{ seatLabel: 'S1-1' }],
      idempotencyKey: `${SUFFIX}-seat`,
    }, token)
    check('the booking is refused', res.status === 409, `${res.status} ${JSON.stringify(res.json).slice(0, 150)}`)
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('the credit limit was not raised', after.creditLimit === 0, String(after.creditLimit))
    check('no booking was created', (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 0)
  }

  console.log('a retried request')
  {
    const company = await makeCompany('Credit Retry', { walletBalance: 0, creditLimit: 0 })
    const { trip } = await setup(company.id)
    const first = await book(company.id, trip.id, `${SUFFIX}-retry`)
    check('the first request succeeds', first.status === 200, `${first.status} ${JSON.stringify(first.json).slice(0, 150)}`)
    const second = await book(company.id, trip.id, `${SUFFIX}-retry`)
    check('the replay is refused', second.status === 409, `${second.status} ${JSON.stringify(second.json).slice(0, 150)}`)
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('the limit was raised once, not twice', after.creditLimit === 1000, String(after.creditLimit))
    check('only one credit log row was written', (await prisma.creditLog.count({ where: { companyId: company.id } })) === 1)
    check('only one booking was created', (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 1)
    check('only one ledger row was written', (await prisma.walletTransaction.count({ where: { companyId: company.id } })) === 0)
  }

  console.log('two bookings at once')
  {
    // A wallet with a hundred in it and no credit, and two bookings of a
    // thousand at the same moment. The wallet can only cover one of them, so
    // the other has to find the shortfall and raise the limit by exactly that
    // — once, not twice.
    const company = await makeCompany('Credit Race', { walletBalance: 100, creditLimit: 0 })
    const { trip, seatLabels } = await setup(company.id, 2)
    check('the bus has two seats', seatLabels.length === 2)

    const results = await Promise.all([
      book(company.id, trip.id, `${SUFFIX}-race-1`, [seatLabels[0]]),
      book(company.id, trip.id, `${SUFFIX}-race-2`, [seatLabels[1]]),
    ])
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check('the two bookings are decided one after the other', results.length === 2)
    check('the wallet was spent once, not twice', after.walletBalance === 0, String(after.walletBalance))
    // Each booking raised the limit by exactly its own shortfall: the first
    // by nine hundred, the second by a thousand. They are two legitimate
    // increases for two different bookings, not a duplicate.
    check('the limit ended at the total of the two shortfalls',
      after.creditLimit === 1900, String(after.creditLimit))
    check('the outstanding balance matches the limit', after.outstandingBalance === 1900,
      String(after.outstandingBalance))
    const logs = await prisma.creditLog.findMany({ where: { companyId: company.id } })
    check('there is one credit log row for each increase', logs.length === 2, String(logs.length))
    check('and they name two different bookings',
      new Set(logs.map((l) => l.bookingReference)).size === 2,
      JSON.stringify(logs.map((l) => l.bookingReference)))
    check('the two increases together are the whole shortfall',
      logs.reduce((sum, l) => sum + l.changeAmount, 0) === 1900,
      String(logs.reduce((sum, l) => sum + l.changeAmount, 0)))
  }

  // ── Clean up ─────────────────────────────────────────────────────────
  // Every run's leftovers, not only this one's: a run that was interrupted
  // leaves rows behind, and the next run should tidy them rather than pile
  // on top of them.
  const companies = await prisma.company.findMany({
    where: { name: { startsWith: 'Credit ' } },
    select: { id: true },
  })
  const ids = companies.map((c) => c.id)
  if (ids.length > 0) {
    const busIds = (await prisma.bus.findMany({ where: { companyId: { in: ids } }, select: { id: true } })).map((b) => b.id)
    const tripIds = (await prisma.trip.findMany({ where: { busId: { in: busIds } }, select: { id: true } })).map((t) => t.id)
    await prisma.booking.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.companyBooking.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.charterBooking.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.creditLog.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.companyRouteQuota.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.companyTripQuota.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.seatHold.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.seatBlock.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.walletTransaction.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.tripStop.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.trip.deleteMany({ where: { id: { in: tripIds } } })
    await prisma.seat.deleteMany({ where: { layout: { busId: { in: busIds } } } })
    await prisma.busLayout.deleteMany({ where: { busId: { in: busIds } } })
    await prisma.bus.deleteMany({ where: { id: { in: busIds } } })
    await prisma.user.updateMany({ where: { companyId: { in: ids } }, data: { companyId: null } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.station.deleteMany({ where: { id: station.id, tripStops: { none: {} } } })
  await prisma.user.delete({ where: { id: admin.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
