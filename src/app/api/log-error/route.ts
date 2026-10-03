import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const headersList = await headers();
    const traceId = headersList.get('x-trace-id') || '';

    logger.error('[ClientError]', { ...body, traceId });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
