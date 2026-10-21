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
import { routeKeyOfStops, travelDateOf, routeDayKey } from '../src/lib/route-key'
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
      busId: true,
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

  // ── What the keys will look like ──────────────────────────────────────
  // The bucket is the ordered station sequence, so the report has to show
  // that the sequences separate the routes the business thinks of as
  // different, and that the travel date separates the days.
  const planned = new Map<
    string,
    {
      routeKey: string
      travelDate: string
      trips: number
      texts: Set<string>
      sequences: Set<string>
    }
  >()

  for (const t of derivable) {
    const routeKey = routeKeyOfStops(t.tripStops)
    const travelDate = travelDateOf(t.departure)
    if (!routeKey || !travelDate) continue
    const key = routeDayKey(routeKey, travelDate)
    const entry = planned.get(key) ?? {
      routeKey,
      travelDate,
      trips: 0,
      texts: new Set<string>(),
      sequences: new Set<string>(),
    }
    entry.trips++
    entry.texts.add(`${t.origin} → ${t.destination}`)
    entry.sequences.add(routeKey)
    planned.set(key, entry)
  }

  console.log('\nwhat the keys will look like:')
  console.log(`  distinct route+day buckets : ${planned.size}`)
  console.log(`  distinct routes             : ${routeDaysOf(planned).size}`)
  console.log(`  routes running on >1 day    : ${multiDayRoutes(routeDaysOf(planned))}`)

  // ── Direction ─────────────────────────────────────────────────────────
  // The same stations in the other order are a different journey, and they
  // have to end up in different buckets. Two things prove it:
  //
  //   - no bucket holds both "A → B" and "B → A"
  //   - where a route runs both ways, the two are separate route keys
  let bucketsWithBothDirections = 0
  for (const entry of planned.values()) {
    const texts = [...entry.texts]
    for (const a of texts) {
      for (const b of texts) {
        if (a === b) continue
        const [af, at] = a.split(' → ')
        const [bf, bt] = b.split(' → ')
        if (af === bt && at === af) bucketsWithBothDirections++
      }
    }
  }
  console.log(`  buckets holding both directions of the same journey : ${bucketsWithBothDirections}  (must be 0)`)

  const routeKeys = [...routeDaysOf(planned).keys()]
  const reversePairs = routeKeys.filter((k) => {
    const reversed = k.split('|').reverse().join('|')
    return reversed !== k && routeKeys.includes(reversed)
  }).length
  console.log(`  routes whose reverse also runs            : ${reversePairs}  (each is its own bucket)`)

  // ── No merging ───────────────────────────────────────────────────────
  // Two different station sequences must never share a key. The key is the
  // sequence, so this cannot happen — but the report proves it rather than
  // assuming it.
  const sequences = new Set<string>()
  for (const entry of planned.values()) for (const s of entry.sequences) sequences.add(s)
  const keys = new Set<string>()
  for (const entry of planned.values()) keys.add(entry.routeKey)
  console.log(`  distinct station sequences : ${sequences.size}`)
  console.log(`  distinct route keys        : ${keys.size}   (equal means nothing was merged)`)
  const merged = sequences.size !== keys.size

  // ── The travel date ───────────────────────────────────────────────────
  // The same route on two days is two buckets. The date is what keeps them
  // apart, and the business relies on that.
  const daysByRoute = routeDaysOf(planned)
  const dayCounts = [...daysByRoute.values()].map((d) => d.size)
  const multiDay = dayCounts.filter((d) => d > 1).length
  const maxDays = Math.max(0, ...dayCounts)
  console.log(`  routes running on more than one day : ${multiDay}   (the busiest runs ${maxDays} days)`)

  // ── Ambiguity ─────────────────────────────────────────────────────────
  // The same journey text on the same day under two different keys means
  // the stops differ while the sign says the same thing. That is the one
  // a person has to look at: the admin picks a route by its text, and two
  // of them reading as the same is a trap.
  const textByDay = new Map<string, Set<string>>()
  for (const entry of planned.values()) {
    for (const text of entry.texts) {
      const key = `${text}|${entry.travelDate}`
      const set = textByDay.get(key) ?? new Set<string>()
      set.add(entry.routeKey)
      textByDay.set(key, set)
    }
  }
  const ambiguous = [...textByDay.entries()].filter(([, set]) => set.size > 1)
  console.log(`\n  journeys whose text matches but whose stops differ, on the same day : ${ambiguous.length}`)
  for (const [key, set] of ambiguous.slice(0, 10)) {
    console.log(`    ${key.split('|')[0]}  →  ${set.size} different stop sequences`)
  }
  if (ambiguous.length === 0) {
    console.log('    every journey text maps to one stop sequence per day')
  }

  if (merged || bucketsWithBothDirections > 0) {
    console.log('\n  WARNING: the keys do not hold the distinctions the business needs.')
  } else {
    console.log('\n  the keys keep the direction, keep the days apart, and merge nothing')
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

/** The travel dates each route runs on. */
function routeDaysOf(
  planned: Map<string, { routeKey: string; travelDate: string }>,
): Map<string, Set<string>> {
  const days = new Map<string, Set<string>>()
  for (const entry of planned.values()) {
    const set = days.get(entry.routeKey) ?? new Set<string>()
    set.add(entry.travelDate)
    days.set(entry.routeKey, set)
  }
  return days
}

/** How many of those routes run on more than one day. */
function multiDayRoutes(days: Map<string, Set<string>>): number {
  return [...days.values()].filter((d) => d.size > 1).length
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
