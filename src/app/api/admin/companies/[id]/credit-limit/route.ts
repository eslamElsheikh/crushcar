import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { creditLimitSchema } from '@/lib/validations';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const logs = await prisma.creditLog.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      data: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error('[CreditLog GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = creditLimitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { creditLimit, reason } = parsed.data;

    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id } });
      if (!company) throw new Error('Company not found');

      const previousLimit = company.creditLimit;
      const changeAmount = creditLimit - previousLimit;

      const updated = await tx.company.update({
        where: { id },
        data: { creditLimit },
      });

      // A record is written only when the limit actually moved. A row that
      // records a change of zero is a record of nothing, and a pile of them
      // buries the ones that matter.
      if (changeAmount !== 0) {
        await tx.creditLog.create({
          data: {
            companyId: id,
            previousLimit,
            newLimit: creditLimit,
            changeAmount,
            reason: reason || '',
            createdById: session.user.id,
            createdByEmail: session.user.email || '',
          },
        });

        // Written inside the transaction, so the record and the change stand
        // or fall together.
        await audit({
          action: 'UPDATE',
          entity: 'CreditLimit',
          entityId: id,
          companyId: id,
          session,
          metadata: { previousLimit, newLimit: creditLimit, changeAmount, reason },
          client: tx,
        });
      }

      return NextResponse.json({
        ...updated,
        lastBillingDate: updated.lastBillingDate?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        changeAmount,
        message: 'Credit limit updated',
      });
    });
  } catch (err: any) {
    logger.error('[CreditLog POST]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
