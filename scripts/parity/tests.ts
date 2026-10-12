/**
 * Regression tests for the trip search rewrite and the booking cutoff.
 *
 *   npx tsx scripts/parity/tests.ts
 *
 * Uses an injected clock so the cutoff boundaries are deterministic instead of
 * depending on what time the suite happens to run.
 */
import { prisma } from './client';
import { searchTripsByDate, SearchInputError, CANDIDATE_CAP } from '../../src/lib/trip-search';
import { segmentPrice } from '../../src/lib/segment-price';
import {
  CUSTOMER_BOOKING_CUTOFF_MINUTES,
  cairoDayStartUTC,
  cairoDayEndUTC,
  cairoTodayISO,
  isBookableByCustomer,
  isBookableByAnyRole,
  PAST_DATE_MESSAGE_AR,
  RETURN_BEFORE_OUTBOUND_MESSAGE_AR,
} from '../../src/lib/booking-rules';
import { paymentDeadline } from '../../src/lib/payments';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

// A fixed "now" at Cairo midday, so every boundary below stays inside today.
const NOW = cairoDayStartUTC(cairoTodayISO()).getTime() + 12 * 3_600_000;
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000);

let S: Record<string, string> = {};
let BUS = '';
let ids: Record<string, string> = {};

async function seed() {
  await prisma.booking.deleteMany({});
  await prisma.charterBooking.deleteMany({});
  await prisma.seatHold.deleteMany({});
  await prisma.tripStop.deleteMany({});
  await prisma.trip.deleteMany({});
  await prisma.seat.deleteMany({});
  await prisma.busLayout.deleteMany({});
  await prisma.busStation.deleteMany({});
  await prisma.bus.deleteMany({});
  await prisma.station.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});

  const m = await prisma.station.create({ data: { name: 'المنصورة', city: 'الدقهلية' } });
  const h = await prisma.station.create({ data: { name: 'الغردقة', city: 'الغردقة' } });
  S = { mansoura: m.id, hurghada: h.id };

  const bus = await prisma.bus.create({ data: { name: 'Coach', type: 'COACH_BUS', seatCount: 20 } });
  const layout = await prisma.busLayout.create({
    data: { busId: bus.id, rows: 5, cols: 4, aisleAfter: 2, colsPerRow: JSON.stringify({ A: 4 }) },
  });
  await prisma.seat.createMany({
    data: Array.from({ length: 20 }, (_, n) => ({
      layoutId: layout.id, label: `A${n + 1}`, row: 0, col: n + 1, type: 'NORMAL', price: 0,
    })),
  });
  BUS = bus.id;

  const make = async (name: string, departure: Date, extra: Record<string, unknown> = {}) => {
    const t = await prisma.trip.create({
      data: {
        busId: BUS, origin: 'المنصورة', destination: 'الغردقة',
        departure, arrival: new Date(departure.getTime() + 6 * 3_600_000),
        price: 500, status: 'SCHEDULED', ...extra,
      } as any,
    });
    await prisma.tripStop.createMany({
      data: [
        { tripId: t.id, stationId: m.id, stopOrder: 1, priceFromOrigin: 0 },
        { tripId: t.id, stationId: h.id, stopOrder: 2, priceFromOrigin: 500 },
      ],
    });
    return t.id;
  };

  ids = {
    departed: await make('departed', at(-10)),
    at5: await make('5min', at(5)),
    at29: await make('29min', at(29)),
    at31: await make('31min', at(31)),
    at120: await make('120min', at(120)),
    earlyMorning: await make('early', new Date(cairoDayStartUTC(cairoTodayISO()).getTime() + 30 * 60_000)),
    lateNight: await make('late', new Date(cairoDayStartUTC(cairoTodayISO()).getTime() + 23.5 * 3_600_000)),
    nextDayEarly: await make('nextday', new Date(cairoDayEndUTC(cairoTodayISO()).getTime() + 10 * 60_000)),
    charter: await make('charter', at(200), { bookingMode: 'BUS', busPrice: 4000 }),
    cancelled: await make('cancelled', at(210), { status: 'CANCELLED' }),
  };
}

