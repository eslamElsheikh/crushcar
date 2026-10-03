import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = await prisma.siteSetting.findMany();
    const map: Record<string, string> = {};
    settings.forEach((s) => {
      map[s.key] = s.value;
    });

    return NextResponse.json(map);
  } catch (err) {
    console.error('[Admin Settings GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { key, value } = body;

    if (!key || typeof value !== 'string') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    await prisma.siteSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    await audit({
      action: 'UPDATE',
      entity: 'Setting',
      session,
      metadata: { key, value },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Admin Settings PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
