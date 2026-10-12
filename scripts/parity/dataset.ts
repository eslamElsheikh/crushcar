/**
 * Builds a controlled dataset in the scratch database so the parity grid has
 * something to compare: Mansoura <-> Hurghada both ways (the reported case),
 * a third station, stop-less trips, charter trips, a sold-out trip, and a
 * spread of dates out to a full year.
 */
import type { PrismaClient } from './.generated/index.js';
import { addDaysISO, cairoDayStartUTC } from '../../src/lib/booking-rules';

export interface Seeded {
  stationIds: Record<string, string>;
  busIds: Record<string, string>;
  tripIds: { withStops: string[]; stopLess: string[]; charter: string[]; soldOut: string[] };
}

/**
 * An instant that reads as HH:MM on a Cairo calendar day, expressed in UTC.
 * Built from the Cairo midnight instant plus whole hours, so an 08:00 trip is
 * stored the way an admin entering 08:00 in the picker would be stored.
 */
function at(dateISO: string, hour: number, minute = 0): Date {
  return new Date(cairoDayStartUTC(dateISO).getTime() + hour * 3_600_000 + minute * 60_000);
}

export async function seedDataset(prisma: PrismaClient, today: string): Promise<Seeded> {
  // wipe in dependency order
  await prisma.booking.deleteMany({});
  await prisma.charterBooking.deleteMany({});
  await prisma.seatHold.deleteMany({});
  await prisma.tripStop.deleteMany({});
  await prisma.trip.deleteMany({});
  await prisma.seat.deleteMany({});
  await prisma.busStation.deleteMany({});
  await prisma.bus.deleteMany({});
  await prisma.station.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});

  const stationCities: Record<string, string> = {
    mansoura: 'الدقهلية',
    hurghada: 'الغردقة',
    cairo: 'القاهرة',
  };
  const stationNames: Record<string, string> = {
    mansoura: 'المنصورة',
    hurghada: 'الغردقة',
    cairo: 'القاهرة',
  };
  const stationIds: Record<string, string> = {};
  for (const [key, name] of Object.entries(stationNames)) {
    const s = await prisma.station.create({ data: { name, city: stationCities[key] } });
    stationIds[key] = s.id;
  }

