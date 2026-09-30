import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calculateRefund } from '@/lib/cancellation-policy'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'customer'

    if (type === 'customer') {
      const bookings = await prisma.booking.findMany({
        where: { status: 'CANCELLED', refundProcessedAt: null },
        include: {
          trip: { select: { id: true, origin: true, destination: true, departure: true, arrival: true, bus: { select: { name: true } } } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { cancelledAt: 'desc' },
      })

      const grouped = groupByTier(bookings)

      return NextResponse.json({
        total: bookings.length,
        tiers: grouped,
      })
    }

    // Company
    const bookings = await prisma.companyBooking.findMany({
      where: { status: 'CANCELLED', refundProcessedAt: null, refundAmount: { not: null } },
      include: {
        trip: { select: { id: true, origin: true, destination: true, departure: true, arrival: true, bus: { select: { name: true } } } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { cancelledAt: 'desc' },
    })

    const grouped = groupByTier(bookings)

    return NextResponse.json({
      total: bookings.length,
      tiers: grouped,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

function groupByTier(bookings: any[]) {
  const groups = {
    fullRefund: [] as any[],
    partial50: [] as any[],
    partial25: [] as any[],
    noRefund: [] as any[],
  }

  for (const b of bookings) {
    const departureTime = new Date(b.trip.departure)
    const bookingTime = b.createdAt
    const now = new Date()
    const hoursSinceBooking = (now.getTime() - bookingTime.getTime()) / (1000 * 60 * 60)
    const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const policy = { freeWindowMinutes: 60 }

    let tier: string
    if (hoursSinceBooking < policy.freeWindowMinutes / 60) {
      tier = 'fullRefund'
    } else if (hoursUntilDeparture > 24) {
      tier = 'fullRefund'
    } else if (hoursUntilDeparture > 12) {
      tier = 'partial50'
    } else if (hoursUntilDeparture > 4) {
      tier = 'partial25'
    } else {
      tier = 'noRefund'
    }

    groups[tier as keyof typeof groups].push({
      id: b.id,
      reference: b.reference,
      passengerName: b.passengerName,
      passengerPhone: b.passengerPhone,
      total: b.total,
      refundAmount: b.refundAmount ?? 0,
      cancellationFee: b.cancellationFee ?? 0,
      cancellationReason: b.cancellationReason,
      cancelledAt: b.cancelledAt?.toISOString?.() || b.cancelledAt,
      trip: b.trip,
      user: b.user || null,
      company: b.company || null,
      seatLabel: b.seatLabel,
      paidFromWallet: b.paidFromWallet,
      paidOnCredit: b.paidOnCredit,
    })
  }

  return groups
}
