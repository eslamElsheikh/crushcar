import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'));
    const skip = (page - 1) * take;
    const status = searchParams.get('status') || 'all';

    const where: Record<string, unknown> = {};
    if (status !== 'all') where.status = status;

    const [bookings, total] = await Promise.all([
      prisma.charterBooking.findMany({
        where,
        include: {
          trip: {
            include: {
              bus: { select: { name: true, type: true, seatCount: true } },
              tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
            },
          },
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.charterBooking.count({ where }),
    ]);

    return NextResponse.json({
      data: bookings,
      pagination: { page, take, total, pages: Math.ceil(total / take) },
    });
  } catch (err) {
    logger.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
