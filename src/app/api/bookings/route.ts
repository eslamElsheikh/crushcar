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

    const type = searchParams.get('type')
    const groupId = searchParams.get('groupId')
    const where: Record<string, unknown> = {}
    if (tripId) where.tripId = tripId
    if (groupId) where.groupId = groupId
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

    if (type === 'company') {
      if (session.user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const cbWhere: Record<string, unknown> = {}
      if (tripId) cbWhere.tripId = tripId
      if (q) {
        cbWhere.OR = [
          { reference: { contains: q.toUpperCase() } },
          { passengerName: { contains: q } },
          { seatLabel: { contains: q.toUpperCase() } },
        ]
      }
      const [cbList, cbTotal] = await Promise.all([
        prisma.companyBooking.findMany({
          where: cbWhere,
          include: {
            trip: { include: { bus: true, tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } } },
            company: { select: { id: true, name: true } },
            customer: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.companyBooking.count({ where: cbWhere }),
      ])
      return NextResponse.json({
        data: cbList.map(b => ({
          ...b,
          _type: 'company',
          createdAt: b.createdAt.toISOString(),
          paidAt: b.paidAt?.toISOString() || null,
          cancelledAt: b.cancelledAt?.toISOString() || null,
          boardedAt: b.boardedAt?.toISOString() || null,
          user: { name: b.company?.name || 'Company', email: '' },
          stops: b.trip?.tripStops,
        })),
        pagination: { page, take, total: cbTotal, pages: Math.ceil(cbTotal / take) },
      })
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: { trip: { include: { bus: true, tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } } }, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.booking.count({ where }),
    ])

    return NextResponse.json({
      data: bookings.map(b => {
        const fromStop = b.trip?.tripStops?.find((s: any) => s.stopOrder === b.fromStopOrder)
        const toStop = b.trip?.tripStops?.find((s: any) => s.stopOrder === b.toStopOrder)
        const actualDeparture = fromStop?.departureTime || fromStop?.arrivalTime || b.trip?.departure
        return {
          ...b,
          _type: 'customer',
          paidAt: b.paidAt ? b.paidAt.toISOString() : null,
          cancelledAt: b.cancelledAt?.toISOString() || null,
          refundProcessedAt: b.refundProcessedAt?.toISOString() || null,
          refundProcessedBy: b.refundProcessedBy || null,
          actualOrigin: fromStop?.station?.name || b.trip?.origin,
          actualDestination: toStop?.station?.name || b.trip?.destination,
          actualDeparture: actualDeparture ? new Date(actualDeparture).toISOString() : undefined,
          stops: b.trip?.tripStops,
        }
      }),
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

    const { tripId, seatLabel, passengerName, passengerPhone, fromStationId, toStationId, holdId, groupId }: {
      tripId: string
      seatLabel: string
      passengerName?: string
      passengerPhone?: string
      fromStationId?: string | null
      toStationId?: string | null
      holdId?: string
      groupId?: string | null
    } = await req.json()
    if (!tripId || !seatLabel) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    return await prisma.$transaction(async (tx) => {
      // Resolve stop orders from station IDs (or use trip origin/destination as fallback)
      let fromStopOrder = 1
      let toStopOrder = 1
      let total = 0

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          tripStops: { orderBy: { stopOrder: 'asc' } },
        },
      })
      if (!trip) throw new Error('Trip not found')

      if (fromStationId && toStationId && trip.tripStops.length > 0) {
        const fromStop = trip.tripStops.find(s => s.stationId === fromStationId)
        const toStop = trip.tripStops.find(s => s.stationId === toStationId)
        if (!fromStop || !toStop) throw new Error('Invalid stations')
        if (fromStop.stopOrder >= toStop.stopOrder) throw new Error('fromStation must be before toStation')

        fromStopOrder = fromStop.stopOrder
        toStopOrder = toStop.stopOrder
        total = toStop.priceFromOrigin - fromStop.priceFromOrigin
      } else {
        // Fallback: use seat price or trip price
        const seat = trip.bus.layout?.seats.find((s) => s.label === seatLabel)
        total = seat?.price || trip.price
        // Set default stop orders from tripStops if available
        if (trip.tripStops.length > 0) {
          fromStopOrder = trip.tripStops[0].stopOrder
          toStopOrder = trip.tripStops[trip.tripStops.length - 1].stopOrder
        }
      }

      // Validate hold if provided
      if (holdId) {
        const hold = await tx.seatHold.findFirst({
          where: {
            id: holdId,
            userId: session.user.id,
            tripId,
            seatLabel,
            expiresAt: { gt: new Date() },
          },
        })
        if (!hold) throw new Error('HOLD_EXPIRED_OR_INVALID')
      }

      // Validate segment availability against confirmed bookings
      const conflict = await tx.booking.findFirst({
        where: {
          tripId,
          seatLabel,
          status: { in: ['PENDING', 'PAID', 'BOARDED'] },
          fromStopOrder: { lt: toStopOrder },
          toStopOrder: { gt: fromStopOrder },
        },
      })
      if (conflict) throw new Error('SEAT_CONFLICT')

      // Validate against active holds (excluding our hold)
      const holdConflict = await tx.seatHold.findFirst({
        where: {
          tripId,
          seatLabel,
          expiresAt: { gt: new Date() },
          fromStopOrder: { lt: toStopOrder },
          toStopOrder: { gt: fromStopOrder },
          ...(holdId ? { id: { not: holdId } } : {}),
        },
      })
      if (holdConflict) throw new Error('SEAT_CONFLICT')

      const booking = await tx.booking.create({
        data: {
          reference: generateRef(trip, seatLabel),
          userId: session.user.id,
          tripId,
          seatLabel,
          passengerName: passengerName || '',
          passengerPhone: passengerPhone || '',
          status: 'PENDING',
          total,
          fromStopOrder,
          toStopOrder,
          groupId: groupId || null,
        },
        include: {
          trip: {
            include: {
              bus: true,
              tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
            },
          },
          user: { select: { name: true, email: true } },
        },
      })

      // Delete hold if it was used
      if (holdId) {
        await tx.seatHold.deleteMany({ where: { id: holdId } })
      }

      return NextResponse.json({
        booking: { ...booking, stops: booking.trip?.tripStops },
        requiresPayment: true,
      })
    })
  } catch (err: any) {
    console.error(err)
    if (err.message === 'HOLD_EXPIRED_OR_INVALID') {
      return NextResponse.json({ error: 'HOLD_EXPIRED', message: 'انتهت صلاحية الحجز المؤقت، حاول مرة أخرى' }, { status: 409 })
    }
    if (err.message === 'SEAT_CONFLICT') {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'الكـرس محجوز من شخص آخر' }, { status: 409 })
    }
    if (err.message?.includes('Invalid stations') || err.message?.includes('fromStation must be before')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err.message === 'Trip not found') {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