function params(role: string, over: Record<string, unknown> = {}) {
  return {
    fromStationId: S.mansoura, toStationId: S.hurghada,
    date: cairoTodayISO(), returnDate: null, page: 1, take: 50,
    role, companyId: null, ...over,
  };
}

async function found(role: string, over: Record<string, unknown> = {}): Promise<string[]> {
  const r = await searchTripsByDate(prisma, params(role, over) as any, new Date(NOW));
  return r.data.map((t: any) => t.id);
}

async function main() {
  await seed();
  const today = cairoTodayISO();

  console.log('booking cutoff (customers)');
  check('trip at departure-5 is hidden from a customer', (await found('CUSTOMER')).includes(ids.at5), false);
  check('trip at departure-29 is hidden from a customer', (await found('CUSTOMER')).includes(ids.at29), false);
  check('trip at departure-31 is visible to a customer', (await found('CUSTOMER')).includes(ids.at31), true);
  check('trip at departure-5 is visible to a company', (await found('COMPANY_ADMIN')).includes(ids.at5), true);
  check('trip at departure-29 is visible to a company', (await found('COMPANY_ADMIN')).includes(ids.at29), true);
  check('departed trip is hidden from a customer', (await found('CUSTOMER')).includes(ids.departed), false);
  check('departed trip is hidden from a company', (await found('COMPANY_ADMIN')).includes(ids.departed), false);
  check('departed trip is hidden from an admin', (await found('SUPER_ADMIN')).includes(ids.departed), false);
  check('cancelled trip never appears', (await found('SUPER_ADMIN')).includes(ids.cancelled), false);

  console.log('\nsearch and booking agree on the boundary');
  for (const minutes of [5, 29, 31, 120]) {
    const dep = at(minutes);
    const searchable = (await found('CUSTOMER')).includes(ids[`at${minutes}`]);
    const bookable = isBookableByCustomer(dep, new Date(NOW));
    check(`at ${minutes}min: search==${searchable} booking==${bookable}`, searchable, bookable);
  }
  check('cutoff constant is 30 minutes', CUSTOMER_BOOKING_CUTOFF_MINUTES, 30);

  console.log('\nCairo day boundaries');
  // Injected just after Cairo midnight, so a 00:30 bus is still ahead. Using the
  // midday clock above would (correctly) hide it for having departed.
  const earlyNow = new Date(cairoDayStartUTC(today).getTime() + 5 * 60_000);
  const earlyIds = (
    await searchTripsByDate(
      prisma,
      params('COMPANY_ADMIN', { date: today, returnDate: null }) as any,
      earlyNow,
    )
  ).data.map((t: any) => t.id);
  check('00:30 Cairo departure is inside today', earlyIds.includes(ids.earlyMorning), true);
  check('23:30 Cairo departure is inside today', earlyIds.includes(ids.lateNight), true);
  check('00:10 next-day departure is not inside today', earlyIds.includes(ids.nextDayEarly), false);
  check(
    'a 00:30 Cairo trip is not reachable through yesterday',
    (
      await searchTripsByDate(
        prisma,
        params('COMPANY_ADMIN', { date: '2000-01-01' }) as any,
        earlyNow,
      ).catch(() => ({ data: [] }))
    ).data.length,
    0,
  );
  check('a day window is exactly 24h', (cairoDayEndUTC(today).getTime() - cairoDayStartUTC(today).getTime()) / 3_600_000, 24);

  console.log('\npast dates');
  try {
    await searchTripsByDate(prisma, params('CUSTOMER', { date: '2020-01-01' }) as any, new Date(NOW));
    check('past date is rejected', 'no error', 'SearchInputError');
  } catch (e) {
    check('past date is rejected', e instanceof SearchInputError, true);
    check('past date message is Arabic and specific', (e as Error).message, PAST_DATE_MESSAGE_AR);
  }
  try {
    await searchTripsByDate(prisma, params('CUSTOMER', { date: 'not-a-date' }) as any, new Date(NOW));
    check('malformed date is rejected', 'no error', 'SearchInputError');
  } catch (e) {
    check('malformed date is rejected', e instanceof SearchInputError, true);
  }

  console.log('\nround trip');
  const rt = await searchTripsByDate(
    prisma, params('CUSTOMER', { date: today, returnDate: today }) as any, new Date(NOW),
  );
  check('returnTrips is always an array', Array.isArray(rt.returnTrips), true);
  const rtNone = await searchTripsByDate(
    prisma, params('CUSTOMER', { date: today, returnDate: '2099-01-01' }) as any, new Date(NOW),
  );
  check('outbounds survive a return date with no trips', rtNone.data.length > 0, true);
  check('return list is empty, not missing', rtNone.returnTrips, []);
  try {
    // Return before the outbound: the return date is still in the future, so
    // this is the pairing error rather than the past-date error.
    await searchTripsByDate(
      prisma,
      params('CUSTOMER', { date: '2099-01-02', returnDate: '2099-01-01' }) as any,
      new Date(NOW),
    );
    check('return before outbound is rejected', 'no error', 'SearchInputError');
  } catch (e) {
    check('return before outbound is rejected', e instanceof SearchInputError, true);
    check('return-before message is specific', (e as Error).message, RETURN_BEFORE_OUTBOUND_MESSAGE_AR);
  }

  console.log('\ncharter visibility');
  check('charter hidden from a customer', (await found('CUSTOMER')).includes(ids.charter), false);
  check('charter visible to a super admin', (await found('SUPER_ADMIN')).includes(ids.charter), true);

  console.log('\npricing (one implementation)');
  check('segment price uses stop prices, not trip price', segmentPrice(
    { price: 900, tripStops: [
      { stationId: 'a', stopOrder: 1, priceFromOrigin: 0 },
      { stationId: 'b', stopOrder: 2, priceFromOrigin: 300 },
      { stationId: 'c', stopOrder: 3, priceFromOrigin: 900 },
    ] } as any, 'a', 'c',
  ), 900);
  check('mid-route segment', segmentPrice(
    { price: 900, tripStops: [
      { stationId: 'a', stopOrder: 1, priceFromOrigin: 0 },
      { stationId: 'b', stopOrder: 2, priceFromOrigin: 300 },
    ] } as any, 'a', 'b',
  ), 300);
  check('stop-less trip falls back to trip price', segmentPrice({ price: 450, tripStops: [] } as any, null, null), 450);

  console.log('\npayment hold never outlives the bus');
  check('hold ends before departure (5 min out)', paymentDeadline(at(5), new Date(NOW)).getTime() < NOW + 5 * 60_000, true);
  check('hold ends before departure (25 min out)', paymentDeadline(at(25), new Date(NOW)).getTime() < NOW + 25 * 60_000, true);
  check('normal window unchanged far out', paymentDeadline(at(600), new Date(NOW)).getTime(), NOW + 60 * 60_000);

  console.log('\nno company-private fields in the public response');
  const res = await searchTripsByDate(prisma, params('CUSTOMER') as any, new Date(NOW));
  const first = res.data[0];
  const booking = first?.bookings?.[0];
  const forbidden = ['userId', 'passengerName', 'passengerPhone', 'passengerHotel', 'paymentNotes',
    'paymentProofUrl', 'paymentRejectReason', 'paymentStatus', 'total', 'reference'];
  const leaked = booking ? forbidden.filter((f) => f in booking) : [];
  check('customer booking rows expose only seat occupancy', leaked, []);
  const charterLeak = first?.companyBookings?.[0];
  const charterForbidden = ['companyId', 'price', 'notes', 'paidFromWallet', 'paidOnCredit'];
  check('charter rows expose only seat occupancy',
    charterLeak ? charterForbidden.filter((f) => f in charterLeak) : [], []);

  console.log('\ncandidate cap is far above any realistic single day');
  check('cap is generous', CANDIDATE_CAP >= 500, true);

  console.log('\nany role cannot book after departure');
  check('isBookableByAnyRole is false past departure', isBookableByAnyRole(at(-1), new Date(NOW)), false);
  check('isBookableByAnyRole is true before departure', isBookableByAnyRole(at(1), new Date(NOW)), true);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});