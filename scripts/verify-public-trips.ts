/**
 * The public (signed-out visitor) trip payload and visibility policy.
 *
 *   npx tsx scripts/verify-public-trips.ts
 *
 * The mapper under test is the real one the API routes use
 * (src/lib/public-trip.ts), fed a trip row poisoned with every field the
 * schema can attach to a booking: passenger, buyer, payment, company, and
 * internal pricing. Whatever survives the allowlist is what a visitor can
 * read, so this fails if a future edit copies one field too many.
 */

import {
  isPublicTripVisible,
  toPublicTrip,
  toPublicTripDetail,
} from '../src/lib/public-trip';

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

function ok(label: string, condition: boolean, detail = '') {
  if (!condition) failures++;
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition && detail) console.log(`        ${detail}`);
}

/** Every key at any depth of a value, for the leak scan. */
function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.push(key);
      allKeys(child, out);
    }
  }
  return out;
}

/** Every string at any depth, for the canary scan. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) allStrings(child, out);
  }
  return out;
}

const NOW = new Date('2026-10-25T12:00:00.000Z');
const FUTURE = new Date('2026-11-01T08:00:00.000Z');

/**
 * A trip row as fatteningly complete as the schema allows, with canary
 * values in every sensitive field. Nothing here may reach a visitor's
 * response — not as a key, not as a value.
 */
const poisonedTrip = {
  id: 'trip-normal-40',
  busId: 'bus-coach-1',
  origin: 'القاهرة',
  destination: 'الغردقة',
  departure: FUTURE,
  arrival: new Date('2026-11-01T14:00:00.000Z'),
  price: 220,
  status: 'SCHEDULED',
  bookingMode: 'BOTH',
  busPrice: 8000,
  reservedByCompanyId: null,
  stopsJson: '[{"name":"CANARY_INTERNAL"}]',
  routeKey: 'cairo|hurghada',
  travelDate: '2026-11-01',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  // The dated-search decoration, part of the public list payload.
  calculatedPrice: 220,
  boardingTime: null,
  alightingTime: null,
  bus: {
    id: 'bus-coach-1',
    // The bus's display name is public (cards show it); its id and company are not.
    name: 'Airport Luxury Coach',
    type: 'COACH_BUS',
    companyId: 'comp-canary',
    company: { id: 'comp-canary', name: 'CANARY_COMPANY', walletBalance: 999 },
    stations: [{ id: 'bs-1', busId: 'bus-canary', name: 'CANARY_STATION', order: 1 }],
    layout: {
      id: 'layout-1',
      rows: 2,
      cols: 2,
      aisleAfter: 1,
      colsPerRow: '1,1',
      seats: [
        { id: 'seat-1', label: 'A1', row: 1, col: 1, type: 'WINDOW', price: 220 },
        { id: 'seat-2', label: 'A2', row: 1, col: 2, type: 'SEAT', price: 220 },
      ],
    },
  },
  tripStops: [
    {
      id: 'stop-1',
      tripId: 'trip-canary',
      stationId: 'st-cairo',
      stopOrder: 1,
      priceFromOrigin: 0,
      arrivalTime: null,
      departureTime: new Date('2026-11-01T08:05:00.000Z'),
      station: { id: 'st-cairo', name: 'القاهرة', city: 'القاهرة', lat: 30.04, lng: 31.23 },
    },
  ],
  // Occupancy rows as the seat-only query returns them, plus the fat fields
  // a careless `include` would drag along.
  bookings: [
    {
      id: 'bk-canary-1',
      reference: 'CANARY-REF-1',
      tripId: 'trip-canary',
      userId: 'user-canary',
      seatLabel: 'A1',
      passengerName: 'CANARY_PASSENGER',
      passengerPhone: '+20100CANARY',
      passengerHotel: 'CANARY_HOTEL',
      status: 'PAID',
      paidAt: new Date('2026-10-20T00:00:00.000Z'),
      paymentMethod: 'VODAFONE_CASH',
      paymentProofUrl: '/api/uploads/canary-proof.png',
      paymentNotes: 'CANARY_PAYMENT_NOTE',
      paymentStatus: 'PENDING',
      paymentRejectReason: 'CANARY_REJECT',
      fromStopOrder: 1,
      toStopOrder: 2,
      user: { id: 'user-canary', name: 'CANARY_BUYER', email: 'canary@example.com' },
    },
  ],
  companyBookings: [
    {
      id: 'cbk-canary-1',
      companyId: 'comp-canary',
      tripId: 'trip-canary',
      seatLabel: 'A2',
      status: 'PENDING',
      fromStopOrder: 1,
      toStopOrder: 2,
      company: { id: 'comp-canary', name: 'CANARY_COMPANY', walletBalance: 999 },
    },
  ],
  seatHolds: [
    { id: 'hold-canary', tripId: 'trip-canary', seatLabel: 'B1', userId: 'user-canary', expiresAt: new Date() },
  ],
  companyQuota: { maxSeats: 5, used: 1, remaining: 4 },
};

