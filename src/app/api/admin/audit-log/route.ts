import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = req.nextUrl;
    const action = url.searchParams.get('action');
    const entity = url.searchParams.get('entity');
    const userId = url.searchParams.get('userId');
    const companyId = url.searchParams.get('companyId');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const offset = Number(url.searchParams.get('offset')) || 0;

    const where: any = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;
    if (companyId) where.companyId = companyId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ data: logs, total });
  } catch (err) {
    logger.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
