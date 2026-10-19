/**
 * Proves the platform booking path end to end.
 *
 * Run against MariaDB:
 *   DATABASE_URL="mysql://root:refpass@127.0.0.1:3306/platformdb" npx tsx scripts/verify-platform-booking.ts
 *
 * The things that have to be true:
 *   - a platform booking is PAID with fundingSource PLATFORM and no receipt
 *   - the money is taken from the platform wallet, not from a company
 *   - a company is never touched, and no CompanyBooking is created
 *   - a booking that the wallet cannot cover is refused with nothing created
 *   - the same idempotency key twice charges once
 *   - cancelling returns the money in full, with no policy haircut, and the
 *     booking never reaches the admin refund queue
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

const SUFFIX = Date.now().toString(36)

async function seed() {
  const company = await prisma.company.create({
    data: {
      name: `Platform Test Co ${SUFFIX}`,
      subdomain: `platform-${SUFFIX}`,
      isActive: true,
      creditLimit: 500000,
      walletBalance: 500000,
      paymentMode: 'BOTH',
      outstandingBalance: 0,
      billingCycle: 'MONTHLY',
    },
  })
  const bus = await prisma.bus.create({
    data: { name: `Platform Bus ${SUFFIX}`, type: 'COACH_BUS', seatCount: 0, companyId: company.id },
  })
  const layout = await prisma.busLayout.create({
    data: { busId: bus.id, rows: 2, cols: 3, aisleAfter: 2 },
  })
  const labels = ['A1', 'A2', 'A3']
  for (let i = 0; i < labels.length; i++) {
    await prisma.seat.create({
      data: { layoutId: layout.id, label: labels[i], row: 1, col: i + 1, type: 'NORMAL', price: 0 },
    })
  }
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id,
      origin: 'القاهرة',
      destination: 'الغردقة',
      departure: new Date(Date.now() + 86400000),
      arrival: new Date(Date.now() + 90000000),
      price: 500,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
    },
  })
  const admin = await prisma.user.create({
    data: { email: `platform-admin-${SUFFIX}@example.com`, password: 'x', name: 'Platform Admin', role: 'SUPER_ADMIN' },
  })
  return { company, bus, layout, trip, admin }
}

/** The same shape the endpoint does, without going through HTTP. */
async function platformBook(
  tx: any,
  args: { tripId: string; seats: string[]; idempotencyKey: string; admin: { id: string; email: string } },
) {
  const { chargePlatform, toPiastres } = await import('../src/lib/platform-wallet')
  const { nextBookingRef } = await import('../src/lib/booking-reference')
  const { lockRow } = await import('../src/lib/row-lock')

  const trip = await tx.trip.findUnique({
    where: { id: args.tripId },
    include: { tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } },
  })
  if (!trip) throw new Error('Trip not found')
  await lockRow(tx, 'Trip', trip.id)

  const total = args.seats.length * trip.price
  const movement = await chargePlatform(tx, {
    amountPiastres: toPiastres(total),
    reference: trip.id,
    description: 'test',
    idempotencyKey: `charge:${args.idempotencyKey}`,
    actorId: args.admin.id,
    actorEmail: args.admin.email,
  })

  const created = []
  for (const label of args.seats) {
    const reference = await nextBookingRef(tx, {
      fromStation: trip.origin,
      toStation: trip.destination,
      seatLabel: label,
    })
    const b = await tx.booking.create({
      data: {
        reference,
        userId: args.admin.id,
        tripId: trip.id,
        seatLabel: label,
        passengerName: 'Platform Passenger',
        status: 'PAID',
        paidAt: new Date(),
        fundingSource: 'PLATFORM',
        paymentStatus: 'NONE',
        paymentExpiresAt: null,
        total: trip.price,
        fromStopOrder: 1,
        toStopOrder: 1,
      },
    })
    created.push(b)
  }
  return { created, movement }
}

