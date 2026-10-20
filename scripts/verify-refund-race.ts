/**
 * A refund is given once, even under concurrent requests.
 *
 * Two admins pressing "refund" on the same booking must not credit the
 * company twice, and must not write two rows in the ledger.
 *
 * The case that matters most is the one in the middle: the request claims
 * the booking, and then something fails before the money is recorded. If the
 * claim survives that failure, the booking is marked as refunded when no
 * money moved, and nobody can retry it. If the claim is rolled back with the
 * failure, the booking is still refundable and a retry works. That is what
 * the "failure between the claim and the credit" checks below prove.
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-refund-race.ts
 *
 * SQLite cannot prove any of this — it has one writer — so the target is the
 * engine production runs on.
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

async function patch(path: string, body: unknown, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
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

  // A real super admin user, so the session is one the app would accept.
  const admin = await prisma.user.create({
    data: {
      email: `refund-${SUFFIX}@example.com`,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      password: 'x',
    },
  })

  // NextAuth reads the session from a cookie, not from a bearer header, so
  // the request has to carry a signed session token.
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
      name: `Refund Co ${SUFFIX}`, subdomain: `refund-${SUFFIX}`, isActive: true,
      creditLimit: 0, walletBalance: 0, paymentMode: 'BOTH', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Refund Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 1, companyId: company.id },
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

  // ── 1. Concurrent refunds credit the company once ────────────────────
  // The company paid 100 from its wallet, so cancelling owes 100 back.
  const booking = await prisma.companyBooking.create({
    data: {
      reference: `refund-${SUFFIX}`,
      companyId: company.id,
      customerId: null,
      tripId: trip.id,
      seatLabel: 'S1-1',
      passengerName: 'Test',
      total: 100,
      status: 'PAID',
      paidAt: new Date(),
      paidFromWallet: 100,
      paidOnCredit: 0,
    },
  })

  // The booking has to be cancelled before it can be refunded, and the
  // cancellation has to record the refund amount.
  await prisma.companyBooking.update({
    where: { id: booking.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      refundAmount: 100,
      cancellationFee: 0,
    },
  })

  const before = await prisma.company.findUnique({ where: { id: company.id } })
  const balanceBefore = before?.walletBalance ?? 0

  // Ten requests at once, all trying to refund the same booking.
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      patch(`/api/admin/cancellations/${booking.id}`, { type: 'company' }, token)
    )
  )
  const okCount = results.filter((r) => r.status === 200).length
  const conflictCount = results.filter((r) => r.status === 409).length

  const after = await prisma.company.findUnique({ where: { id: company.id } })
  const balanceAfter = after?.walletBalance ?? 0

  check(
    'exactly one refund is accepted',
    okCount === 1,
    `ok=${okCount} conflict=${conflictCount} statuses=${results.map((r) => r.status).join(',')}`
  )
  check(
    'the wallet is credited once, not ten times',
    Math.round((balanceAfter - balanceBefore) * 100) === 10000,
    `before=${balanceBefore} after=${balanceAfter} credited=${Math.round((balanceAfter - balanceBefore) * 100)}`
  )

  const refundRows = await prisma.walletTransaction.findMany({
    where: { companyId: company.id, type: 'REFUND' },
  })
  check('one refund row in the ledger', refundRows.length === 1, `rows=${refundRows.length}`)

  const processed = await prisma.companyBooking.findUnique({ where: { id: booking.id } })
  check('the booking is marked processed', !!processed?.refundProcessedAt)

  // ── 2. A failure after the claim must not strand the booking ────────
  // The claim is the update that stamps refundProcessedAt. It happens before
  // the money moves, so the question is what happens when the money movement
  // fails afterwards.
  //
  // The idempotency key gives a way to make exactly that happen: a ledger row
  // that already carries the key makes the insert fail, so the transaction
  // fails after the claim has been made.
  const failing = await prisma.companyBooking.create({
    data: {
      reference: `refund-fail-${SUFFIX}`,
      companyId: company.id,
      customerId: null,
      tripId: trip.id,
      seatLabel: 'S1-1',
      passengerName: 'Test',
      total: 100,
      status: 'PAID',
      paidAt: new Date(),
      paidFromWallet: 100,
      paidOnCredit: 0,
    },
  })
  await prisma.companyBooking.update({
    where: { id: failing.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      refundAmount: 100,
      cancellationFee: 0,
    },
  })

  // The row that will make the ledger insert fail.
  await prisma.walletTransaction.create({
    data: {
      companyId: company.id,
      type: 'ADJUSTMENT',
      amount: 0,
      description: 'A row that makes the next refund insert fail',
      reference: failing.id,
      idempotencyKey: `company-refund:${failing.id}`,
    },
  })

  const walletBeforeFailure = (await prisma.company.findUnique({ where: { id: company.id } }))?.walletBalance ?? 0
  const failedAttempt = await patch(`/api/admin/cancellations/${failing.id}`, { type: 'company' }, token)
  const walletAfterFailure = (await prisma.company.findUnique({ where: { id: company.id } }))?.walletBalance ?? 0

  check(
    'the refund fails when the ledger write fails',
    failedAttempt.status >= 400,
    `status=${failedAttempt.status}`
  )
  check(
    'no money is credited when the transaction fails',
    Math.abs(walletAfterFailure - walletBeforeFailure) < 0.001,
    `before=${walletBeforeFailure} after=${walletAfterFailure}`
  )
  const afterFailure = await prisma.companyBooking.findUnique({ where: { id: failing.id } })
  check(
    'the claim is rolled back with the failure, so the booking is still refundable',
    afterFailure?.refundProcessedAt === null,
    `refundProcessedAt=${afterFailure?.refundProcessedAt}`
  )

  // Remove the obstruction and the refund must then work, exactly once.
  await prisma.walletTransaction.deleteMany({ where: { idempotencyKey: `company-refund:${failing.id}` } })
  const retry = await patch(`/api/admin/cancellations/${failing.id}`, { type: 'company' }, token)
  const walletAfterRetry = (await prisma.company.findUnique({ where: { id: company.id } }))?.walletBalance ?? 0
  check('the retry succeeds', retry.status === 200, `status=${retry.status}`)
  check(
    'the retry credits the company exactly once',
    Math.round((walletAfterRetry - walletBeforeFailure) * 100) === 10000,
    `credited=${Math.round((walletAfterRetry - walletBeforeFailure) * 100)}`
  )
  const retryRows = await prisma.walletTransaction.findMany({
    where: { companyId: company.id, type: 'REFUND' },
  })
  check('there is one refund row per refunded booking', retryRows.length === 2, `rows=${retryRows.length}`)

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.booking.deleteMany({ where: { tripId: trip.id } })
  await prisma.companyBooking.deleteMany({ where: { id: { in: [booking.id, failing.id] } } })
  await prisma.walletTransaction.deleteMany({ where: { companyId: company.id } })
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
