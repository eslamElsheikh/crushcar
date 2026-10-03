import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { autoTransitionAllTrips } from '@/lib/trips';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await autoTransitionAllTrips().catch(() => {});

    const now = new Date();

    const [all, upcoming, completed, cancelled] = await Promise.all([
      prisma.trip.count({ where: {} }),
      prisma.trip.count({ where: { status: 'SCHEDULED', departure: { gte: now } } }),
      prisma.trip.count({ where: { status: 'COMPLETED' } }),
      prisma.trip.count({ where: { status: 'CANCELLED' } }),
    ]);

    return NextResponse.json({ all, upcoming, completed, cancelled });
  } catch (err) {
    console.error('[Trips Counts GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
