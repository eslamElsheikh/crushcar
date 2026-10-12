import { segmentPrice } from './segment-price';
import {
  cairoDayStartUTC,
  cairoDayEndUTC,
  cairoTodayISO,
  customerBookingCutoff,
  latestBookableDeparture,
  PAST_DATE_MESSAGE_AR,
  RETURN_BEFORE_OUTBOUND_MESSAGE_AR,
} from './booking-rules';

/**
 * Public trip search for a chosen date, one way or round trip.
 *
 * This replaces a raw SQL self-join on TripStop. That query quoted every
 * identifier with double quotes, which is valid SQLite and Postgres but a
 * syntax error on MySQL, so on production the whole branch returned 500 — and
 * because the page never checked res.ok, that 500 was rendered as "0 trips".
 * Everything here goes through Prisma instead, so the query is written in one
 * dialect and cannot drift from the schema again.
 *
 * It also fixes what the old branch could not do at all: a trip with no
 * TripStop rows was invisible to it, because it matched only by joining stops.
 * Stop-less trips now match on the trip's own origin/destination, in both
 * directions.
 */

/**
 * The slice of Prisma this module uses.
 *
 * Typed structurally rather than as PrismaClient so the parity harness can pass
 * a client generated for a different datasource over the same schema, and so
 * nothing here can depend on a method it does not use.
 */
export interface SearchClient {
  station: { findMany(args: any): Promise<any[]> };
  trip: { findMany(args: any): Promise<any[]> };
}

/** A bad request the caller can fix; the route turns this into a 400. */
export class SearchInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SearchInputError';
  }
}

/**
 * Rows pulled before the station-pair filter runs in JavaScript. A single Cairo
 * day holds a few dozen trips at most; the cap only exists so a malformed
 * dataset cannot pull the whole table.
 */
export const CANDIDATE_CAP = 1000;

const OCCUPYING_STATUSES = ['PENDING', 'PAID', 'BOARDED'];

/**
 * Seat occupancy is all the booking pages ever read. Selecting the whole row
 * used to hand the public search every booking column, which included
 * passenger name, phone and hotel, the payment proof URL, the internal payment
 * notes and the buyer's userId — plus whole CharterBooking rows carrying the
 * company id, price and wallet/credit amounts.
 */
const SEAT_USE_SELECT = {
  select: { seatLabel: true, fromStopOrder: true, toStopOrder: true },
} as const;

const SEARCH_INCLUDE = {
  bus: {
    include: {
      layout: { include: { seats: true } },
      stations: { orderBy: { order: 'asc' as const } },
    },
  },
  bookings: { where: { status: { in: OCCUPYING_STATUSES } }, ...SEAT_USE_SELECT },
  companyBookings: { where: { status: { in: OCCUPYING_STATUSES } }, ...SEAT_USE_SELECT },
  tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' as const } },
};

