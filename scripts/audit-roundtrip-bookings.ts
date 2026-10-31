/**
 * T1 — read-only audit of round-trip bookings.
 *
 * It answers one question: which round-trip groups in this database are not
 * shaped the way a round trip must be?
 *
 *   - two legs with a different number of seats,
 *   - legs that do not belong to the same company,
 *   - legs charged through different payment modes,
 *   - a group with only one leg,
 *   - customer Booking rows that duplicate a company group (the old
 *     fall-through bug posted the same seats to /api/bookings).
 *
 * It never writes. Run it against a scratch database:
 *   DATABASE_URL="file:.../.scratch-feedback.db" npx tsx scripts/audit-roundtrip-bookings.ts
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

assertTestDatabase()

const prisma = new PrismaClient()

type Group = {
  roundTripGroupId: string
  companyIds: Set<string>
  trips: Map<string, { count: number; paidFromWallet: number; paidOnCredit: number }>
  bookings: Array<{ id: string; reference: string; tripId: string; companyId: string; status: string }>
}

async function main() {
  const rows = await prisma.companyBooking.findMany({
    where: { roundTripGroupId: { not: null } },
    select: {
      id: true,
      reference: true,
      companyId: true,
      tripId: true,
      roundTripGroupId: true,
      status: true,
      paidFromWallet: true,
      paidOnCredit: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const groups = new Map<string, Group>()
  for (const row of rows) {
    const key = row.roundTripGroupId!
    if (!groups.has(key)) {
      groups.set(key, { roundTripGroupId: key, companyIds: new Set(), trips: new Map(), bookings: [] })
    }
    const group = groups.get(key)!
    group.companyIds.add(row.companyId)
    group.bookings.push(row)
    const trip = group.trips.get(row.tripId) ?? { count: 0, paidFromWallet: 0, paidOnCredit: 0 }
    trip.count += 1
    trip.paidFromWallet += row.paidFromWallet
    trip.paidOnCredit += row.paidOnCredit
    group.trips.set(row.tripId, trip)
  }

  let problems = 0
  console.log(`round-trip groups: ${groups.size}`)
  for (const group of groups.values()) {
    const issues: string[] = []
    const counts = [...group.trips.values()].map((t) => t.count)
    if (group.trips.size === 1) {
      issues.push('only one leg exists')
    } else if (new Set(counts).size > 1) {
      issues.push(`leg seat counts differ: ${counts.join(' vs ')}`)
    }
    if (group.companyIds.size > 1) {
      issues.push(`legs belong to ${group.companyIds.size} companies`)
    }
    const modes = new Set(
      [...group.trips.values()].map((t) => (t.paidOnCredit > 0 ? 'CREDIT' : t.paidFromWallet > 0 ? 'WALLET' : 'UNCHARGED')),
    )
    if (modes.size > 1) issues.push(`payment modes differ: ${[...modes].join(', ')}`)

    if (issues.length > 0) {
      problems += 1
      console.log(`\nPROBLEM ${group.roundTripGroupId}`)
      for (const issue of issues) console.log(`  - ${issue}`)
      for (const b of group.bookings) {
        console.log(`    ${b.reference} trip=${b.tripId} company=${b.companyId} status=${b.status}`)
      }
    }
  }

  // Customer rows that share a company round-trip group are the signature of
  // the old COMPANY_ADMIN fall-through: the same seats were posted twice.
  const groupIds = [...groups.keys()]
  const duplicateCustomerRows = groupIds.length
    ? await prisma.booking.findMany({
        where: { roundTripGroupId: { in: groupIds } },
        select: { id: true, reference: true, roundTripGroupId: true, status: true, userId: true },
      })
    : []
  if (duplicateCustomerRows.length > 0) {
    problems += 1
    console.log(`\nPROBLEM customer rows duplicating a company round trip: ${duplicateCustomerRows.length}`)
    for (const b of duplicateCustomerRows) {
      console.log(`  ${b.reference} group=${b.roundTripGroupId} status=${b.status} user=${b.userId}`)
    }
  }

  console.log(`\n${problems === 0 ? 'no round-trip problems found' : `${problems} problem group(s) found`}`)
  process.exitCode = problems === 0 ? 0 : 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
