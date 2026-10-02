import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'COMPANY_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'));
    const skip = (page - 1) * take;
    const fromStationId = searchParams.get('fromStationId');
    const toStationId = searchParams.get('toStationId');

    const where: Record<string, unknown> = {
      bookingMode: 'BUS',
      reservedByCompanyId: null,
      status: 'SCHEDULED',
    };

    const AND: any[] = [];
    if (fromStationId) AND.push({ tripStops: { some: { stationId: fromStationId } } });
    if (toStationId) AND.push({ tripStops: { some: { stationId: toStationId } } });
    if (AND.length > 0) where.AND = AND;

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          bus: { select: { id: true, name: true, type: true, seatCount: true } },
          tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
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
