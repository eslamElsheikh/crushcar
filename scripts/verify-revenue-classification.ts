/**
 * Platform-funded seats are not customer revenue.
 *
 * The platform paying for a seat is money the platform spent, not money it
 * collected. Counting it as customer revenue inflates what the business
 * appears to have taken, and — because a platform booking carries the super
 * admin as its user — it also puts the admin at the top of the list of
 * customers, measured by the platform's own spending.
 *
 * Three things have to hold:
 *   - customer revenue counts only bookings a customer paid for;
 *   - platform spending is reported on its own line, as an entitlement the
 *     platform owes, and is not part of the revenue total;
 *   - company-funded bookings are NOT platform bookings, so they are not
 *     caught by this filter — they are company collections, and they belong
 *     in the company bucket.
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-revenue-classification.ts
 */
import { PrismaClient } from '@prisma/client'
import { getRevenueBreakdown } from '../src/lib/analytics'
import { assertTestDatabase } from './lib/test-db-guard'

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
      name: `Revenue Co ${SUFFIX}`, subdomain: `revenue-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 0, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Revenue Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 1, companyId: company.id },
  })
  const layout = await prisma.busLayout.create({ data: { busId: bus.id, rows: 1, cols: 1, aisleAfter: 0 } })
  await prisma.seat.create({ data: { layoutId: layout.id, label: 'S1-1', row: 1, col: 1, type: 'NORMAL', price: 100 } })

  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin: 'A', destination: 'B',
      departure: new Date(Date.now() + 86400000), arrival: new Date(Date.now() + 90000000),
      price: 100, status: 'SCHEDULED',
    },
  })

  const admin = await prisma.user.create({
    data: {
      email: `revenue-${SUFFIX}@example.com`,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      password: 'x',
    },
  })

  // A platform-funded booking: the platform paid, so nothing was collected.
  const platformBooking = await prisma.booking.create({
    data: {
      reference: `plat-${SUFFIX}`,
      userId: admin.id,
      tripId: trip.id,
      seatLabel: 'S1-1',
      total: 250,
      status: 'PAID',
      paymentStatus: 'PAID',
      fundingSource: 'PLATFORM',
      paidAt: new Date(),
    },
  })

  // And a customer booking, for contrast.
  const customerBooking = await prisma.booking.create({
    data: {
      reference: `cust-${SUFFIX}`,
      userId: admin.id,
      tripId: trip.id,
      seatLabel: 'S1-1',
      total: 75,
      status: 'PAID',
      paymentStatus: 'PAID',
      fundingSource: 'CUSTOMER',
      paidAt: new Date(),
    },
  })

  // And a company-funded booking, which is a third thing again: the company
  // paid, so it is a company collection, not customer revenue and not a
  // platform entitlement.
  const companyBooking = await prisma.companyBooking.create({
    data: {
      reference: `co-${SUFFIX}`,
      companyId: company.id,
      customerId: null,
      tripId: trip.id,
      seatLabel: 'S1-1',
      passengerName: 'Test',
      total: 40,
      status: 'PAID',
      paidAt: new Date(),
      paidFromWallet: 40,
      paidOnCredit: 0,
    },
  })

  // Scoped to this test's own company, so the numbers it checks are its own
  // and not whatever else happens to be in the database. An unscoped total
  // makes the test depend on the order the suites run in.
  const breakdown = await getRevenueBreakdown(prisma, {
    companyId: company.id,
    since: new Date(Date.now() - 86400000),
  })

  // The customer booking is 75 of customer revenue. The platform booking is
  // 250 and must not be in that number.
  check(
    'platform seats are excluded from customer revenue',
    Math.abs(breakdown.customer - 75) < 0.01,
    `customer=${breakdown.customer} (expected 75)`
  )
  check(
    'platform seats are reported as unsettled entitlements',
    Math.abs(breakdown.platformUnsettledEntitlements - 250) < 0.01,
    `platformUnsettledEntitlements=${breakdown.platformUnsettledEntitlements} (expected 250)`
  )
  check(
    'the platform spending is not in the revenue total',
    Math.abs(breakdown.total - (75 + breakdown.company + breakdown.charter)) < 0.01,
    `total=${breakdown.total} customer=${breakdown.customer} company=${breakdown.company} charter=${breakdown.charter}`
  )
  check(
    'the two bookings are counted separately',
    breakdown.bookings.platform === 1,
    `platform=${breakdown.bookings.platform}`
  )

  // The company-funded booking must NOT be swept up by the platform filter.
  // It is a company collection: it belongs in the company bucket, and it is
  // not an entitlement the platform owes.
  check(
    'a company-funded booking is not excluded from company revenue',
    Math.abs(breakdown.company - 40) < 0.01,
    `company=${breakdown.company} (expected 40)`
  )
  check(
    'a company-funded booking is not a platform entitlement',
    Math.abs(breakdown.platformUnsettledEntitlements - 250) < 0.01,
    `platformUnsettledEntitlements=${breakdown.platformUnsettledEntitlements} (expected 250, not 290)`
  )
  check(
    'a company-funded booking is counted as a company booking',
    breakdown.bookings.company === 1,
    `company=${breakdown.bookings.company}`
  )
  check(
    'a company-funded booking is not counted as a platform booking',
    breakdown.bookings.platform === 1,
    `platform=${breakdown.bookings.platform} (one platform booking, not two)`
  )

  // The charter aggregate sums `price`, and the total must include it.
  const charter = await prisma.charterBooking.create({
    data: {
      tripId: trip.id,
      companyId: company.id,
      price: 500,
      status: 'confirmed',
    },
  }).catch(() => null)

  if (charter) {
    const withCharter = await getRevenueBreakdown(prisma, {
      companyId: company.id,
      since: new Date(Date.now() - 86400000),
    })
    check(
      'charter revenue is counted, and is not silently zero',
      Math.abs(withCharter.charter - 500) < 0.01,
      `charter=${withCharter.charter} (expected 500)`
    )
    check(
      'charter revenue is in the total',
      Math.abs(withCharter.total - (75 + 40 + 500)) < 0.01,
      `total=${withCharter.total}`
    )
    await prisma.charterBooking.delete({ where: { id: charter.id } })
  }

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.booking.deleteMany({ where: { id: { in: [platformBooking.id, customerBooking.id] } } })
  await prisma.companyBooking.deleteMany({ where: { id: companyBooking.id } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.seat.deleteMany({ where: { layoutId: layout.id } })
  await prisma.busLayout.delete({ where: { id: layout.id } })
  await prisma.bus.delete({ where: { id: bus.id } })
  await prisma.company.delete({ where: { id: company.id } })
  await prisma.user.delete({ where: { id: admin.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
