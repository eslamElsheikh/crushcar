import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    // A failed probe's message can name the database file, the host or the
    // connection string. The log keeps all of it; the response says only that
    // the database is unreachable.
    console.error('[health] database probe failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ status: 'unhealthy', database: 'unreachable' }, { status: 500 });
  }
}