const makeBus = async (name: string, seatCount: number, companyId: string | null = null) => {
    const bus = await prisma.bus.create({ data: { name, type: 'COACH_BUS', seatCount, companyId } });
    const layout = await prisma.busLayout.create({
      data: {
        busId: bus.id, rows: Math.ceil(seatCount / 4), cols: 4, aisleAfter: 2,
        colsPerRow: JSON.stringify({ A: 4 }),
      },
    });
    // Seats hang off the layout, not the bus.
    const seatData = Array.from({ length: seatCount }, (_, n) => ({
      layoutId: layout.id, label: `A${n + 1}`, row: 0, col: n + 1, type: 'NORMAL', price: 0,
    }));
    if (seatData.length) await prisma.seat.createMany({ data: seatData });
    return bus.id;
  };

  const busIds = {
    coach: await makeBus('Coach A', 40),
    small: await makeBus('Small B', 2),
  };

  const tripIds: Seeded['tripIds'] = { withStops: [], stopLess: [], charter: [], soldOut: [] };

  // --- Mansoura <-> Hurghada, both ways, across many dates -----------------
  for (const offset of [1, 2, 10, 30, 60, 300, 365]) {
    const day = addDaysISO(today, offset);
    for (const [from, to] of [
      ['hurghada', 'mansoura'],
      ['mansoura', 'hurghada'],
    ] as const) {
      const dep = at(day, 8);
      const arr = at(day, 16);
      const trip = await prisma.trip.create({
        data: {
          busId: busIds.coach,
          origin: stationNames[from],
          destination: stationNames[to],
          departure: dep,
          arrival: arr,
          price: 500,
          status: 'SCHEDULED',
        },
      });
      await prisma.tripStop.createMany({
        data: [
          { tripId: trip.id, stationId: stationIds[from], stopOrder: 1, priceFromOrigin: 0, departureTime: dep },
          { tripId: trip.id, stationId: stationIds[to], stopOrder: 2, priceFromOrigin: 500, arrivalTime: arr },
        ],
      });
      tripIds.withStops.push(trip.id);
    }
  }

  // --- stop-less trips: invisible to the old branch, matched by text -------
  for (const offset of [3, 45]) {
    const day = addDaysISO(today, offset);
    for (const [from, to] of [
      ['hurghada', 'mansoura'],
      ['mansoura', 'hurghada'],
    ] as const) {
      const dep = at(day, 9);
      const trip = await prisma.trip.create({
        data: {
          busId: busIds.coach,
          origin: stationNames[from],
          destination: stationNames[to],
          departure: dep,
          arrival: new Date(dep.getTime() + 7 * 3_600_000),
          price: 450,
          status: 'SCHEDULED',
        },
      });
      tripIds.stopLess.push(trip.id);
    }
  }

  // --- a three-stop route so segment pricing differs from trip price -------
  {
    const day = addDaysISO(today, 7);
    const dep = at(day, 7);
    const arr = at(day, 15);
    const trip = await prisma.trip.create({
      data: {
        busId: busIds.coach,
        origin: stationNames.cairo,
        destination: stationNames.hurghada,
        departure: dep, arrival: arr, price: 900, status: 'SCHEDULED',
      },
    });
    await prisma.tripStop.createMany({
      data: [
        { tripId: trip.id, stationId: stationIds.cairo, stopOrder: 1, priceFromOrigin: 0, departureTime: dep },
        { tripId: trip.id, stationId: stationIds.mansoura, stopOrder: 2, priceFromOrigin: 300 },
        { tripId: trip.id, stationId: stationIds.hurghada, stopOrder: 3, priceFromOrigin: 900, arrivalTime: arr },
      ],
    });
    tripIds.withStops.push(trip.id);
  }

  // --- charter trip (must stay hidden from customers) ----------------------
  {
    const day = addDaysISO(today, 11);
    const dep = at(day, 6);
    const trip = await prisma.trip.create({
      data: {
        busId: busIds.coach,
        origin: stationNames.mansoura,
        destination: stationNames.hurghada,
        departure: dep,
        arrival: new Date(dep.getTime() + 8 * 3_600_000),
        price: 4000, status: 'SCHEDULED', bookingMode: 'BUS', busPrice: 4000,
      },
    });
    await prisma.tripStop.createMany({
      data: [
        { tripId: trip.id, stationId: stationIds.mansoura, stopOrder: 1, priceFromOrigin: 4000 },
        { tripId: trip.id, stationId: stationIds.hurghada, stopOrder: 2, priceFromOrigin: 4000 },
      ],
    });
    tripIds.charter.push(trip.id);
  }

  // Bookings need a real user to hang off.
  const u1 = await prisma.user.create({
    data: { email: 'occupied1@test.local', name: 'Occupied One', password: 'x', role: 'CUSTOMER' },
  });
  const u2 = await prisma.user.create({
    data: { email: 'occupied2@test.local', name: 'Occupied Two', password: 'x', role: 'CUSTOMER' },
  });

  // --- sold-out trip: 2-seat bus with 2 bookings --------------------------
  {
    const day = addDaysISO(today, 13);
    const dep = at(day, 10);
    const trip = await prisma.trip.create({
      data: {
        busId: busIds.small,
        origin: stationNames.mansoura,
        destination: stationNames.hurghada,
        departure: dep,
        arrival: new Date(dep.getTime() + 6 * 3_600_000),
        price: 300, status: 'SCHEDULED',
      },
    });
    await prisma.tripStop.createMany({
      data: [
        { tripId: trip.id, stationId: stationIds.mansoura, stopOrder: 1, priceFromOrigin: 0 },
        { tripId: trip.id, stationId: stationIds.hurghada, stopOrder: 2, priceFromOrigin: 300 },
      ],
    });
    await prisma.booking.createMany({
      data: [
        { reference: 'REF-SOLD-1', userId: u1.id, tripId: trip.id, seatLabel: 'A1', status: 'PAID', total: 300 },
        { reference: 'REF-SOLD-2', userId: u2.id, tripId: trip.id, seatLabel: 'A2', status: 'PAID', total: 300 },
      ],
    });
    tripIds.soldOut.push(trip.id);
  }

  // --- a departed trip and a cancelled one: must never be searchable -------
  {
    const day = addDaysISO(today, -3);
    const dep = at(day, 8);
    const trip = await prisma.trip.create({
      data: {
        busId: busIds.coach,
        origin: stationNames.mansoura, destination: stationNames.hurghada,
        departure: dep, arrival: new Date(dep.getTime() + 7 * 3_600_000),
        price: 500, status: 'COMPLETED',
      },
    });
    await prisma.tripStop.createMany({
      data: [
        { tripId: trip.id, stationId: stationIds.mansoura, stopOrder: 1, priceFromOrigin: 0 },
        { tripId: trip.id, stationId: stationIds.hurghada, stopOrder: 2, priceFromOrigin: 500 },
      ],
    });
  }

  return { stationIds, busIds, tripIds };
}