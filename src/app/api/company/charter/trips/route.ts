import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'COMPANY_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const companyId = session.user.companyId;
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'));
    const skip = (page - 1) * take;
    const fromStationId = searchParams.get('fromStationId');
    const toStationId = searchParams.get('toStationId');
    const tripId = searchParams.get('tripId');

    const where: Record<string, unknown> = {
      bookingMode: 'BUS',
      status: 'SCHEDULED',
      // The browse list is a marketplace: a charter-eligible trip is unowned
      // and offered to every company, so the list stays open. A single-trip
      // lookup is not — it is the one path that could be pointed at an
      // arbitrary id, so there it is narrowed to trips that are either still
      // open or already reserved by this company. Without the second branch
      // a company could not reopen a charter it has just taken, because taking
      // it removes the trip from the open list.
      reservedByCompanyId: tripId ? undefined : null,
    };
    if (tripId) where.OR = [{ reservedByCompanyId: null }, { reservedByCompanyId: companyId }];

    const AND: any[] = [];
    if (tripId) AND.push({ id: tripId });
    if (fromStationId) AND.push({ tripStops: { some: { stationId: fromStationId } } });
    if (toStationId) AND.push({ tripStops: { some: { stationId: toStationId } } });
    if (AND.length > 0) where.AND = AND;

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        // The browse list is a marketplace, so every company sees the same
        // rows. That makes the payload public to any signed-in company admin,
        // and it used to carry whatever the Trip model happened to add:
        // reservedByCompanyId (which company already owns this bus), stopsJson,
        // busId, bookingMode, createdAt, plus each Station's lat/lng and each
        // stop's internal fare. Selecting the fields the charter pages
        // actually render keeps a future column on Trip from leaking by
        // default.
        select: {
          id: true,
          origin: true,
          destination: true,
          departure: true,
          arrival: true,
          price: true,
          busPrice: true,
          bus: { select: { name: true, type: true, seatCount: true } },
          tripStops: {
            orderBy: { stopOrder: 'asc' },
            select: { stopOrder: true, station: { select: { name: true } } },
          },
        },
        orderBy: { departure: 'asc' },
        skip,
        take,
      }),
      prisma.trip.count({ where }),
    ]);

    return NextResponse.json({
      data: trips,
      pagination: { page, take, total, pages: Math.ceil(total / take) },
    });
  } catch (err) {
    logger.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
