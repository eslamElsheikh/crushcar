import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public merchant wallet numbers shown on payment pages.
// Managed by SUPER_ADMIN in /admin/settings. Values are display-only.
export async function GET() {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: ['payments.vodafone_number', 'payments.instapay_handle'] } },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return NextResponse.json({
      vodafone: map['payments.vodafone_number'] || '',
      instapay: map['payments.instapay_handle'] || '',
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
