#!/usr/bin/env node
/**
 * Audits the platform wallet against its ledger.
 *
 * Run: npm run reconcile:platform
 *
 * Two checks, and the second is the one that matters:
 *
 *   1. The balance on PlatformWallet equals the sum of the ledger. A float
 *      cannot promise this, which is why the platform wallet counts piastres.
 *   2. Every row's balanceAfterPiastres equals the previous row's plus its
 *      own amount. A total that disagrees says "something is wrong"; a broken
 *      chain says "row 412 is the first one that disagrees", which is the
 *      difference between a useless alarm and an audit.
 *
 * The chain is checked in id order, not createdAt order, because the rows are
 * written by concurrent transactions and their timestamps can interleave.
 * The balance is the ground truth for the total; the chain finds the row.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PLATFORM_WALLET_ID = 'main'

async function main() {
  const [wallet, rows] = await Promise.all([
    prisma.platformWallet.findUnique({ where: { id: PLATFORM_WALLET_ID } }),
    prisma.platformTransaction.findMany({ orderBy: { id: 'asc' } }),
  ])

  const balance = wallet?.balancePiastres ?? 0
  const ledgerSum = rows.reduce((sum, r) => sum + r.amountPiastres, 0)

  console.log('platform wallet')
  console.log(`  rows in ledger      : ${rows.length}`)
  console.log(`  balance             : ${balance} piastres (${(balance / 100).toFixed(2)})`)
  console.log(`  sum of ledger       : ${ledgerSum} piastres (${(ledgerSum / 100).toFixed(2)})`)

  let problems = 0

  if (balance !== ledgerSum) {
    problems++
    console.error(`  FAIL  the balance and the ledger disagree by ${balance - ledgerSum} piastres`)
  } else {
    console.log('  ok    the balance equals the sum of the ledger')
  }

  // The chain, in id order.
  let running = 0
  let brokenAt = null
  for (const row of rows) {
    running += row.amountPiastres
    if (running !== row.balanceAfterPiastres) {
      brokenAt = row
      break
    }
  }

  if (brokenAt) {
    problems++
    console.error(
      `  FAIL  the chain breaks at ${brokenAt.id} (${brokenAt.type}, ${brokenAt.amountPiastres} piastres): ` +
        `expected balanceAfter ${running}, found ${brokenAt.balanceAfterPiastres}`,
    )
  } else {
    console.log('  ok    the chain of balances is continuous through every row')
  }

  // A row whose balanceAfter does not match the running total but where the
  // chain holds elsewhere would be a different bug; check the last row too.
  if (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last.balanceAfterPiastres !== balance) {
      problems++
      console.error(
        `  FAIL  the last ledger row ends at ${last.balanceAfterPiastres} but the balance is ${balance}`,
      )
    } else {
      console.log('  ok    the last ledger row ends at the current balance')
    }
  }

  if (problems > 0) {
    console.error(`\n${problems} problem(s) found.`)
    process.exit(1)
  }
  console.log('\nplatform wallet is in sync')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
