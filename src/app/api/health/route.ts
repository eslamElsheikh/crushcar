import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: 'unhealthy', error: String(err) }, { status: 500 });
  }
}
