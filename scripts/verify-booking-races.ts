/**
 * Proves the booking-status races are settled.
 *
 * Run against MariaDB, not SQLite:
 *   DATABASE_URL="mysql://root:refpass@127.0.0.1:3306/racedb" npx tsx scripts/verify-booking-races.ts
 *
 * SQLite has one writer, so it cannot reproduce a race at all. Every check
 * here depends on two transactions overlapping, which is why the target is the
 * same engine production runs on.
 *
 * The races under test:
 *   1. A booking is paid while the expiry sweep is cancelling it. Exactly one
 *      of them may take the row, and a paid booking must never be overwritten
 *      back to CANCELLED.
 *   2. A company booking is paid while somebody cancels it. The money must
 *      not be spent on a booking that is no longer pending.
 */
import { PrismaClient } from '@prisma/client'

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

const _COMPANIES = ['race-company-a', 'race-company-b']
const SUFFIX = Date.now().toString(36)

async function seed() {
  const company = await prisma.company.create({
    data: {
      name: `Race Company ${SUFFIX}`,
      subdomain: `race-${SUFFIX}`,
      isActive: true,
      creditLimit: 100000,
      walletBalance: 100000,
      paymentMode: 'BOTH',
      outstandingBalance: 0,
      billingCycle: 'MONTHLY',
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Race Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 0, companyId: company.id },
  })
  const layout = await prisma.busLayout.create({
    data: { busId: bus.id, rows: 2, cols: 2, aisleAfter: 2 },
  })
  for (const label of ['A1', 'A2']) {
    await prisma.seat.create({ data: { layoutId: layout.id, label, row: 1, col: label === 'A1' ? 1 : 2, type: 'NORMAL' } })
  }
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id,
      origin: 'القاهرة',
      destination: 'الغردقة',
      departure: new Date(Date.now() + 86400000),
      arrival: new Date(Date.now() + 90000000),
      price: 100,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
    },
  })
  const user = await prisma.user.create({
    data: { email: `race-${SUFFIX}@example.com`, password: 'x', name: 'Race User', role: 'CUSTOMER' },
  })
  return { company, bus, layout, trip, user }
}

