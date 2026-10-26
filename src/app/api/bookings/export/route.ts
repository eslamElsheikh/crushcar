import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { escapeCsvCell } from '@/lib/csv';

export const dynamic = 'force-dynamic';

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
        // A platform-funded seat is not a customer booking, and saying
        // "Customer" for it would put the platform's own spending in a
        // customer report.
        b.fundingSource === 'PLATFORM'
          ? (isRTL ? 'محفظة المنصة' : 'Platform wallet')
          : (isRTL ? 'عميل' : 'Customer'),
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
    // Names, hotels and free-text notes are user input: a cell starting with
    // =, +, - or @ is a formula the moment a spreadsheet parses it, and
    // quoting does not help, because the quotes are consumed first.
    // escapeCsvCell neutralises, then quotes — see src/lib/csv.ts.
    const csvContent =
      bom +
      [headers.map(escapeCsvCell).join(',')]
        .concat(rows.map((r) => r.map(escapeCsvCell).join(',')))
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
