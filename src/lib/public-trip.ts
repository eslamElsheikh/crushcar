/**
 * The public trip payload: what a signed-out visitor may see.
 *
 * A visitor may browse trips and inspect a seat map, but never booking
 * records. Every public response field is copied here by an explicit
 * allowlist, so a Prisma relation added tomorrow cannot leak into the public
 * API by default. The occupancy a seat map needs survives only as seat
 * positions — a label plus the stop range it covers — with no booking id,
 * reference, passenger, buyer, or payment field attached.
 */

import { customerBookingCutoff } from './booking-rules';

export interface PublicSeatOccupancy {
  seatLabel: string;
  fromStopOrder: number | null;
  toStopOrder: number | null;
}

/**
 * The public visibility policy in one place: SCHEDULED, still ahead of the
 * customer cutoff, not a charter (BUS), and not reserved for one company.
 * Mirrors the rules the search and the signed-in detail gate already apply.
 */
export function isPublicTripVisible(
  trip: {
    status?: string | null;
    bookingMode?: string | null;
    reservedByCompanyId?: string | null;
    departure: Date | string;
  },
  now = new Date(),
): boolean {
  if (trip.status !== 'SCHEDULED') return false;
  if (trip.bookingMode === 'BUS') return false;
  if (trip.reservedByCompanyId) return false;
  const departure = new Date(trip.departure).getTime();
  return Number.isFinite(departure) && departure >= customerBookingCutoff(now).getTime();
}

function publicStops(trip: any) {
  return (Array.isArray(trip?.tripStops) ? trip.tripStops : []).map((s: any) => ({
    stationId: s.stationId,
    stopOrder: s.stopOrder,
    priceFromOrigin: s.priceFromOrigin,
    arrivalTime: s.arrivalTime ?? null,
    departureTime: s.departureTime ?? null,
    ...(s.station
      ? { station: { id: s.station.id, name: s.station.name, city: s.station.city } }
      : {}),
  }));
}

/**
 * Booked seats are counted here, on the server, from the occupancy rows the
 * query already fetched for the count. The rows themselves are dropped: a
 * visitor learns how many seats are taken, never whose they are.
 */
function bookedCount(trip: any): number {
  const customer = Array.isArray(trip?.bookings) ? trip.bookings.length : 0;
  const company = Array.isArray(trip?.companyBookings) ? trip.companyBookings.length : 0;
  return customer + company;
}

/** List payload for a visitor. Nothing outside this object is ever copied. */
export function toPublicTrip(trip: any) {
  const stops = publicStops(trip);
  const layout = trip?.bus?.layout;
  return {
    id: trip.id,
    origin: trip.origin,
    destination: trip.destination,
    departure: trip.departure,
    arrival: trip.arrival,
    price: trip.price,
    status: trip.status,
    calculatedPrice: trip.calculatedPrice,
    boardingTime: trip.boardingTime ?? null,
    alightingTime: trip.alightingTime ?? null,
    bus: trip.bus
      ? {
          name: trip.bus.name,
          type: trip.bus.type,
          layout: layout
            ? {
                rows: layout.rows,
                cols: layout.cols,
                aisleAfter: layout.aisleAfter,
                colsPerRow: layout.colsPerRow,
                seats: (Array.isArray(layout.seats) ? layout.seats : []).map((s: any) => ({
                  id: s.id,
                  label: s.label,
                  row: s.row,
                  col: s.col,
                  type: s.type,
                  price: s.price,
                })),
              }
            : null,
        }
      : null,
    tripStops: stops,
    // The clients read `stops`; keep the alias the signed-in response has.
    stops,
    bookedSeats: bookedCount(trip),
  };
}

/**
 * Detail payload for a visitor. The seat map must know which seats are taken
 * and over which stop range, so occupancy survives — but only as seat
 * positions, never as booking rows.
 */
export function toPublicTripDetail(trip: any) {
  const occupancy = (rows: any): PublicSeatOccupancy[] =>
    (Array.isArray(rows) ? rows : []).map((b: any) => ({
      seatLabel: b.seatLabel,
      fromStopOrder: b.fromStopOrder ?? null,
      toStopOrder: b.toStopOrder ?? null,
    }));
  return {
    ...toPublicTrip(trip),
    bookings: occupancy(trip?.bookings),
    companyBookings: occupancy(trip?.companyBookings),
  };
}
