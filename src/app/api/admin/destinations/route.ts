import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

function forbidden(session: any) {
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

// Admin list (includes hidden) — SUPER_ADMIN only.
export async function GET() {
  const denied = forbidden(await auth());
  if (denied) return denied;
  try {
    const items = await prisma.destination.findMany({ orderBy: { sortOrder: 'asc' } });
    return NextResponse.json({ data: items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Create — SUPER_ADMIN only.
export async function POST(req: NextRequest) {
  const denied = forbidden(await auth());
  if (denied) return denied;
  try {
    const body = await req.json();
    const { slug, nameAr, nameEn, imageUrl, sortOrder, isActive } = body;
    if (!slug || !nameAr) {
      return NextResponse.json({ error: 'slug and nameAr are required' }, { status: 400 });
    }
    const maxSort = await prisma.destination.aggregate({ _max: { sortOrder: true } });
    const item = await prisma.destination.create({
      data: {
        slug: String(slug).trim().toLowerCase(),
        nameAr: String(nameAr).trim(),
        nameEn: nameEn ? String(nameEn).trim() : null,
        imageUrl: imageUrl || null,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : (maxSort._max.sortOrder ?? 0) + 1,
        isActive: isActive !== false,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'slug already exists' }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