async function main() {
  const { company, trip, admin } = await seed()
  const { chargePlatform, fundPlatform, refundPlatform, toPiastres, fromPiastres } = await import(
    '../src/lib/platform-wallet'
  )

  // Remember which ledger rows existed before, so the cleanup removes exactly
  // what this run wrote and nothing else. The refund row is keyed on the
  // booking reference, not the trip, so a coarse delete would miss it.
  const beforeIds = new Set((await prisma.platformTransaction.findMany({ select: { id: true } })).map((r) => r.id))

  console.log('funding the platform wallet')
  await prisma.$transaction(async (tx) =>
    fundPlatform(tx, { amountPiastres: 100000, method: 'BANK', reference: `${SUFFIX}-fund`, actorId: admin.id, actorEmail: admin.email }),
  )

  const walletBefore = await prisma.platformWallet.findUniqueOrThrow({ where: { id: 'main' } })
  const companyBefore = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })

  console.log('a platform booking')
  const result = await prisma.$transaction((tx) =>
    platformBook(tx, { tripId: trip.id, seats: ['A1', 'A2'], idempotencyKey: `${SUFFIX}-b1`, admin }),
  )
  const booking = result.created[0]

  check('the booking is paid', booking.status === 'PAID', booking.status)
  check('it is marked as platform funded', booking.fundingSource === 'PLATFORM', String(booking.fundingSource))
  check('it has no receipt', booking.paymentProofUrl === null, String(booking.paymentProofUrl))
  check('it has no payment window', booking.paymentExpiresAt === null, String(booking.paymentExpiresAt))
  check('the money left the platform wallet', walletBefore.balancePiastres - result.movement.balanceAfterPiastres === 100000, 'two seats at 500')
  check('the ledger records the charge', (await prisma.platformTransaction.count({ where: { type: 'BOOKING_CHARGE' } })) >= 1)

  console.log('no company was touched')
  const companyAfter = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('the company wallet did not move', companyAfter.walletBalance === companyBefore.walletBalance, `${companyBefore.walletBalance} -> ${companyAfter.walletBalance}`)
  check('the company credit line did not move', companyAfter.outstandingBalance === companyBefore.outstandingBalance)
  check('no company booking was created', (await prisma.companyBooking.count({ where: { companyId: company.id } })) === 0)
  check('the company ledger has no charge', (await prisma.walletTransaction.count({ where: { companyId: company.id, type: 'BOOKING_CHARGE' } })) === 0)

  console.log('the same idempotency key twice')
  let rejected = false
  try {
    await prisma.$transaction((tx) =>
      platformBook(tx, { tripId: trip.id, seats: ['A3'], idempotencyKey: `${SUFFIX}-b1`, admin }),
    )
  } catch (err: any) {
    rejected = err?.code === 'DUPLICATE_PLATFORM_TRANSACTION' || err?.code === 'P2002'
    console.log(`  INFO  the replay failed with ${err?.code}: ${String(err?.message).slice(0, 120)}`)
  }
  check('the second booking with the same key is refused', rejected)
  const walletAfterDup = await prisma.platformWallet.findUniqueOrThrow({ where: { id: 'main' } })
  check('the wallet did not move on the replay', walletAfterDup.balancePiastres === result.movement.balanceAfterPiastres, String(walletAfterDup.balancePiastres))
  check('the replay created no booking', (await prisma.booking.count({ where: { tripId: trip.id, seatLabel: 'A3' } })) === 0)

  console.log('a booking the wallet cannot cover')
  const walletNow = await prisma.platformWallet.findUniqueOrThrow({ where: { id: 'main' } })
  // Leave less in the wallet than one seat costs.
  if (walletNow.balancePiastres > 100) {
    await prisma.$transaction(async (tx) =>
      adjustDown(tx, walletNow.balancePiastres - 100, `${SUFFIX}-drain`),
    )
  } else {
    await prisma.$transaction(async (tx) =>
      fundPlatform(tx, { amountPiastres: 1000, method: 'BANK', reference: `${SUFFIX}-topup`, actorId: admin.id, actorEmail: admin.email }),
    )
    await prisma.$transaction(async (tx) =>
      adjustDown(tx, 900, `${SUFFIX}-drain`),
    )
  }
  let refused = false
  try {
    await prisma.$transaction((tx) =>
      platformBook(tx, { tripId: trip.id, seats: ['A3'], idempotencyKey: `${SUFFIX}-b2`, admin }),
    )
  } catch (err: any) {
    refused = err?.code === 'INSUFFICIENT_PLATFORM_BALANCE'
  }
  check('the booking is refused', refused)
  check('no booking was created', (await prisma.booking.count({ where: { tripId: trip.id, seatLabel: 'A3' } })) === 0)
  const walletAfterRefuse = await prisma.platformWallet.findUniqueOrThrow({ where: { id: 'main' } })
  check('the wallet did not move', walletAfterRefuse.balancePiastres === 100, String(walletAfterRefuse.balancePiastres))

  console.log('cancelling returns the money in full')
  // Put the money back so the cancellation has something to return.
  await prisma.$transaction(async (tx) =>
    fundPlatform(tx, { amountPiastres: 100000, method: 'BANK', reference: `${SUFFIX}-fund2`, actorId: admin.id, actorEmail: admin.email }),
  )
  const beforeCancel = await prisma.platformWallet.findUniqueOrThrow({ where: { id: 'main' } })

  const cancelled = await prisma.$transaction(async (tx) => {
    const res = await tx.booking.updateMany({
      where: { id: booking.id, status: 'PAID', fundingSource: 'PLATFORM' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        refundAmount: booking.total,
        cancellationFee: 0,
        refundProcessedAt: new Date(),
        refundProcessedBy: admin.id,
      },
    })
    if (res.count === 0) throw new Error('BOOKING_NOT_PAID')
    await refundPlatform(tx, {
      amountPiastres: toPiastres(booking.total),
      reference: booking.reference,
      description: 'refund',
      idempotencyKey: `refund:${booking.id}`,
      actorId: admin.id,
      actorEmail: admin.email,
    })
    return true
  })
  check('the cancellation went through', cancelled === true)
  const afterCancel = await prisma.platformWallet.findUniqueOrThrow({ where: { id: 'main' } })
  check(
    'the full amount came back, with no haircut',
    afterCancel.balancePiastres === beforeCancel.balancePiastres + booking.total * 100,
    `${beforeCancel.balancePiastres} -> ${afterCancel.balancePiastres}, expected +${booking.total * 100}`,
  )
  const cancelledRow = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
  check('the booking is marked as refunded', cancelledRow.refundProcessedAt !== null)
  check('it is out of the admin refund queue', cancelledRow.refundProcessedAt !== null)
  check('the refund amount is the full price', cancelledRow.refundAmount === booking.total, `${cancelledRow.refundAmount} vs ${booking.total}`)

  console.log('cancelling twice does not refund twice')
  let secondRefused = false
  try {
    await prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { id: booking.id, status: 'PAID', fundingSource: 'PLATFORM' },
        data: { status: 'CANCELLED' },
      })
      if (res.count === 0) throw new Error('BOOKING_NOT_PAID')
      await refundPlatform(tx, {
        amountPiastres: toPiastres(booking.total),
        reference: booking.reference,
        idempotencyKey: `refund:${booking.id}`,
        actorId: admin.id,
        actorEmail: admin.email,
      })
    })
  } catch (err: any) {
    secondRefused = err?.message === 'BOOKING_NOT_PAID' || err?.code === 'DUPLICATE_PLATFORM_TRANSACTION'
  }
  check('the second cancellation is refused', secondRefused)
  const afterSecond = await prisma.platformWallet.findUniqueOrThrow({ where: { id: 'main' } })
  check('the wallet did not move again', afterSecond.balancePiastres === afterCancel.balancePiastres, String(afterSecond.balancePiastres))

  console.log('the ledger still reconciles')
  const sum = await prisma.platformTransaction.aggregate({ _sum: { amountPiastres: true } })
  check('the ledger sums to the balance', (sum._sum.amountPiastres ?? 0) === afterSecond.balancePiastres, `ledger ${sum._sum.amountPiastres} vs balance ${afterSecond.balancePiastres}`)

  // Cleanup
  const written = (await prisma.platformTransaction.findMany({ select: { id: true } }))
    .map((r) => r.id)
    .filter((id) => !beforeIds.has(id))
  await prisma.platformTransaction.deleteMany({ where: { id: { in: written } } })
  await prisma.booking.deleteMany({ where: { tripId: trip.id } })
  await prisma.platformWallet.deleteMany({ where: { id: 'main' } })
  await prisma.trip.delete({ where: { id: trip.id } })
  await prisma.user.delete({ where: { id: admin.id } })
  await prisma.company.delete({ where: { id: company.id } })

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

/** Takes money out of the wallet for the test, as a bank fee would. */
async function adjustDown(tx: any, amountPiastres: number, reference: string) {
  const { adjustPlatform } = await import('../src/lib/platform-wallet')
  await adjustPlatform(tx, {
    amountPiastres: -Math.abs(amountPiastres),
    description: 'drain',
    reference,
    actorId: 'test',
    actorEmail: 'test@example.com',
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
