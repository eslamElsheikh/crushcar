import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function escapeCsv(val: any): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date');
    if (!dateStr) {
      return NextResponse.json({ error: 'Date parameter required (?date=YYYY-MM-DD)' }, { status: 400 });
    }

    const startDate = new Date(dateStr);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const tripWhere: any = { departure: { gte: startDate, lt: endDate } };
    if (session.user.role === 'COMPANY_ADMIN' && session.user.companyId) {
      tripWhere.bus = { companyId: session.user.companyId };
    }

    const [customerBookings, companyBookings] = await Promise.all([
      prisma.booking.findMany({
        where: { trip: tripWhere },
        include: {
          trip: { include: { bus: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: [{ trip: { departure: 'asc' } }, { seatLabel: 'asc' }],
      }),
      prisma.companyBooking.findMany({
        where: { trip: tripWhere },
        include: {
          trip: { include: { bus: true } },
          customer: true,
        },
        orderBy: [{ trip: { departure: 'asc' } }, { seatLabel: 'asc' }],
      }),
    ]);

    const isRTL = req.headers.get('accept-language')?.startsWith('ar');

    const headers = isRTL
      ? ['المرجع', 'المسافر', 'المقعد', 'الرحلة', 'تاريخ المغادرة', 'الحالة', 'المبلغ', 'التحصيل', 'ملاحظات', 'النوع', 'جهة الحجز']
      : ['Reference', 'Passenger', 'Seat', 'Route', 'Departure', 'Status', 'Amount', 'Collection', 'Notes', 'Type', 'Booked By'];

    const statusMap: Record<string, string> = {
      PENDING: isRTL ? 'معلق' : 'Pending',
      PAID: isRTL ? 'مدفوع' : 'Paid',
      CANCELLED: isRTL ? 'ملغي' : 'Cancelled',
      BOARDED: isRTL ? 'صعد' : 'Boarded',
    };

    const rows: string[][] = [];

    for (const b of customerBookings) {
      rows.push([
        b.reference,
        b.passengerName || b.user?.name || '',
        b.seatLabel,
        `${b.trip.origin} → ${b.trip.destination}`,
        b.trip.departure.toISOString(),
        statusMap[b.status] || b.status,
        String(b.total),
        '',
        b.passengerHotel || '',
        isRTL ? 'عميل' : 'Customer',
        b.user?.name || '',
      ]);
    }

    for (const b of companyBookings) {
      rows.push([
        b.reference,
        b.passengerName || '',
        b.seatLabel,
        `${b.trip.origin} → ${b.trip.destination}`,
        b.trip.departure.toISOString(),
        statusMap[b.status] || b.status,
        String(b.total),
        b.collectAmount != null ? String(b.collectAmount) : '',
        b.passengerNotes || '',
        b.bookingType === 'FOR_CLIENT' ? (isRTL ? 'عميل شركة' : 'Client') : (isRTL ? 'موظف' : 'Employee'),
        b.customer?.name || '',
      ]);
    }

    // Prepend UTF-8 BOM so Excel opens Arabic correctly
    const bom = '\uFEFF';
    const csvContent =
      bom +
      [headers.map(escapeCsv).join(',')]
        .concat(rows.map((r) => r.map(escapeCsv).join(',')))
        .join('\r\n');

    const filename = `safro-bookings-${dateStr}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    logger.error('[Bookings Export]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