const FORBIDDEN_KEYS = [
  // Booking rows and their identity.
  'reference', 'bookingId', 'userId', 'user', 'tripId', 'companyId',
  'company', 'companyBookingsData',
  // Passenger data.
  'passengerName', 'passengerPhone', 'passengerHotel', 'notes', 'hotel', 'phone', 'email',
  // Payment.
  'paymentMethod', 'paymentProofUrl', 'paymentNotes', 'paymentStatus',
  'paymentRejectReason', 'paidAt', 'walletBalance', 'total',
  // Internal trip economics and relations.
  'busPrice', 'busId', 'reservedByCompanyId', 'stopsJson', 'routeKey',
  'travelDate', 'seatHolds', 'expiresAt', 'companyQuota', 'createdAt',
  'stations', 'company', 'lat', 'lng', 'order',
];

const CANARY_VALUES = [
  'CANARY_PASSENGER', '+20100CANARY', 'CANARY_HOTEL', 'CANARY-REF-1',
  'canary@example.com', 'CANARY_BUYER', 'CANARY_COMPANY', 'CANARY_PAYMENT_NOTE',
  'canary-proof.png', 'CANARY_REJECT', 'CANARY_INTERNAL', 'CANARY_STATION',
  'comp-canary', 'user-canary', 'bus-canary', 'trip-canary', 'hold-canary',
];

console.log('public list payload');
const list = toPublicTrip(poisonedTrip);
const listKeys = allKeys(list);
const listStrings = allStrings(list);
ok(
  'no forbidden key survives at any depth',
  !listKeys.some((k) => FORBIDDEN_KEYS.includes(k)),
  `leaked: ${listKeys.filter((k) => FORBIDDEN_KEYS.includes(k)).join(', ')}`,
);
ok(
  'no canary value survives at any depth',
  !listStrings.some((s) => CANARY_VALUES.includes(s)),
  `leaked: ${listStrings.filter((s) => CANARY_VALUES.includes(s)).join(', ')}`,
);
check('top-level keys are exactly the allowlist', Object.keys(list).sort(), [
  'alightingTime', 'arrival', 'boardingTime', 'bookedSeats', 'bus', 'calculatedPrice',
  'departure', 'destination', 'id', 'origin', 'price', 'status', 'stops', 'tripStops',
].sort());
check('bus keys are the allowlist', list.bus ? Object.keys(list.bus).sort() : null, ['layout', 'name', 'type']);
check(
  'layout seat keys are the allowlist',
  list.bus?.layout?.seats?.[0] ? Object.keys(list.bus.layout.seats[0]).sort() : null,
  ['col', 'id', 'label', 'price', 'row', 'type'],
);
check(
  'stop keys are the allowlist',
  list.tripStops[0] ? Object.keys(list.tripStops[0]).sort() : null,
  ['arrivalTime', 'departureTime', 'priceFromOrigin', 'station', 'stationId', 'stopOrder'],
);
check(
  'station keys are the allowlist',
  list.tripStops[0].station ? Object.keys(list.tripStops[0].station).sort() : null,
  ['city', 'id', 'name'],
);
check('bookedSeats counts customer and company occupancy on the server', list.bookedSeats, 2);
check('stops alias mirrors tripStops', list.stops, list.tripStops);

