/**
 * Parity driver: runs the pre-rewrite search and the new one over a grid of
 * station pairs, directions and dates, and prints every difference.
 *
 *   npx tsx scripts/parity/driver.ts
 *
 * Differences are not automatically failures. The old branch was wrong in known
 * ways (it could not see stop-less trips, it wiped the outbound list when no
 * return matched, and it clamped a past date to "from now"), so the driver
 * classifies each diff against the intended behaviour.
 */
import { prisma } from './client';
import { baselineSearch } from './baseline-search';
import { searchTripsByDate } from '../../src/lib/trip-search';
import { seedDataset } from './dataset';
import { addDaysISO, cairoTodayISO } from '../../src/lib/booking-rules';



function ids(list: any[] | undefined | null): string[] {
  return (list || []).map((t: any) => t.id);
}

function prices(list: any[] | undefined | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of list || []) out[t.id] = Number(t.calculatedPrice ?? 0);
  return out;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

type Row = {
  cell: string;
  baseline: number;
  rewritten: number;
  orderSame: boolean;
  priceSame: boolean;
  note: string;
};

async function main() {
  const today = cairoTodayISO();
  const seeded = await seedDataset(prisma, today);
  const S = seeded.stationIds;

  console.log(`today (Cairo) = ${today}`);
  console.log(
    `seeded: ${seeded.tripIds.withStops.length} with-stops, ${seeded.tripIds.stopLess.length} stop-less, ` +
      `${seeded.tripIds.charter.length} charter, ${seeded.tripIds.soldOut.length} sold-out`,
  );

  const pairs: [string, string, string][] = [
    ['hurghada', 'mansoura', 'Hurghada -> Mansoura'],
    ['mansoura', 'hurghada', 'Mansoura -> Hurghada'],
    ['cairo', 'mansoura', 'Cairo -> Mansoura (mid-route)'],
    ['cairo', 'hurghada', 'Cairo -> Hurghada (full route)'],
  ];
  const offsets = [1, 2, 3, 7, 10, 11, 13, 30, 45, 60, 300, 365];

  const rows: Row[] = [];
  let unexpected = 0;

  console.log('\n=== parity grid: one-way ===');
  console.log('cell                                   baseline  rewritten  order  prices  note');
  for (const [from, to, label] of pairs) {
    for (const offset of offsets) {
      const day = addDaysISO(today, offset);
      const p = {
        fromStationId: S[from],
        toStationId: S[to],
        date: day,
        returnDate: null,
        page: 1,
        take: 50,
        role: 'CUSTOMER',
        companyId: null,
      };
      const session = { user: { role: 'CUSTOMER' } };
      let b: any; let n: any;
      try { b = await baselineSearch(prisma, p as any, session, true); } catch (e: any) { b = { data: [], error: e.message }; }
      try { n = await searchTripsByDate(prisma, p as any); } catch (e: any) { n = { data: [], error: e.message }; }

      const bi = ids(b.data); const ni = ids(n.data);
      const orderSame = sameOrder(bi, ni);
      const priceSame = JSON.stringify(prices(b.data)) === JSON.stringify(prices(n.data));
      const missing = bi.filter((x) => !ni.includes(x));
      const extra = ni.filter((x) => !bi.includes(x));

      let note = 'identical';
      if (!orderSame || !priceSame) {
        if (extra.length && !missing.length) note = `+${extra.length} new (expected: stop-less trips the old join could not see)`;
        else if (missing.length && !extra.length) note = `-${missing.length} dropped (REGRESSION)`;
        else note = 'mixed';
      }
      if (missing.length) unexpected++;

      const cell = `${label} D+${offset}`.padEnd(38);
      rows.push({ cell, baseline: bi.length, rewritten: ni.length, orderSame, priceSame, note });
      console.log(
        `${cell} ${String(bi.length).padStart(8)}  ${String(ni.length).padStart(9)}  ` +
          `${orderSame ? 'ok' : 'DIFF'}     ${priceSame ? 'ok' : 'DIFF'}   ${note}`,
      );
    }
  }

  console.log('\n=== parity grid: round trip ===');
  for (const [from, to, label] of pairs.slice(0, 2)) {
    for (const offset of [1, 10, 60]) {
      const day = addDaysISO(today, offset);
      const ret = addDaysISO(today, offset + 1);
      const p = {
        fromStationId: S[from], toStationId: S[to],
        date: day, returnDate: ret, page: 1, take: 50,
        role: 'CUSTOMER', companyId: null,
      };
      const session = { user: { role: 'CUSTOMER' } };
      const b: any = await baselineSearch(prisma, p as any, session, true).catch((e: any) => ({ data: [], error: e.message }));
      const n: any = await searchTripsByDate(prisma, p as any).catch((e: any) => ({ data: [], error: e.message }));
      const bi = ids(b.data); const ni = ids(n.data);
      const br = ids(b.returnTrips); const nr = ids(n.returnTrips);
      const cell = `${label} D+${offset}->D+${offset + 1}`.padEnd(38);
      const note = b._wiped
        ? 'old wiped outbound list when no return matched; new keeps it'
        : sameOrder(bi, ni) ? 'identical' : 'differs';
      console.log(
        `${cell} out ${bi.length}->${ni.length}  ret ${br.length}->${nr.length}  ${note}`,
      );
      rows.push({ cell, baseline: bi.length, rewritten: ni.length, orderSame: sameOrder(bi, ni), priceSame: true, note });
    }
  }

  console.log('\n=== summary ===');
  const identical = rows.filter((r) => r.orderSame && r.priceSame).length;
  console.log(`  cells compared        : ${rows.length}`);
  console.log(`  byte-identical        : ${identical}`);
  console.log(`  differing             : ${rows.length - identical}`);
  console.log(`  regressions (dropped) : ${unexpected}`);

  await prisma.$disconnect();
  process.exit(unexpected ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});