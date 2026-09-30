import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tripId, seatLabel, fromStationId, toStationId } = await req.json()
    if (!tripId || !seatLabel || !fromStationId || !toStationId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Resolve stop orders
    const [fromStop, toStop] = await Promise.all([
      prisma.tripStop.findFirst({ where: { tripId, stationId: fromStationId } }),
      prisma.tripStop.findFirst({ where: { tripId, stationId: toStationId } }),
    ])
    if (!fromStop || !toStop) {
      return NextResponse.json({ error: 'Invalid stations for this trip' }, { status: 400 })
    }
    if (fromStop.stopOrder >= toStop.stopOrder) {
      return NextResponse.json({ error: 'fromStation must be before toStation' }, { status: 400 })
    }

    const fromStopOrder = fromStop.stopOrder
    const toStopOrder = toStop.stopOrder

    // Validate no overlapping confirmed booking
    const bookingConflict = await prisma.booking.findFirst({
      where: {
        tripId,
        seatLabel,
        status: { in: ['PENDING', 'PAID', 'BOARDED'] },
        fromStopOrder: { lt: toStopOrder },
        toStopOrder: { gt: fromStopOrder },
      },
    })
    if (bookingConflict) {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'الكـرس محجوز' }, { status: 409 })
    }

    // Validate no overlapping active hold
    const holdConflict = await prisma.seatHold.findFirst({
      where: {
        tripId,
        seatLabel,
        expiresAt: { gt: new Date() },
        fromStopOrder: { lt: toStopOrder },
        toStopOrder: { gt: fromStopOrder },
      },
    })
    if (holdConflict) {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'الكـرس محجوز مؤقتاً' }, { status: 409 })
    }

    // Create hold (2 minutes)
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000)
    const hold = await prisma.seatHold.create({
      data: { tripId, seatLabel, fromStopOrder, toStopOrder, userId: session.user.id, expiresAt },
    })

    // Cleanup old expired holds
    prisma.seatHold.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {})

    return NextResponse.json({ holdId: hold.id, expiresAt: expiresAt.toISOString() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const holdId = searchParams.get('holdId')
    if (!holdId) return NextResponse.json({ error: 'Missing holdId' }, { status: 400 })

    await prisma.seatHold.deleteMany({ where: { id: holdId, userId: session.user.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
