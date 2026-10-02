import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public: active destinations only, sorted by sortOrder.
export async function GET() {
  try {
    const items = await prisma.destination.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, nameAr: true, nameEn: true, imageUrl: true, sortOrder: true },
    });
    return NextResponse.json({ data: items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
