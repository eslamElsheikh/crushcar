import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const { seatLabel, reason } = await req.json();
    if (!seatLabel) return NextResponse.json({ error: 'seatLabel is required' }, { status: 400 });

    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });

    const existing = await prisma.seatBlock.findUnique({
      where: { tripId_seatLabel: { tripId: id, seatLabel } },
    });
    if (existing) return NextResponse.json({ error: 'Seat already blocked' }, { status: 409 });

    await prisma.seatBlock.create({
      data: { tripId: id, seatLabel },
    });

    await audit({
      action: 'BLOCK',
      entity: 'SeatBlock',
      session,
      metadata: { tripId: id, seatLabel, reason },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[SeatBlock POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const seatLabel = req.nextUrl.searchParams.get('seatLabel');
    if (!seatLabel) return NextResponse.json({ error: 'seatLabel is required' }, { status: 400 });

    await prisma.seatBlock.deleteMany({
      where: { tripId: id, seatLabel },
    });

    await audit({
      action: 'UNBLOCK',
      entity: 'SeatBlock',
      session,
      metadata: { tripId: id, seatLabel },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[SeatBlock DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
