/**
 * T1 — proposed repair for round-trip data left by the old company-booking
 * fall-through bug.
 *
 * Dry run (default): prints what it would do, changes nothing.
 *
 *   DATABASE_URL="file:.../.scratch-feedback.db" npx tsx scripts/repair-roundtrip-bookings.ts
 *
 * Apply (scratch/test databases only): cancels the duplicate customer rows
 * whose status is still PENDING, so the seats are released and the admin's
 * "customers" tab stops showing a company booking. It never touches a PAID
 * customer row, never moves money, and never edits a company booking: a
 * mismatched company leg has to be cancelled through the normal admin
 * cancellation flow so the refund is recorded and processed there.
 *
 *   DATABASE_URL="file:.../.scratch-feedback.db" npx tsx scripts/repair-roundtrip-bookings.ts --apply --yes
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

assertTestDatabase()

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const YES = process.argv.includes('--yes')

async function main() {
  if (APPLY && !YES) {
    console.error('Refusing to apply without --yes.')
    process.exitCode = 2
    return
  }

  const groups = await prisma.companyBooking.findMany({
    where: { roundTripGroupId: { not: null } },
    select: { companyId: true, tripId: true, roundTripGroupId: true },
  })
  const groupIds = [...new Set(groups.map((g) => g.roundTripGroupId!))]
  if (groupIds.length === 0) {
    console.log('no company round-trip groups found')
    return
  }

  const duplicates = await prisma.booking.findMany({
    where: { roundTripGroupId: { in: groupIds } },
    select: { id: true, reference: true, status: true, roundTripGroupId: true },
    orderBy: { createdAt: 'asc' },
  })

  const cancellable = duplicates.filter((b) => b.status === 'PENDING')
  const blocked = duplicates.filter((b) => b.status === 'PAID' || b.status === 'BOARDED')

  console.log(`company round-trip groups: ${groupIds.length}`)
  console.log(`customer rows duplicating them: ${duplicates.length}`)
  console.log(`  safe to cancel (PENDING): ${cancellable.length}`)
  console.log(`  require manual review (PAID/BOARDED): ${blocked.length}`)

  for (const b of cancellable) {
    console.log(`  would cancel ${b.reference} (group ${b.roundTripGroupId})`)
  }
  for (const b of blocked) {
    console.log(`  MANUAL REVIEW ${b.reference} is ${b.status} — do not auto-cancel a paid seat`)
  }

  if (blocked.length > 0) {
    console.log('\nSome duplicate rows are paid. Refusing to apply automatically; review them first.')
    process.exitCode = 1
    return
  }

  if (!APPLY) {
    console.log('\ndry run only — pass --apply --yes to cancel the PENDING duplicates')
    return
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date()
    return tx.booking.updateMany({
      where: { id: { in: cancellable.map((b) => b.id) }, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationReason: 'round-trip repair: duplicate customer booking from company fall-through',
      },
    })
  })
  console.log(`cancelled ${result.count} duplicate customer row(s); no money was moved`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
