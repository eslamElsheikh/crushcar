import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { generateRef } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const tripId = searchParams.get('tripId')
    const companyId = searchParams.get('companyId')
    const ref = searchParams.get('ref')
    const q = searchParams.get('q')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const where: Record<string, unknown> = {}
    if (tripId) where.tripId = tripId
    if (ref) where.reference = { contains: ref.toUpperCase() }
    if (q) {
      where.OR = [
        { reference: { contains: q.toUpperCase() } },
        { passengerName: { contains: q } },
        { user: { name: { contains: q } } },
        { seatLabel: { contains: q.toUpperCase() } },
      ]
    }
    if (session.user.role === 'CUSTOMER') {
      where.userId = session.user.id
    } else if (companyId) {
      where.trip = { bus: { companyId } }
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: { trip: { include: { bus: true } }, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.booking.count({ where }),
    ])

    return NextResponse.json({
      data: bookings.map(b => ({ ...b, paidAt: b.paidAt ? b.paidAt.toISOString() : null })),
      pagination: { page, take, total, pages: Math.ceil(total / take) },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tripId, seatLabel, passengerName } = await req.json()

    if (!tripId || !seatLabel) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Check if seat is already booked
    const existing = await prisma.booking.findFirst({
      where: { tripId, seatLabel, status: { in: ['PENDING', 'PAID'] } },
    })

    if (existing) {
      return NextResponse.json({ error: 'Seat already booked' }, { status: 409 })
    }

    // Get trip and seat info for price
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { bus: { include: { layout: { include: { seats: true } } } } },
    })

    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const seat = trip.bus.layout?.seats.find((s) => s.label === seatLabel)
    const total = seat?.price || trip.price

    // Create PENDING booking (payment happens via Stripe)
    const booking = await prisma.booking.create({
      data: {
        reference: generateRef(trip, seatLabel),
        userId: session.user.id,
        tripId,
        seatLabel,
        passengerName: passengerName || '',
        status: 'PENDING',
        total,
      },
      include: {
        trip: { include: { bus: true } },
        user: { select: { name: true, email: true } },
      },
    })

    return NextResponse.json({ booking, requiresPayment: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
