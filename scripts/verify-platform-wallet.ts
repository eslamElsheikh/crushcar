/**
 * Proves the platform wallet behaves.
 *
 * Run against MariaDB, not SQLite:
 *   DATABASE_URL="mysql://root:refpass@127.0.0.1:3306/walletdb" npx tsx scripts/verify-platform-wallet.ts
 *
 * SQLite has one writer, so it cannot reproduce the concurrent spend that
 * matters here. Every check that depends on two transactions overlapping has
 * to run on the engine production uses.
 *
 * Covers:
 *   - funding, charging and refunding move the balance and the ledger
 *   - a spend larger than the balance is refused and changes nothing
 *   - the same idempotency key twice charges once
 *   - many concurrent charges never overdraw the wallet
 *   - the ledger and the balance always reconcile
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
const ACTOR = { id: 'actor-1', email: 'actor@example.com' }

async function reset() {
  await prisma.platformTransaction.deleteMany({ where: { reference: { startsWith: SUFFIX } } })
  await prisma.platformWallet.deleteMany({ where: { id: 'main' } })
}

async function balance() {
  const w = await prisma.platformWallet.findUnique({ where: { id: 'main' } })
  return w?.balancePiastres ?? 0
}

async function ledgerSum() {
  const s = await prisma.platformTransaction.aggregate({ _sum: { amountPiastres: true } })
  return s._sum.amountPiastres ?? 0
}

async function main() {
  await reset()

  console.log('funding')
  const { fundPlatform, chargePlatform, refundPlatform, adjustPlatform } = await import(
    '../src/lib/platform-wallet'
  )

  await prisma.$transaction(async (tx) =>
    fundPlatform(tx, {
      amountPiastres: 100000,
      method: 'BANK',
      reference: `${SUFFIX}-fund`,
      description: 'Initial funding',
      actorId: ACTOR.id,
      actorEmail: ACTOR.email,
    }),
  )
  check('funding sets the balance', (await balance()) === 100000, String(await balance()))
  check('the ledger records the funding', (await ledgerSum()) === 100000, String(await ledgerSum()))

  console.log('charging')
  const bookingId = `booking-${SUFFIX}-1`
  await prisma.$transaction(async (tx) =>
    chargePlatform(tx, {
      amountPiastres: 25000,
      reference: bookingId,
      description: 'Booking charge',
      idempotencyKey: `charge:${bookingId}`,
      actorId: ACTOR.id,
      actorEmail: ACTOR.email,
    }),
  )
  check('the charge is taken out', (await balance()) === 75000, String(await balance()))
  const chargeRow = await prisma.platformTransaction.findFirst({
    where: { idempotencyKey: `charge:${bookingId}` },
  })
  check('the charge row records the balance after it', chargeRow?.balanceAfterPiastres === 75000, String(chargeRow?.balanceAfterPiastres))
  check('the charge row records who did it', chargeRow?.actorEmail === ACTOR.email, String(chargeRow?.actorEmail))

  console.log('the same idempotency key twice')
  let duplicateRejected = false
  try {
    await prisma.$transaction(async (tx) =>
      chargePlatform(tx, {
        amountPiastres: 25000,
        reference: bookingId,
        idempotencyKey: `charge:${bookingId}`,
        actorId: ACTOR.id,
        actorEmail: ACTOR.email,
      }),
    )
  } catch (err: any) {
    duplicateRejected = err?.code === 'DUPLICATE_PLATFORM_TRANSACTION' || err?.code === 'P2002'
  }
  check('the second charge is rejected', duplicateRejected)
  check('the balance did not move', (await balance()) === 75000, String(await balance()))
  const chargeRows = await prisma.platformTransaction.count({
    where: { idempotencyKey: `charge:${bookingId}` },
  })
  check('only one charge row exists for the booking', chargeRows === 1, String(chargeRows))

  console.log('a spend larger than the balance')
  let refused = false
  try {
    await prisma.$transaction(async (tx) =>
      chargePlatform(tx, {
        amountPiastres: 99999999,
        reference: `${SUFFIX}-too-much`,
        idempotencyKey: `charge:${SUFFIX}-too-much`,
      }),
    )
  } catch (err: any) {
    refused = err?.code === 'INSUFFICIENT_PLATFORM_BALANCE'
  }
  check('the oversized spend is refused', refused)
  check('the balance is untouched', (await balance()) === 75000, String(await balance()))

  console.log('concurrent charges never overdraw')
  // 30 charges of 5000 each against a balance of 75000. Exactly 15 fit.
  const before = await balance()
  const results = await Promise.allSettled(
    Array.from({ length: 30 }, (_, i) =>
      prisma.$transaction(async (tx) =>
        chargePlatform(tx, {
          amountPiastres: 5000,
          reference: `${SUFFIX}-concurrent-${i}`,
          idempotencyKey: `charge:${SUFFIX}-concurrent-${i}`,
        }),
      ),
    ),
  )
  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const refusedCount = results.filter((r) => r.status === 'rejected').length
  const after = await balance()
  console.log(`  INFO  ${succeeded} charges went through, ${refusedCount} were refused`)
  check('no charge pushed the balance below zero', after >= 0, String(after))
  check('the balance is exactly the original minus the charges that went through', after === before - succeeded * 5000, `${after} vs ${before - succeeded * 5000}`)
  check('the refused charges left no ledger rows', (await ledgerSum()) === after, `ledger ${await ledgerSum()} vs balance ${after}`)

  console.log('refunding')
  await prisma.$transaction(async (tx) =>
    refundPlatform(tx, {
      amountPiastres: 25000,
      reference: bookingId,
      description: 'Refund',
      idempotencyKey: `refund:${bookingId}`,
      actorId: ACTOR.id,
      actorEmail: ACTOR.email,
    }),
  )
  check('the refund is paid back in full', (await balance()) === before - succeeded * 5000 + 25000, String(await balance()))
  const refundRow = await prisma.platformTransaction.findFirst({
    where: { idempotencyKey: `refund:${bookingId}` },
  })
  check('the refund row records the balance after it', refundRow?.balanceAfterPiastres === (await balance()))

  console.log('the refund key is separate from the charge key')
  const both = await prisma.platformTransaction.count({
    where: { idempotencyKey: { in: [`charge:${bookingId}`, `refund:${bookingId}`] } },
  })
  check('a booking can be charged and refunded', both === 2, String(both))

  console.log('adjusting by hand')
  const beforeAdjust = await balance()
  await prisma.$transaction(async (tx) =>
    adjustPlatform(tx, {
      amountPiastres: -1500,
      description: 'Bank fee',
      reference: `${SUFFIX}-fee`,
      actorId: ACTOR.id,
      actorEmail: ACTOR.email,
    }),
  )
  check('a negative adjustment reduces the balance', (await balance()) === beforeAdjust - 1500, String(await balance()))

  console.log('the ledger and the balance still agree')
  check('the ledger sums to the balance', (await ledgerSum()) === (await balance()), `ledger ${await ledgerSum()} vs balance ${await balance()}`)

  // The chain of balances must be continuous.
  const rows = await prisma.platformTransaction.findMany({ orderBy: { id: 'asc' } })
  let running = 0
  let broken = null
  for (const row of rows) {
    running += row.amountPiastres
    if (running !== row.balanceAfterPiastres) {
      broken = row
      break
    }
  }
  check('the chain of balances is continuous', broken === null, broken ? `broke at ${broken.id}` : '')

  await reset()
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
