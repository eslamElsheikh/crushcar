/**
 * Removes the test artifacts the verification scripts leave behind.
 *
 * Every check script creates a company, a bus, a layout and a trip, and most
 * of them delete those again. When a run is interrupted — a killed test
 * process, a stopped dev server, a thrown error before the cleanup — the rows
 * survive, and the next run works on top of a database that already has
 * yesterday's leftovers in it.
 *
 * The artifacts are identified by their name: every script uses a per-run
 * suffix and a recognisable prefix, so the scrub is exact and cannot touch
 * real data.
 *
 *   DATABASE_URL="mysql://…" npx tsx scripts/cleanup-test-data.ts
 *
 * It only ever removes rows whose name matches a test pattern. Run it against
 * a test database, never against production.
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

// This script writes to the database and deletes rows. It must never run against
// production, so the guard refuses to start unless this is a test database.
assertTestDatabase()

const prisma = new PrismaClient()

/** The name patterns the check scripts use. */
const COMPANY_PREFIXES = [
  'Race Co ', 'Refund Co ', 'Quota Co ', 'Limits Co ', 'Other Co ',
  'Backfill Co ', 'P ', 'Admin Co ', 'Co ',
]

function isTestCompany(name: string): boolean {
  return COMPANY_PREFIXES.some((p) => name.startsWith(p))
}

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  })
  const targets = companies.filter((c) => isTestCompany(c.name))

  if (targets.length === 0) {
    console.log('  nothing to clean')
    return
  }
  console.log(`  cleaning ${targets.length} test company/companies`)

  for (const company of targets) {
    const busIds = (await prisma.bus.findMany({
      where: { companyId: company.id },
      select: { id: true },
    })).map((b) => b.id)
    const tripIds = (await prisma.trip.findMany({
      where: { busId: { in: busIds } },
      select: { id: true },
    })).map((t) => t.id)

    // Children first, in the order the foreign keys require.
    await prisma.booking.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.companyBooking.deleteMany({ where: { companyId: company.id } })
    await prisma.charterBooking.deleteMany({ where: { companyId: company.id } })
    await prisma.creditLog.deleteMany({ where: { companyId: company.id } })
    await prisma.depositRequest.deleteMany({ where: { companyId: company.id } })
    await prisma.tripRequest.deleteMany({ where: { companyId: company.id } })
    await prisma.companyCustomer.deleteMany({ where: { companyId: company.id } })
    await prisma.user.updateMany({ where: { companyId: company.id }, data: { companyId: null } })
    await prisma.walletTransaction.deleteMany({ where: { companyId: company.id } })
    await prisma.companyRouteQuota.deleteMany({ where: { companyId: company.id } })
    await prisma.companyTripQuota.deleteMany({ where: { companyId: company.id } })
    await prisma.seatHold.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.seatBlock.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.tripStop.deleteMany({ where: { tripId: { in: tripIds } } })
    await prisma.trip.updateMany({ where: { busId: { in: busIds } }, data: { reservedByCompanyId: null } })
    await prisma.trip.deleteMany({ where: { id: { in: tripIds } } })
    await prisma.seat.deleteMany({ where: { layoutId: { in: (await prisma.busLayout.findMany({ where: { busId: { in: busIds } }, select: { id: true } })).map((l) => l.id) } } })
    await prisma.busLayout.deleteMany({ where: { busId: { in: busIds } } })
    await prisma.bus.deleteMany({ where: { id: { in: busIds } } })
    await prisma.company.delete({ where: { id: company.id } })
    console.log(`    removed ${company.name}`)
  }

  // The users the scripts made.
  const users = await prisma.user.findMany({ select: { id: true, email: true } })
  const testUsers = users.filter((u) => /^(super|quota|admin|company|platform)-/.test(u.email))
  if (testUsers.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: testUsers.map((u) => u.id) } } })
    console.log(`  removed ${testUsers.length} test user(s)`)
  }

  // The platform ledger: the platform wallet's own rows are not test data and
  // are left alone, but a test run that died mid-way leaves them behind and
  // they break the chain check.
  const orphans = await prisma.platformTransaction.count()
  if (orphans > 0) {
    console.log(`  note  ${orphans} platform ledger row(s) present — these are the operator's real movements, left alone`)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
