import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { headers } from 'next/headers';
import { rateLimitRequest, rateLimitResponse } from '@/lib/rateLimitHttp';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rl = rateLimitRequest(req, 'client-log-error', 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await req.json();
    const headersList = await headers();
    const traceId = headersList.get('x-trace-id') || '';

    const safeMessage = typeof body.message === 'string' ? body.message.slice(0, 500) : '';
    const safeStack = typeof body.stack === 'string' ? body.stack.slice(0, 1000) : '';
    const safeUrl = typeof body.url === 'string' ? body.url.slice(0, 300) : '';

    logger.error('[ClientError]', { message: safeMessage, stack: safeStack, url: safeUrl, traceId });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
