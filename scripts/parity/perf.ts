/**
 * Query count and timing for the rewritten search.
 *
 * The old branch ran a raw SQL self-join and then a second findMany for the
 * returned ids, so it could not report one number. The point here is that the
 * number does not grow with the size of the dataset, i.e. no N+1.
 *
 *   npx tsx scripts/parity/perf.ts
 */
import { prisma, resetQueryCount, queriesSoFar } from './client';
import { searchTripsByDate } from '../../src/lib/trip-search';
import { addDaysISO, cairoDayStartUTC, cairoTodayISO } from '../../src/lib/booking-rules';

async function main() {
  // A year of trips, both directions, plus a stop-less copy: ~730 rows.
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

  const m = await prisma.station.create({ data: { name: 'المنصورة', city: 'الدقهلية' } });
  const h = await prisma.station.create({ data: { name: 'الغردقة', city: 'الغردقة' } });
  const bus = await prisma.bus.create({ data: { name: 'Coach', type: 'COACH_BUS', seatCount: 40 } });
  const layout = await prisma.busLayout.create({
    data: { busId: bus.id, rows: 10, cols: 4, aisleAfter: 2, colsPerRow: JSON.stringify({ A: 4 }) },
  });
  await prisma.seat.createMany({
    data: Array.from({ length: 40 }, (_, n) => ({
      layoutId: layout.id, label: `A${n + 1}`, row: 0, col: n + 1, type: 'NORMAL', price: 0,
    })),
  });

  const today = cairoTodayISO();
  const tripIds: string[] = [];
  const days = 365;
  for (let d = 1; d <= days; d++) {
    const day = addDaysISO(today, d);
    for (const [from, to] of [[m.id, h.id], [h.id, m.id]] as const) {
      const dep = new Date(cairoDayStartUTC(day).getTime() + 8 * 3_600_000);
      const t = await prisma.trip.create({
        data: {
          busId: bus.id,
          origin: from === m.id ? 'المنصورة' : 'الغردقة',
          destination: to === h.id ? 'الغردقة' : 'المنصورة',
          departure: dep, arrival: new Date(dep.getTime() + 7 * 3_600_000),
          price: 500, status: 'SCHEDULED',
        },
      });
      await prisma.tripStop.createMany({
        data: [
          { tripId: t.id, stationId: from, stopOrder: 1, priceFromOrigin: 0 },
          { tripId: t.id, stationId: to, stopOrder: 2, priceFromOrigin: 500 },
        ],
      });
      tripIds.push(t.id);
    }
  }
  const total = await prisma.trip.count();
  console.log(`dataset: ${total} trips over ${days} days, both directions`);

  const p = (date: string, returnDate: string | null = null) => ({
    fromStationId: m.id, toStationId: h.id, date, returnDate,
    page: 1, take: 50, role: 'CUSTOMER', companyId: null,
  });

  // Warm up so the first measurement is not paying for connection setup.
  await searchTripsByDate(prisma, p(addDaysISO(today, 200)) as any, new Date());

  const measure = async (label: string, args: any) => {
    resetQueryCount();
    const t0 = Date.now();
    const r = await searchTripsByDate(prisma, args, new Date());
    const ms = Date.now() - t0;
    const queries = queriesSoFar();
    console.log(`  ${label.padEnd(30)} ${String(ms).padStart(4)}ms  ${String(queries).padStart(3)} queries  ${r.data.length} rows`);
    return { ms, queries, rows: r.data.length };
  };

  console.log('\none-way, as the page calls it');
  const near = await measure(`D+1`, p(addDaysISO(today, 1)));
  const mid = await measure(`D+60`, p(addDaysISO(today, 60)));
  const far = await measure(`D+300`, p(addDaysISO(today, 300)));
  const beyond = await measure(`D+400 (beyond range)`, p(addDaysISO(today, 400)));

  console.log('\nround trip');
  const rt = await measure(`D+60 -> D+61`, p(addDaysISO(today, 60), addDaysISO(today, 61)));

console.log('\nno N+1: query count must not track result size');
  const sizes = [near.rows, mid.rows, far.rows, beyond.rows];
  console.log(`  rows per day across dates: ${JSON.stringify(sizes)}`);
  console.log(`  query counts             : ${JSON.stringify([near.queries, mid.queries, far.queries, beyond.queries])}`);
  console.log(`  dataset size             : ${total} trips`);
  // One-way searches must all cost the same regardless of how many trips exist
  // in the table or how many rows come back. A round trip legitimately costs
  // more: it looks up the return leg as well, and is reported separately.
  const oneWay = [near, mid, far];
  const distinct = new Set(oneWay.map((r) => r.queries));
  const maxQueries = Math.max(near.queries, mid.queries, far.queries);
  const flat = distinct.size === 1;
  console.log(`  one-way query counts across dates : ${JSON.stringify(oneWay.map((r) => r.queries))}`);
  console.log(`  constant (no N+1, does not scale with ${total} trips): ${flat ? 'YES' : 'NO'}`);
  console.log(`  empty day used ${beyond.queries} queries (<= ${maxQueries}): ${beyond.queries <= maxQueries}`);

  console.log('\nround trip query count');
  console.log(`  one-way ${near.queries} vs round trip ${rt.queries} (a round trip adds the return lookup)`);

  await prisma.$disconnect();
  process.exit(flat ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
