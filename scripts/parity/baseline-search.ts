/**
 * The trip search exactly as it was before this change, copied verbatim so the
 * rewrite can be compared against it. Kept deliberately: it is the reference
 * behaviour, not production code, and it still contains the raw SQL.
 *
 * The double-quoted identifiers below are why the rewrite was needed. They parse
 * on SQLite (which is what this harness runs on) and fail on MySQL.
 */
import type { SearchClient } from '../../src/lib/trip-search';

export interface BaselineParams {
  fromStationId: string;
  toStationId: string;
  date: string;
  returnDate?: string | null;
  page: number;
  take: number;
  role: string;
  companyId?: string | null;
}

const OCCUPYING = ['PENDING', 'PAID', 'BOARDED'];

export function baselineInclude(): any {
  return {
    bus: {
      include: {
        layout: { include: { seats: true } },
        stations: { orderBy: { order: 'asc' as const } },
      },
    },
    bookings: { where: { status: { in: OCCUPYING } } },
    companyBookings: { where: { status: { in: OCCUPYING } } },
    tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' as const } },
  };
}

export async function baselineSearch(prisma: SearchClient & { $queryRawUnsafe: (q: string, ...a: any[]) => Promise<any[]> }, p: BaselineParams, session: any, allTrips = true) {
  const include = baselineInclude();
  const { page, take } = p;
  const skip = (page - 1) * take;

  const now = new Date();
  const dateStart = new Date(Math.max(new Date(p.date).getTime(), now.getTime()));
  const dateEnd = new Date(dateStart);
  dateEnd.setDate(dateEnd.getDate() + 1);

  const companyScoped = !allTrips && session?.user?.role === 'COMPANY_ADMIN' && session.user.companyId;
  const companyFilter = companyScoped
    ? `AND t."busId" IN (SELECT id FROM "Bus" WHERE "companyId" = ? OR "companyId" IS NULL)`
    : '';
  const availabilityFilter =
    session?.user?.role === 'SUPER_ADMIN'
      ? ''
      : `AND t."bookingMode" <> 'BUS' AND t."reservedByCompanyId" IS NULL`;
  const companyArgs = companyScoped ? [session.user.companyId] : [];

  const tripRows: any[] = await (prisma as any).$queryRawUnsafe(
    `
        SELECT
          t.id, t."busId", t.origin, t.destination,
          t.departure, t.arrival, t.price, t.status, t."createdAt",
          (toStop."priceFromOrigin" - fromStop."priceFromOrigin") AS "calculatedPrice",
          fromStop."departureTime" AS "boardingTime",
          toStop."arrivalTime" AS "alightingTime"
        FROM "Trip" t
        JOIN "TripStop" fromStop ON t.id = fromStop."tripId"
        JOIN "TripStop" toStop   ON t.id = toStop."tripId"
        WHERE fromStop."stationId" = ?
          AND toStop."stationId"   = ?
          AND fromStop."stopOrder" < toStop."stopOrder"
          AND t.departure >= ?
          AND t.departure < ?
          AND t.status = 'SCHEDULED'
          ${availabilityFilter}
          ${companyFilter}
        ORDER BY t.departure ASC
        ${p.returnDate ? '' : 'LIMIT ? OFFSET ?'}
      `,
    p.fromStationId,
    p.toStationId,
    dateStart,
    dateEnd,
    ...companyArgs,
    ...(p.returnDate ? [] : [take, skip]),
  );

  let returnTrips: any[] = [];
  let filteredRows = tripRows;
  let queryTotal: number;

  if (p.returnDate) {
    const returnStart = new Date(Math.max(new Date(p.returnDate).getTime(), now.getTime()));
    const returnEnd = new Date(returnStart);
    returnEnd.setDate(returnEnd.getDate() + 1);
    const returnRaw: any[] = await (prisma as any).$queryRawUnsafe(
      `
          SELECT t.id, t.departure
          FROM "Trip" t
          JOIN "TripStop" fromStop ON t.id = fromStop."tripId"
          JOIN "TripStop" toStop   ON t.id = toStop."tripId"
          WHERE fromStop."stationId" = ?
            AND toStop."stationId"   = ?
            AND fromStop."stopOrder" < toStop."stopOrder"
            AND t.departure >= ?
            AND t.departure < ?
            AND t.status = 'SCHEDULED'
            ${availabilityFilter}
          ORDER BY t.departure ASC
          LIMIT 20
        `,
      p.toStationId,
      p.fromStationId,
      returnStart,
      returnEnd,
    );

    const returnIds = returnRaw.map((r: any) => r.id);
    let candidates: any[] = [];
    if (returnIds.length > 0) {
      candidates = await prisma.trip.findMany({ where: { id: { in: returnIds } }, include });
    }
    returnTrips = candidates.filter((rt: any) => {
      const total = rt.bus?.layout?.seats?.length || 0;
      const booked = (rt.bookings?.length || 0) + (rt.companyBookings?.length || 0);
      return total - booked > 0;
    });
    if (returnTrips.length === 0) {
      return {
        data: [],
        returnTrips: undefined,
        _wiped: true,
        pagination: { page, take, total: 0, pages: 0 },
      };
    }
    const latestReturnDep = Math.max(...returnTrips.map((rt: any) => new Date(rt.departure).getTime()));
    filteredRows = tripRows.filter((r: any) => new Date(r.arrival).getTime() < latestReturnDep);
    queryTotal = filteredRows.length;
  } else {
    queryTotal = tripRows.length;
  }

  const pageRows = p.returnDate ? filteredRows.slice(skip, skip + take) : filteredRows;
  const tripIds = pageRows.map((t: any) => t.id);
  let queryTrips: any[] =
    tripIds.length > 0 ? await prisma.trip.findMany({ where: { id: { in: tripIds } }, include }) : [];

  const priceMap = new Map(tripRows.map((t: any) => [t.id, t]));
  queryTrips = queryTrips.map((trip) => ({
    ...trip,
    calculatedPrice: priceMap.get(trip.id)?.calculatedPrice || trip.price,
    boardingTime: priceMap.get(trip.id)?.boardingTime || null,
    alightingTime: priceMap.get(trip.id)?.alightingTime || null,
    stops: trip.tripStops,
  }));

  return {
    data: queryTrips,
    returnTrips: returnTrips.length > 0 ? returnTrips : undefined,
    _wiped: false,
    pagination: { page, take, total: queryTotal, pages: Math.ceil((queryTotal || 0) / take) },
  };
}