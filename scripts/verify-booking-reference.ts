/**
 * Exercises the booking reference counter against the real database.
 *
 * Run: npx tsx scripts/verify-booking-reference.ts
 *
 * Checks the three things that are easy to get wrong and impossible to see in
 * review: the counter actually increments, concurrent draws never hand out the
 * same serial, and the reference has the agreed shape.
 */
import { prisma, dbDialect } from '../src/lib/prisma'
import { nextBookingRef, nextBookingSerial, formatReference, withRefRetry, isRetryableRefError } from '../src/lib/booking-reference'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const year = new Date().getFullYear()
  const key = String(year)

  console.log('formatReference')
  const shaped = formatReference({
    fromStation: 'القاهرة',
    toStation: 'الإسكندرية',
    seatLabel: 'A1',
    serial: 42,
    at: new Date(`${year}-06-01T10:00:00Z`),
  })
  check('shape is ST-FROM-TO-SEAT-YY-SERIAL', /^ST-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]+-\d{2}-\d{6}$/.test(shaped), shaped)
  check('mapped stations use their code', shaped.startsWith('ST-CAI-ALX-'), shaped)
  check('serial is zero padded to six', shaped.endsWith(`-${String(year).slice(-2)}-000042`), shaped)

  const unmapped = formatReference({
    fromStation: 'مدينة نصر',
    toStation: 'الهرم',
    seatLabel: 'b 7',
    serial: 7,
    at: new Date(`${year}-06-01T10:00:00Z`),
  })
  check('unmapped stations still yield 3 ASCII letters', /^ST-[A-Z]{3}-[A-Z]{3}-B7-\d{2}-000007$/.test(unmapped), unmapped)

  console.log('counter')
  await prisma.referenceCounter.deleteMany({ where: { id: key } })

  const first = await prisma.$transaction((tx) => nextBookingSerial(tx))
  const second = await prisma.$transaction((tx) => nextBookingSerial(tx))
  const third = await prisma.$transaction((tx) => nextBookingSerial(tx))
  check('starts at 1', first === 1, `got ${first}`)
  check('increments by one', second === 2 && third === 3, `got ${second}, ${third}`)

  const row = await prisma.referenceCounter.findUniqueOrThrow({ where: { id: key } })
  check('persisted value matches the last serial', row.value === 3, `row.value=${row.value}`)

  console.log('concurrent draws')
  // Ten parallel transactions on one counter row. If the bump were a read
  // followed by a write, two of these would read the same value.
  const serials = await Promise.all(
    Array.from({ length: 10 }, () => prisma.$transaction((tx) => nextBookingSerial(tx))),
  )
  const unique = new Set(serials)
  check('ten parallel draws produce ten distinct serials', unique.size === 10, `got ${[...serials].sort((a, b) => a - b).join(',')}`)
  check('serials are contiguous', Math.max(...serials) === 13 && Math.min(...serials) === 4, `range ${Math.min(...serials)}..${Math.max(...serials)}`)

  console.log('roll back')
  const beforeRollback = (await prisma.referenceCounter.findUniqueOrThrow({ where: { id: key } })).value
  try {
    await prisma.$transaction(async (tx) => {
      await nextBookingSerial(tx)
      throw new Error('forced rollback')
    })
  } catch {
    /* expected */
  }
  const afterRollback = (await prisma.referenceCounter.findUniqueOrThrow({ where: { id: key } })).value
  check('a rolled back booking does not burn a serial', beforeRollback === afterRollback, `${beforeRollback} -> ${afterRollback}`)

  console.log('nextBookingRef')
  const ref = await prisma.$transaction((tx) =>
    nextBookingRef(tx, { fromStation: 'طنطا', toStation: 'أسوان', seatLabel: 'C12' }),
  )
  check('reference embeds the counter value', ref.endsWith(`-${String(year).slice(-2)}-${String(beforeRollback + 1).padStart(6, '0')}`), ref)
  check('reference starts with ST and uses station codes', ref.startsWith('ST-TNT-ASW-C12-'), ref)

  // ── First bookings of a year the counter has never seen ──────────────
  // Two transactions race to INSERT the missing counter row. This is the
  // case Prisma's upsert would lose on MySQL, where it is emulated as a
  // read followed by a write instead of one atomic statement.
  console.log('new year, missing counter row')
  const futureKey = String(year + 7)
  const futureDate = new Date(`${futureKey}-03-04T09:00:00Z`)
  await prisma.referenceCounter.deleteMany({ where: { id: futureKey } })

  let yearRaceError: unknown = null
  const yearRace = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      withRefRetry(() => prisma.$transaction((tx) => nextBookingSerial(tx, futureDate))),
    ),
  )
  for (const r of yearRace) if (r.status === 'rejected') yearRaceError = r.reason
  const futureSerials = yearRace.filter((r) => r.status === 'fulfilled').map((r: any) => r.value as number)
  check('five concurrent first bookings of an unseen year all succeed', yearRaceError === null, String(yearRaceError))
  check('...and they get five distinct serials', new Set(futureSerials).size === 5, futureSerials.join(','))
  check('...numbered 1..5', JSON.stringify([...futureSerials].sort((a, b) => a - b)) === '[1,2,3,4,5]', futureSerials.join(','))
  const futureRow = await prisma.referenceCounter.findUniqueOrThrow({ where: { id: futureKey } })
  check('...and the stored row agrees', futureRow.value === 5, `row.value=${futureRow.value}`)
  await prisma.referenceCounter.deleteMany({ where: { id: futureKey } })

  // ── Sustained contention ────────────────────────────────────────────
  // 50 bookings at once, all serialising on one counter row. Reported
  // rather than asserted: on MySQL/MariaDB some retries are expected, and a
  // run that needed zero retries on a loaded box would itself be the signal.
  // ── Sustained contention ────────────────────────────────────────────
  // 50 bookings at once, all serialising on one counter row. Reported rather
  // than asserted: on MySQL/MariaDB some retries are expected under load, and
  // a run that needed zero retries would itself be the signal.
  //
  // SQLite takes a different number. It has a single writer, so N concurrent
  // write transactions serialise into N sequential ones and Prisma's 5s
  // interactive-transaction timeout expires long before 50 can queue
  // (P1008/P2028). That is a property of SQLite, not of the counter — dev
  // never books that hard, and production is MariaDB — so the stress is sized
  // to what the engine can actually do and the size used is printed.
  const isMysql = dbDialect() === 'mysql'
  const contention = isMysql ? 50 : 10
  console.log(`fifty concurrent bookings (${contention} on ${dbDialect()})`)
  const base = (await prisma.referenceCounter.findUniqueOrThrow({ where: { id: key } })).value
  let retries = 0
  let p2034 = 0
  let otherErrors = 0
  const outcomes = await Promise.allSettled(
    Array.from({ length: contention }, () =>
      withRefRetry(() => prisma.$transaction((tx) => nextBookingSerial(tx)), 5).catch((e) => {
        if (e?.code === 'P2034') p2034++
        throw e
      }),
    ),
  )
  const rejected = outcomes.filter((r) => r.status === 'rejected')
  for (const r of rejected) {
    const reason: any = (r as PromiseRejectedResult).reason
    if (isRetryableRefError(reason)) retries++
    else otherErrors++
  }
  const fiftySerials = outcomes.filter((r) => r.status === 'fulfilled').map((r: any) => r.value as number)
  console.log(`  INFO  n=${contention} fulfilled=${fiftySerials.length} distinct=${new Set(fiftySerials).size} P2034=${p2034} retryable=${retries} other=${otherErrors}`)
  check('every concurrent booking succeeded', rejected.length === 0, rejected.map((r: any) => r.reason?.code ?? r.reason?.message).join(' | '))
  check('...with distinct serials', new Set(fiftySerials).size === fiftySerials.length, `${new Set(fiftySerials).size} distinct`)
  check('...and no unhandled error type', otherErrors === 0, `${otherErrors} unexpected`)
  const fiftyRow = await prisma.referenceCounter.findUniqueOrThrow({ where: { id: key } })
  check('...counter advanced by exactly that many', fiftyRow.value === base + fiftySerials.length, `${base} -> ${fiftyRow.value}`)

  await prisma.referenceCounter.deleteMany({ where: { id: key } })
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})