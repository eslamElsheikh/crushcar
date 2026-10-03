import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendVerificationEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(email);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(email, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    if (!checkRateLimit(email)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) {
      return NextResponse.json({ success: true });
    }

    await prisma.verificationToken.deleteMany({ where: { email } });

    const token = crypto.randomUUID();
    await prisma.verificationToken.create({
      data: {
        email,
        token,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await sendVerificationEmail(email, token, user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[SendVerification]', err);
    return NextResponse.json({ success: true });
  }
}
