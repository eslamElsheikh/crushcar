/**
 * Checks the seat-limit rules.
 *
 * Run: npx tsx scripts/verify-booking-limits.ts
 *
 * The limits are two different ceilings that compose, and the failure mode of
 * each is different: the per-booking ceiling is a plain comparison, while the
 * per-trip quota is a comparison against what the company already holds. Both
 * are checked here against the shapes the real code passes, because a limit
 * that reads the wrong field is invisible until it blocks a real booking.
 */
import {
  DEFAULT_MAX_SEATS_PER_BOOKING,
  SEAT_HOLDING_STATUSES,
  effectiveMaxSeatsPerBooking,
  effectiveTripQuota,
  fitsQuota,
  quotaUsage,
} from '../src/lib/booking-limits'

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('per-booking ceiling')
check('the default is 10 seats', DEFAULT_MAX_SEATS_PER_BOOKING === 10, String(DEFAULT_MAX_SEATS_PER_BOOKING))
check('a company with no override gets the default', effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: null }) === 10)
check('a company with no row gets the default', effectiveMaxSeatsPerBooking(null) === 10)
check('a company with no row at all gets the default', effectiveMaxSeatsPerBooking(undefined) === 10)
check('an override wins', effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: 25 }) === 25)
check('an override of 1 is honoured', effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: 1 }) === 1)
check('an override of 0 falls back to the default', effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: 0 }) === 10, '0 is not a valid ceiling')
check('a negative override falls back to the default', effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: -5 }) === 10)
check('a fractional override is floored', effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: 7.8 }) === 7)
check('a non-finite override falls back', effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: NaN }) === 10)

console.log('per-trip quota')
check('no row means no limit', effectiveTripQuota(null) === null)
check('a null maxSeats means no limit', effectiveTripQuota({ maxSeats: null }) === null)
check('a limit is honoured', effectiveTripQuota({ maxSeats: 15 }) === 15)
check('a limit of 0 means no limit', effectiveTripQuota({ maxSeats: 0 }) === null, '0 is not a valid ceiling')
check('a negative limit means no limit', effectiveTripQuota({ maxSeats: -1 }) === null)
check('a fractional limit is floored', effectiveTripQuota({ maxSeats: 15.9 }) === 15)

console.log('what is left of an allowance')
const usage = quotaUsage(10, 15)
check('remaining is the limit minus the used seats', usage.remaining === 5, JSON.stringify(usage))
check('used is reported', usage.used === 10)
check('an unlimited quota has no remaining count', quotaUsage(10, null).remaining === null)
check('over-used never goes negative', quotaUsage(20, 15).remaining === 0, JSON.stringify(quotaUsage(20, 15)))

console.log('whether a booking fits')
check('a booking that fits is allowed', fitsQuota(10, 15, 5))
check('a booking that exactly fills the allowance is allowed', fitsQuota(10, 15, 5))
check('a booking past the allowance is refused', !fitsQuota(10, 15, 6))
check('the first booking against a limit is allowed', fitsQuota(0, 15, 15))
check('one seat past the limit is refused', !fitsQuota(0, 15, 16))
check('an unlimited quota always allows', fitsQuota(999, null, 500))
check('a limit of 10 allows exactly ten', fitsQuota(0, 10, 10))
check('a limit of 10 refuses eleven', !fitsQuota(0, 10, 11))

console.log('the example from the plan')
// A 15-seat trip allowance with a 10-seat per-booking ceiling: the company
// books 10, then 5, and is refused after that.
const limit = effectiveTripQuota({ maxSeats: 15 })
const perBooking = effectiveMaxSeatsPerBooking({ maxSeatsPerBooking: null })
let used = 0
check('the first booking of 10 fits', fitsQuota(used, limit, 10) && 10 <= perBooking)
used += 10
check('the second booking of 5 fits', fitsQuota(used, limit, 5) && 5 <= perBooking)
used += 5
check('a third booking is refused by the trip quota', !fitsQuota(used, limit, 1))
check('and by the per-booking ceiling if it were larger', 11 > perBooking)

console.log('the statuses that hold a seat')
check('PENDING holds a seat', SEAT_HOLDING_STATUSES.includes('PENDING'))
check('PAID holds a seat', SEAT_HOLDING_STATUSES.includes('PAID'))
check('BOARDED holds a seat', SEAT_HOLDING_STATUSES.includes('BOARDED'))
check('CANCELLED does not hold a seat', !SEAT_HOLDING_STATUSES.includes('CANCELLED' as any))

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