console.log('\npublic detail payload');
const detail = toPublicTripDetail(poisonedTrip);
const detailKeys = allKeys(detail);
const detailStrings = allStrings(detail);
ok(
  'no forbidden key survives at any depth',
  !detailKeys.some((k) => FORBIDDEN_KEYS.includes(k)),
  `leaked: ${detailKeys.filter((k) => FORBIDDEN_KEYS.includes(k)).join(', ')}`,
);
ok(
  'no canary value survives at any depth',
  !detailStrings.some((s) => CANARY_VALUES.includes(s)),
  `leaked: ${detailStrings.filter((s) => CANARY_VALUES.includes(s)).join(', ')}`,
);
check(
  'occupancy entries carry seat positions only',
  Object.keys(detail.bookings[0]).sort(),
  ['fromStopOrder', 'seatLabel', 'toStopOrder'],
);
check(
  'company occupancy entries carry seat positions only',
  Object.keys(detail.companyBookings[0]).sort(),
  ['fromStopOrder', 'seatLabel', 'toStopOrder'],
);
check('occupancy keeps the seat label the seat map reads', detail.bookings[0].seatLabel, 'A1');
check('detail carries the server-computed count too', detail.bookedSeats, 2);

console.log('\nmissing relations degrade, never throw');
check('a trip with no stops still maps', toPublicTrip({ ...poisonedTrip, tripStops: undefined }).tripStops, []);
check(
  'a trip with no occupancy still counts zero',
  toPublicTrip({ ...poisonedTrip, bookings: undefined, companyBookings: undefined }).bookedSeats,
  0,
);
check('a trip with no bus still maps', toPublicTrip({ ...poisonedTrip, bus: undefined }).bus, null);

console.log('\npublic visibility policy');
const base = { status: 'SCHEDULED', bookingMode: 'SEAT', reservedByCompanyId: null, departure: FUTURE };
check('a scheduled future seat trip is visible', isPublicTripVisible(base, NOW), true);
check('a charter (BUS) trip is hidden', isPublicTripVisible({ ...base, bookingMode: 'BUS' }, NOW), false);
check('a company-reserved trip is hidden', isPublicTripVisible({ ...base, reservedByCompanyId: 'comp-1' }, NOW), false);
check('a completed trip is hidden', isPublicTripVisible({ ...base, status: 'COMPLETED' }, NOW), false);
check('a cancelled trip is hidden', isPublicTripVisible({ ...base, status: 'CANCELLED' }, NOW), false);
check('a past trip is hidden', isPublicTripVisible({ ...base, departure: new Date('2026-10-24T08:00:00.000Z') }, NOW), false);
check(
  'a trip inside the 30-minute customer cutoff is hidden',
  isPublicTripVisible({ ...base, departure: new Date('2026-10-25T12:10:00.000Z') }, NOW),
  false,
);
check(
  'a trip past the cutoff but still upcoming is visible',
  isPublicTripVisible({ ...base, departure: new Date('2026-10-25T14:00:00.000Z') }, NOW),
  true,
);
check('an unparseable departure is hidden', isPublicTripVisible({ ...base, departure: 'not-a-date' }, NOW), false);
check(
  'the legacy BOTH mode (not BUS) stays visible, like the search filter',
  isPublicTripVisible({ ...base, bookingMode: 'BOTH' }, NOW),
  true,
);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
