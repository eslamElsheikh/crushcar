#!/usr/bin/env node
/**
 * Derives routeKey and travelDate for trips that do not have them yet.
 *
 * Run: npx tsx scripts/backfill-route-keys.ts [--apply]
 *
 * Without --apply it only reports. The migration adds the two columns empty,
 * so every existing trip needs them filled before a daily quota can be
 * counted against it.
 *
 * A trip with no TripStop rows has no route identity and stays null. Such
 * trips exist and are searchable — they are simply outside the quota, and
 * they are listed here so nobody is surprised by it.
 *
 * ── Writing to production ─────────────────────────────────────────────
 *
 * Unlike the verification scripts, this one is *meant* to run against
 * production eventually — the columns have to be filled there too. So it is
 * not blocked by the test-database guard; instead:
 *
 *   - a dry run is the default, and is safe anywhere;
 *   - --apply against a test database just writes;
 *   - --apply against anything else refuses, unless
 *     SAFRO_BACKFILL_APPLY_PRODUCTION=1 is also set.
 *
 * That last step is deliberate: filling two columns on every trip is a
 * production data change, and it should take two explicit decisions rather
 * than one flag typed from memory.
 */
import { prisma } from '../src/lib/prisma'
import { routeKeyOfStops, travelDateOf } from '../src/lib/route-key'
import { isTestDatabase } from './lib/test-db-guard'

const apply = process.argv.includes('--apply')
const CONFIRM_PRODUCTION = 'SAFRO_BACKFILL_APPLY_PRODUCTION'

async function main() {
  if (apply) {
    const test = isTestDatabase()
    if (!test.ok && process.env[CONFIRM_PRODUCTION] !== '1') {
      console.error(
        `Refusing to write to "${test.name}": ${test.reason}.\n\n` +
          `This fills routeKey and travelDate on every trip. Against production\n` +
          `that is a data change, so it takes two explicit decisions:\n\n` +
          `  ${CONFIRM_PRODUCTION}=1 npx tsx scripts/backfill-route-keys.ts --apply\n\n` +
          `Take a backup first. A dry run (no --apply) is always safe.`,
      )
      process.exit(1)
    }
    if (!test.ok) {
      console.log(
        `writing to "${test.name}" — this is not a test database, and ` +
          `${CONFIRM_PRODUCTION}=1 was set`,
      )
    }
  }

  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      departure: true,
      routeKey: true,
      travelDate: true,
      origin: true,
      destination: true,
      tripStops: { select: { stationId: true, stopOrder: true }, orderBy: { stopOrder: 'asc' } },
    },
  })

  const missing = trips.filter((t) => !t.routeKey || !t.travelDate)
  const noStops = missing.filter((t) => t.tripStops.length === 0)
  const derivable = missing.filter((t) => t.tripStops.length > 0)

  console.log(`trips total            : ${trips.length}`)
  console.log(`missing a key          : ${missing.length}`)
  console.log(`  of those, no stops   : ${noStops.length}  (no route identity — left null)`)
  console.log(`  of those, derivable  : ${derivable.length}`)

  if (noStops.length > 0) {
    console.log('\ntrips with no stops (outside every quota bucket):')
    for (const t of noStops.slice(0, 20)) {
      console.log(`  ${t.id}  ${t.origin} → ${t.destination}  ${t.departure.toISOString().slice(0, 10)}`)
    }
    if (noStops.length > 20) console.log(`  … and ${noStops.length - 20} more`)
  }

  if (!apply) {
    console.log('\ndry run. re-run with --apply to write the keys.')
    return
  }

  let written = 0
  for (const t of derivable) {
    const routeKey = routeKeyOfStops(t.tripStops)
    const travelDate = travelDateOf(t.departure)
    if (!routeKey || !travelDate) continue
    await prisma.trip.update({ where: { id: t.id }, data: { routeKey, travelDate } })
    written++
  }
  console.log(`\nwrote ${written} trip keys`)

  const stillMissing = await prisma.trip.count({
    where: { OR: [{ routeKey: null }, { travelDate: null }] },
  })
  console.log(`trips still without a key: ${stillMissing} (these are the ones with no stops)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
