import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { name, password, isActive } = await req.json();

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // COMPANY_ADMIN can only edit users in their own company
    if (session.user.role === 'COMPANY_ADMIN' && user.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (password !== undefined && password) data.password = await bcrypt.hash(password, 12);
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.user.update({ where: { id }, data });

    return NextResponse.json({ id: updated.id, name: updated.name, isActive: updated.isActive });
  } catch (err) {
    logger.error('[User PUT]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