export interface TripSearchParams {
  fromStationId: string;
  toStationId: string;
  /** yyyy-mm-dd, a Cairo calendar day. */
  date: string;
  returnDate?: string | null;
  page: number;
  take: number;
  role: string;
  companyId?: string | null;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Station names are matched the way trip stops are built (trim + lowercase). */
function sameStation(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/**
 * Whether the trip runs fromSid -> toSid in that order.
 *
 * With stops, that means the two stops exist and the origin stop comes first.
 * Without stops there is nothing to order, so the trip's own origin and
 * destination text decides.
 */
export function servesLeg(
  trip: { origin?: string | null; destination?: string | null; tripStops?: { stationId: string; stopOrder: number }[] | null },
  fromSid: string,
  toSid: string,
  fromName: string,
  toName: string,
): boolean {
  const stops = trip.tripStops || [];
  if (stops.length === 0) {
    return sameStation(trip.origin, fromName) && sameStation(trip.destination, toName);
  }
  const from = stops.find((s) => s.stationId === fromSid);
  const to = stops.find((s) => s.stationId === toSid);
  if (!from || !to) return false;
  return from.stopOrder < to.stopOrder;
}

/** Seats left on a trip, counting both customer and company bookings. */
export function seatsLeft(trip: any): number {
  const total = trip?.bus?.layout?.seats?.length || 0;
  const booked = (trip?.bookings?.length || 0) + (trip?.companyBookings?.length || 0);
  return total - booked;
}

function decorate(trip: any, fromSid: string, toSid: string) {
  const stops = trip.tripStops || [];
  const fromStop = stops.find((s: any) => s.stationId === fromSid) || null;
  const toStop = stops.find((s: any) => s.stationId === toSid) || null;
  return {
    ...trip,
    calculatedPrice: segmentPrice(trip, fromSid, toSid),
    boardingTime: fromStop?.departureTime ?? null,
    alightingTime: toStop?.arrivalTime ?? null,
    // The clients read `stops`; keep the alias the old response had.
    stops: stops,
  };
}

export async function searchTripsByDate(
  prisma: SearchClient,
  p: TripSearchParams,
  now = new Date(),
) {
  // --- validation -------------------------------------------------------
  // Checked before any query runs so a stale bookmarked URL gets a message
  // rather than a search of an empty past window.
  if (!isDate(p.date)) throw new SearchInputError('تاريخ غير صحيح');
  const today = cairoTodayISO(now);
  if (p.date < today) throw new SearchInputError(PAST_DATE_MESSAGE_AR);
  if (p.returnDate != null && p.returnDate !== '') {
    if (!isDate(p.returnDate)) throw new SearchInputError('تاريخ غير صحيح');
    if (p.returnDate < today) throw new SearchInputError(PAST_DATE_MESSAGE_AR);
    if (p.returnDate < p.date) throw new SearchInputError(RETURN_BEFORE_OUTBOUND_MESSAGE_AR);
  }

  const isSuperAdmin = p.role === 'SUPER_ADMIN';
  const companyScoped = !isSuperAdmin && p.role === 'COMPANY_ADMIN' && !!p.companyId;

  // Customers lose the seat 30 minutes before departure; companies and admins
  // keep it until the bus leaves. A departed trip is out either way.
  const earliestDeparture =
    p.role === 'CUSTOMER' ? customerBookingCutoff(now) : latestBookableDeparture(now);

  const dayStart = cairoDayStartUTC(p.date);
  const dayEnd = cairoDayEndUTC(p.date);
  // The cutoff can sit inside the requested day, which is what makes "search
  // for today" return only the trips that have not left yet.
  const windowStart = new Date(Math.max(dayStart.getTime(), earliestDeparture.getTime()));

  const stations = await prisma.station.findMany({
    where: { id: { in: [p.fromStationId, p.toStationId] } },
    select: { id: true, name: true },
  });
  const nameOf = (id: string) => stations.find((s) => s.id === id)?.name || '';

  const candidatesFor = async (fromSid: string, toSid: string) => {
    const rows = await prisma.trip.findMany({
      where: {
        status: 'SCHEDULED',
        departure: { gte: windowStart, lt: dayEnd },
        ...(isSuperAdmin ? {} : { bookingMode: { not: 'BUS' }, reservedByCompanyId: null }),
        ...(companyScoped
          ? { bus: { OR: [{ companyId: p.companyId! }, { companyId: null }] } }
          : {}),
        // Either the trip touches one of the stations, or it has no stops at
        // all and will be matched on its origin/destination text below.
        OR: [
          { tripStops: { some: { stationId: fromSid } } },
          { tripStops: { some: { stationId: toSid } } },
          { tripStops: { none: {} } },
        ],
      },
      include: SEARCH_INCLUDE,
      orderBy: { departure: 'asc' },
      take: CANDIDATE_CAP,
    });
    return rows.filter((t) =>
      servesLeg(t, fromSid, toSid, nameOf(fromSid), nameOf(toSid)),
    );
  };

  const outbound = (await candidatesFor(p.fromStationId, p.toStationId)).map((t) =>
    decorate(t, p.fromStationId, p.toStationId),
  );

  // --- round trip -------------------------------------------------------
  // The return list is always an array, never undefined: the page reads it
  // unconditionally, and the old response dropped it entirely whenever nothing
  // matched, which the client could only interpret as "no results at all".
  let returnTrips: any[] = [];
  let data = outbound;
  if (p.returnDate) {
    const returnDayStart = new Date(
      Math.max(cairoDayStartUTC(p.returnDate).getTime(), earliestDeparture.getTime()),
    );
    const returnRows = await prisma.trip.findMany({
      where: {
        status: 'SCHEDULED',
        departure: { gte: returnDayStart, lt: cairoDayEndUTC(p.returnDate) },
        ...(isSuperAdmin ? {} : { bookingMode: { not: 'BUS' }, reservedByCompanyId: null }),
        ...(companyScoped
          ? { bus: { OR: [{ companyId: p.companyId! }, { companyId: null }] } }
          : {}),
        OR: [
          { tripStops: { some: { stationId: p.toStationId } } },
          { tripStops: { some: { stationId: p.fromStationId } } },
          { tripStops: { none: {} } },
        ],
      },
      include: SEARCH_INCLUDE,
      orderBy: { departure: 'asc' },
      take: CANDIDATE_CAP,
    });

    returnTrips = returnRows
      .filter((t) => servesLeg(t, p.toStationId, p.fromStationId, nameOf(p.toStationId), nameOf(p.fromStationId)))
      // A sold-out return is not available; the outbound leg is still listed.
      .filter((t) => seatsLeft(t) > 0)
      .map((t) => decorate(t, p.toStationId, p.fromStationId));

    // A return that leaves before the outbound bus arrives is not usable with
    // it, so those outbounds are dropped. Reported in the change notes as a
    // deliberate rule rather than a silent limit.
    if (returnTrips.length > 0) {
      const latestReturn = Math.max(...returnTrips.map((t) => new Date(t.departure).getTime()));
      data = outbound.filter((t) => new Date(t.arrival).getTime() < latestReturn);
    }
  }

  const total = data.length;
  const start = (p.page - 1) * p.take;
  const pageRows = p.returnDate ? data.slice(start, start + p.take) : data;

  return {
    data: pageRows,
    returnTrips,
    pagination: { page: p.page, take: p.take, total, pages: Math.ceil((total || 0) / p.take) },
  };
}