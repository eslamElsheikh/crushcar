import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const record = await prisma.verificationToken.findFirst({
      where: { token, expires: { gt: new Date() } },
    });

    if (!record) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: record.email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    if (user.emailVerified) {
      await prisma.verificationToken.delete({ where: { id: record.id } });
      return NextResponse.json({ success: true, message: 'Already verified' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    await prisma.verificationToken.delete({ where: { id: record.id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[VerifyEmail]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
