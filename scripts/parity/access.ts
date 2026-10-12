/**
 * Access rules for the fleet endpoints and the customer trip payload.
 *
 *   npx tsx scripts/parity/access.ts
 *
 * The endpoint handlers are Next.js route handlers, so the rules are asserted
 * here as plain functions mirroring them. They are small and were written to be
* readable rather than clever; the point is that a future edit that widens one
 * of these gates has something to fail.
 */

// Without an import or export this file is a script, not a module, so its
// top-level names would land in the global scope and collide with the other
// check scripts during a project-wide typecheck.
export {};

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

type Role = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER';

/** Mirrors GET /api/buses, /api/buses/[id], /layout and /stations. */
function fleetReadAllowed(role: Role): { status: number } {
  if (role !== 'SUPER_ADMIN') return { status: 403 };
  return { status: 200 };
}

/** Mirrors the customer-facing guard on GET /api/trips/[id]. */
function tripDetailVisible(
  role: Role,
  trip: { bookingMode: string; reservedByCompanyId: string | null; departure: Date },
  isBookableByCustomer: (d: Date, n: Date) => boolean,
  now = new Date(),
): { status: number } {
  if (role === 'SUPER_ADMIN') return { status: 200 };
  if (trip.bookingMode === 'BUS' || trip.reservedByCompanyId) return { status: 404 };
  if (role === 'CUSTOMER' ? !isBookableByCustomer(trip.departure, now) : trip.departure.getTime() <= now.getTime()) {
    return { status: 404 };
  }
  return { status: 200 };
}

/** The booking columns a non-admin may see. */
const SEAT_ONLY = ['seatLabel', 'fromStopOrder', 'toStopOrder'];
const ADMIN_BOOKING_FIELDS = [
  'userId', 'passengerName', 'passengerPhone', 'passengerHotel', 'paymentProofUrl',
  'paymentNotes', 'paymentRejectReason', 'paymentStatus', 'total', 'reference',
];

function bookingFieldsFor(role: Role): string[] {
  return role === 'SUPER_ADMIN' ? [...ADMIN_BOOKING_FIELDS, 'user'] : SEAT_ONLY;
}

// A stand-in for the real predicate: bookable while the bus is at least
// CUSTOMER_BOOKING_CUTOFF_MINUTES away.
const cutoff = 30;
const bookable = (d: Date, n: Date) => d.getTime() - n.getTime() >= cutoff * 60_000;

const now = new Date('2026-10-12T10:00:00Z');
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

console.log('fleet reads (GET /api/buses, /[id], /layout, /stations)');
check('super admin reads the fleet', fleetReadAllowed('SUPER_ADMIN').status, 200);
check('company admin is refused', fleetReadAllowed('COMPANY_ADMIN').status, 403);
check('customer is refused', fleetReadAllowed('CUSTOMER').status, 403);

console.log('\ncustomer trip payload');
check('admin booking rows keep passenger detail', bookingFieldsFor('SUPER_ADMIN').includes('passengerName'), true);
check('customer booking rows are seat-only', bookingFieldsFor('CUSTOMER'), SEAT_ONLY);
check('company booking rows are seat-only', bookingFieldsFor('COMPANY_ADMIN'), SEAT_ONLY);
check(
  'no passenger or money field survives for a customer',
  bookingFieldsFor('CUSTOMER').filter((f) => ADMIN_BOOKING_FIELDS.includes(f)),
  [],
);

console.log('\ntrip detail visibility');
const seatTrip = { bookingMode: 'SEAT', reservedByCompanyId: null, departure: hours(5) };
check('admin sees a charter trip', tripDetailVisible('SUPER_ADMIN', { ...seatTrip, bookingMode: 'BUS' }, bookable, now).status, 200);
check('customer cannot open a charter trip', tripDetailVisible('CUSTOMER', { ...seatTrip, bookingMode: 'BUS' }, bookable, now).status, 404);
check('customer cannot open a reserved trip', tripDetailVisible('CUSTOMER', { ...seatTrip, reservedByCompanyId: 'c1' }, bookable, now).status, 404);
check('company cannot open a reserved trip of another', tripDetailVisible('COMPANY_ADMIN', { ...seatTrip, reservedByCompanyId: 'c1' }, bookable, now).status, 404);
check('customer sees a normal trip 5h out', tripDetailVisible('CUSTOMER', seatTrip, bookable, now).status, 200);
check('customer cannot open a trip inside the cutoff', tripDetailVisible('CUSTOMER', { ...seatTrip, departure: hours(0.4) }, bookable, now).status, 404);
check('company still sees a trip 5min before departure', tripDetailVisible('COMPANY_ADMIN', { ...seatTrip, departure: hours(0.08) }, bookable, now).status, 200);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);