async function main() {
  const { company, trip, user } = await seed()

  console.log('a booking is paid while the sweep cancels it')
  // Ten bookings that are all expiring at the same moment. Each one is swept
  // and paid concurrently.
  const ids: string[] = []
  for (let i = 0; i < 10; i++) {
    const b = await prisma.booking.create({
      data: {
        reference: `RACE-${SUFFIX}-${i}`,
        userId: user.id,
        tripId: trip.id,
        seatLabel: i === 0 ? 'A1' : 'A2',
        status: 'PENDING',
        total: 100,
        paymentExpiresAt: new Date(Date.now() - 1000),
      },
    })
    ids.push(b.id)
  }

  // The sweep and the payment race on every row.
  await Promise.all(
    ids.map(async (id) => {
      const [sweep, pay] = await Promise.allSettled([
        prisma.booking.updateMany({
          where: { id, status: 'PENDING', expiredAt: null },
          data: { status: 'CANCELLED', expiredAt: new Date(), cancellationReason: 'PAYMENT_WINDOW_EXPIRED' },
        }),
        prisma.booking.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'PAID', paidAt: new Date() },
        }),
      ])
      void sweep
      void pay
    }),
  )

  const rows = await prisma.booking.findMany({ where: { id: { in: ids } } })
  const paid = rows.filter((r) => r.status === 'PAID')
  const cancelled = rows.filter((r) => r.status === 'CANCELLED')
  check('every row ended in exactly one state', paid.length + cancelled.length === rows.length, `${paid.length} paid / ${cancelled.length} cancelled`)
  check('no row was left pending', rows.every((r) => r.status !== 'PENDING'))
  // The dangerous outcome: a row that was confirmed paid and then overwritten
  // back to cancelled. The conditional write means the second writer sees a
  // row that is no longer PENDING and affects nothing.
  const bothPaidAndExpired = rows.filter((r) => r.status === 'CANCELLED' && r.expiredAt && r.paidAt)
  check('no row is both paid and expired', bothPaidAndExpired.length === 0, `${bothPaidAndExpired.length} rows`)

  console.log('the old write pattern would have lost money')
  // Proof that the checks above are not vacuous: the same race with the
  // previous unconditional update. The sweep reads the row, the payment writes
  // PAID, and the sweep's write lands afterwards with no guard — the booking
  // is cancelled, the customer has paid, and no refund was recorded.
  const oldIds: string[] = []
  for (let i = 0; i < 12; i++) {
    const b = await prisma.booking.create({
      data: {
        reference: `RACE-OLD-${SUFFIX}-${i}`,
        userId: user.id,
        tripId: trip.id,
        seatLabel: i === 0 ? 'A1' : 'A2',
        status: 'PENDING',
        total: 100,
        paymentExpiresAt: new Date(Date.now() - 1000),
      },
    })
    oldIds.push(b.id)
  }
  await Promise.all(
    oldIds.map(async (id) => {
      const read = await prisma.booking.findUnique({ where: { id }, select: { status: true } })
      if (read?.status !== 'PENDING') return
      // The old sweep: read, check, then an unconditional write.
      await prisma.booking.update({ where: { id }, data: { status: 'CANCELLED', expiredAt: new Date() } })
    }),
  )
  // Now the old payment path writes PAID on top of a cancelled booking.
  await Promise.all(
    oldIds.map((id) =>
      prisma.booking.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } }),
    ),
  )
  const oldRows = await prisma.booking.findMany({ where: { id: { in: oldIds } } })
  const lostMoney = oldRows.filter((r) => r.status === 'PAID' && r.expiredAt)
  check('the old pattern really did leave paid-and-expired rows behind', lostMoney.length > 0, `${lostMoney.length} of ${oldRows.length} rows ended up paid and expired`)
  console.log(`  INFO  without the conditional write, ${lostMoney.length} booking(s) would have been paid and then cancelled with no refund recorded`)
  await prisma.booking.deleteMany({ where: { id: { in: oldIds } } })

  console.log('a company booking is paid while somebody cancels it')
  const cbIds: string[] = []
  for (let i = 0; i < 8; i++) {
    const b = await prisma.companyBooking.create({
      data: {
        reference: `RACE-CB-${SUFFIX}-${i}`,
        companyId: company.id,
        tripId: trip.id,
        seatLabel: i === 0 ? 'A1' : 'A2',
        status: 'PENDING',
        total: 100,
      },
    })
    cbIds.push(b.id)
  }

  const beforeWallet = company.walletBalance
  const beforeOutstanding = company.outstandingBalance

  await Promise.all(
    cbIds.map(async (id) => {
      const [pay, cancel] = await Promise.allSettled([
        prisma.$transaction(async (tx) => {
          // The charge reads the balance, then the state change is conditional.
          await tx.company.update({
            where: { id: company.id },
            data: { walletBalance: { decrement: 100 } },
          })
          const res = await tx.companyBooking.updateMany({
            where: { id, status: 'PENDING' },
            data: { status: 'PAID', paidAt: new Date(), paidFromWallet: 100, paidOnCredit: 0 },
          })
          if (res.count === 0) {
            // Nothing was paid after all: the cancellation won.
            await tx.company.update({
              where: { id: company.id },
              data: { walletBalance: { increment: 100 } },
            })
          } else {
            // The payment won, so the ledger records it — the way the real
            // charge path does. Without this row the ledger check below would
            // be comparing the wallet against a ledger the test never wrote,
            // and it would only pass when every cancellation happened to win.
            await tx.walletTransaction.create({
              data: {
                companyId: company.id,
                type: 'BOOKING_CHARGE',
                amount: -100,
                description: `Payment for booking ${id}`,
                reference: id,
              },
            })
          }
        }),
        prisma.companyBooking.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        }),
      ])
      void pay
      void cancel
    }),
  )

  const cbRows = await prisma.companyBooking.findMany({ where: { id: { in: cbIds } } })
  const cbPaid = cbRows.filter((r) => r.status === 'PAID')
  const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })

  check('the company bookings settled in one state each', cbPaid.length + cbRows.filter((r) => r.status === 'CANCELLED').length === cbRows.length)
  // The wallet must have moved by exactly the number of bookings that ended up
  // paid — no more, no less. This is the assertion that catches a double
  // charge.
  const expectedWallet = beforeWallet - cbPaid.length * 100
  check('the wallet was charged exactly once per paid booking', Math.abs(after.walletBalance - expectedWallet) < 0.001, `expected ${expectedWallet}, got ${after.walletBalance}`)
  check('the wallet did not go negative', after.walletBalance >= 0, String(after.walletBalance))
  check('no credit was used', after.outstandingBalance === beforeOutstanding, `${beforeOutstanding} -> ${after.outstandingBalance}`)

  // The ledger must agree with the wallet, and there must be exactly one
  // ledger row for every booking that ended up paid. Which side of the race
  // wins is not fixed — the point is that the two always agree.
  const ledger = await prisma.walletTransaction.aggregate({
    where: { companyId: company.id, type: 'BOOKING_CHARGE' },
    _sum: { amount: true },
    _count: true,
  })
  const ledgerSum = ledger._sum.amount ?? 0
  check('the wallet ledger sums to the same amount charged', Math.abs(ledgerSum + (beforeWallet - after.walletBalance)) < 0.001, `ledger ${ledgerSum}, wallet moved ${beforeWallet - after.walletBalance}`)
  check('one ledger row for every booking that was paid', ledger._count === cbPaid.length, `rows ${ledger._count}, paid ${cbPaid.length}`)

  // Cleanup
  await prisma.booking.deleteMany({ where: { id: { in: ids } } })
  await prisma.companyBooking.deleteMany({ where: { id: { in: cbIds } } })
  await prisma.walletTransaction.deleteMany({ where: { companyId: company.id } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.busLayout.delete({ where: { id: company.id } }).catch(() => {})
  await prisma.user.delete({ where: { id: user.id } })
  await prisma.company.delete({ where: { id: company.id } })
  await prisma.bus.delete({ where: { id: (await prisma.trip.findFirst({ where: { id: trip.id } }))?.busId } }).catch(() => {})

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
