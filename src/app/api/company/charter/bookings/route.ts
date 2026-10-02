import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const charterBookingSchema = z.object({
  tripId: z.string().min(1, 'Trip ID is required'),
  notes: z.string().optional().default(''),
});

const cancelRequestSchema = z.object({
  action: z.literal('cancel_request'),
  bookingId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'COMPANY_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!session.user.companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'));
    const skip = (page - 1) * take;
    const status = searchParams.get('status');

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      prisma.charterBooking.findMany({
        where,
        include: {
          trip: {
            include: {
              bus: { select: { name: true, type: true, seatCount: true } },
              tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.charterBooking.count({ where }),
    ]);

    return NextResponse.json({
      data: bookings,
      pagination: { page, take, total, pages: Math.ceil(total / take) },
    });
  } catch (err) {
    logger.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'COMPANY_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!session.user.companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 });

    const body = await req.json();

    // Handle cancel_request action
    const cancelParsed = cancelRequestSchema.safeParse(body);
    if (cancelParsed.success) {
      const { bookingId } = cancelParsed.data;
      const booking = await prisma.charterBooking.findUnique({ where: { id: bookingId } });
      if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      if (booking.companyId !== session.user.companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (booking.status !== 'confirmed') {
        return NextResponse.json({ error: 'Only confirmed bookings can be cancelled' }, { status: 400 });
      }

      const updated = await prisma.charterBooking.update({
        where: { id: bookingId },
        data: { status: 'cancel_requested' },
      });

      return NextResponse.json(updated);
    }

    // Handle new booking request
    const parsed = charterBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { tripId, notes } = parsed.data;

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    if (trip.bookingMode !== 'BUS') return NextResponse.json({ error: 'Trip is not a charter trip' }, { status: 400 });
    if (trip.reservedByCompanyId) return NextResponse.json({ error: 'Trip is already reserved' }, { status: 409 });

    const existing = await prisma.charterBooking.findFirst({
      where: { tripId, companyId: session.user.companyId, status: { in: ['requested', 'confirmed', 'cancel_requested'] } },
    });
    if (existing) return NextResponse.json({ error: 'You already have a booking for this trip' }, { status: 409 });

    // Check company balance (including funds held by other pending requests)
    const company = await prisma.company.findUnique({ where: { id: session.user.companyId! } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const heldBookings = await prisma.charterBooking.findMany({
      where: { companyId: company.id, status: 'requested' },
      select: { price: true },
    });
    const heldFunds = heldBookings.reduce((sum, b) => sum + b.price, 0);

    const tripPrice = trip.busPrice || trip.price;
    let availableFunds = company.walletBalance - heldFunds;

    if (company.paymentMode !== 'PREPAID') {
      const availableCredit = company.creditLimit - company.outstandingBalance;
      availableFunds += Math.max(0, availableCredit);
    }

    if (availableFunds < tripPrice) {
      const availableCredit = company.paymentMode === 'PREPAID' ? 0 : Math.max(0, company.creditLimit - company.outstandingBalance);
      return NextResponse.json({
        error: 'INSUFFICIENT_BALANCE',
        message: 'رصيدك لا يسمح بهذا الحجز',
        details: {
          required: tripPrice,
          walletBalance: company.walletBalance,
          availableCredit,
          heldFunds,
          totalAvailable: Math.max(0, availableFunds),
          deficit: tripPrice - availableFunds,
        },
      }, { status: 400 });
    }

    const booking = await prisma.charterBooking.create({
      data: {
        tripId,
        companyId: session.user.companyId!,
        price: tripPrice,
        notes,
      },
      include: {
        trip: {
          include: {
            bus: { select: { name: true, type: true, seatCount: true } },
            tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
          },
        },
      },
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    logger.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
