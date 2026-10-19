import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { nextBookingRef, withRefRetry } from '@/lib/booking-reference'
import { paymentDeadline } from '@/lib/payments'
import { isBookableByCustomer, BOOKING_CLOSED_MESSAGE_AR } from '@/lib/booking-rules'
import { segmentPrice } from '@/lib/segment-price'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const tripId = searchParams.get('tripId')
    const companyId = searchParams.get('companyId')
    const ref = searchParams.get('ref') || searchParams.get('reference')
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
      if (ref) cbWhere.reference = { contains: ref.toUpperCase() }
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

    // The whole transaction is retried, not just the create: a failed insert
    // can leave the transaction aborted, so resuming inside it is not an option.
    return await withRefRetry(() => prisma.$transaction(async (tx) => {
      // Resolve stop orders from station IDs (or use trip origin/destination as fallback)
      let fromStopOrder = 1
      let toStopOrder = 1
      let total = 0
      // Station names for the reference. Defaults to the trip's own endpoints
      // and is narrowed below to the stop the passenger actually uses.
      let fromStationName = ''
      let toStationName = ''

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          // station is needed to name the boarding and alighting stops in the
          // booking reference.
          tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
        },
      })
      if (!trip) throw new Error('Trip not found')

      // A charter trip is sold whole to one company. Seats on it are not
      // bookable, otherwise the customer pays for a seat on a bus they own.
      if (trip.bookingMode === 'BUS' || trip.reservedByCompanyId) throw new Error('CHARTER_TRIP')

      // The search results already filter these, but the API must not depend on
      // the caller having gone through search: a stale tab or a direct request
      // must not book a bus that has left.
      if (trip.status === 'CANCELLED') throw new Error('TRIP_NOT_BOOKABLE')
      if (trip.status === 'COMPLETED' || trip.status === 'IN_PROGRESS') throw new Error('TRIP_NOT_BOOKABLE')
      if (new Date(trip.departure).getTime() <= Date.now()) throw new Error('TRIP_DEPARTED')
      // Customers lose the seat CUSTOMER_BOOKING_CUTOFF_MINUTES before the bus
      // leaves. The public search hides trips past this point, so booking has to
      // agree or a trip the search already refused would still be bookable by a
      // direct request. Company and admin bookings keep the looser rule.
      if (session.user.role === 'CUSTOMER' && !isBookableByCustomer(new Date(trip.departure), new Date())) {
        throw new Error('BOOKING_CLOSED')
      }

      // A super admin books with the platform's own money, through
      // /api/platform/bookings, so there is only one way for an admin to
      // create a booking. This endpoint makes a customer-shaped booking that
      // waits for a receipt, which is exactly what the admin path removes.
      if (session.user.role === 'SUPER_ADMIN') {
        throw new Error('SUPER_ADMIN_USE_PLATFORM_BOOKING')
      }

      if (fromStationId && toStationId && trip.tripStops.length > 0) {
        const fromStop = trip.tripStops.find(s => s.stationId === fromStationId)
        const toStop = trip.tripStops.find(s => s.stationId === toStationId)
        if (!fromStop || !toStop) throw new Error('Invalid stations')
        if (fromStop.stopOrder >= toStop.stopOrder) throw new Error('fromStation must be before toStation')

        fromStopOrder = fromStop.stopOrder
        toStopOrder = toStop.stopOrder
        fromStationName = fromStop.station?.name || trip.origin
        toStationName = toStop.station?.name || trip.destination
        // Shared with the public search, so the price shown in the list and the
        // price charged here cannot come from two different calculations.
        total = segmentPrice(trip, fromStationId, toStationId)
      } else {
        // Fallback: use seat price or trip price
        const seat = trip.bus.layout?.seats.find((s) => s.label === seatLabel)
        total = seat?.price || trip.price
        // Set default stop orders from tripStops if available
        if (trip.tripStops.length > 0) {
          fromStopOrder = trip.tripStops[0].stopOrder
          toStopOrder = trip.tripStops[trip.tripStops.length - 1].stopOrder
          fromStationName = trip.tripStops[0].station?.name || trip.origin
          toStationName = trip.tripStops[trip.tripStops.length - 1].station?.name || trip.destination
        } else {
          fromStationName = trip.origin
          toStationName = trip.destination
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
          reference: await nextBookingRef(tx, {
            fromStation: fromStationName,
            toStation: toStationName,
            seatLabel,
          }),
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
          // The seat is held from here until this deadline; attaching proof
          // stops the clock (see src/lib/booking-expiry.ts).
          paymentExpiresAt: paymentDeadline(new Date(trip.departure)),
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
    }))
  } catch (err: any) {
    console.error(err)
    if (err.message === 'HOLD_EXPIRED_OR_INVALID') {
      return NextResponse.json({ error: 'HOLD_EXPIRED', message: 'انتهت صلاحية الحجز المؤقت، حاول مرة أخرى' }, { status: 409 })
    }
    if (err.message === 'SEAT_CONFLICT') {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'الكـرس محجوز من شخص آخر' }, { status: 409 })
    }
    if (err.message === 'CHARTER_TRIP') {
      return NextResponse.json({ error: 'CHARTER_TRIP', message: 'هذه رحلة شارتر، الحجز متاح للشركات فقط' }, { status: 409 })
    }
    if (err.message === 'TRIP_DEPARTED') {
      return NextResponse.json({ error: 'TRIP_DEPARTED', message: 'الرحلة غادرت بالفعل، لا يمكن الحجز عليها' }, { status: 409 })
    }
    if (err.message === 'TRIP_NOT_BOOKABLE') {
      return NextResponse.json({ error: 'TRIP_NOT_BOOKABLE', message: 'هذه الرحلة غير متاحة للحجز' }, { status: 409 })
    }
    // The cutoff rejection needs the Arabic sentence the search also uses.
    // Without this case it fell through to the generic branch below and answered
    // {"error":"BOOKING_CLOSED"} with no message for the customer to read.
    if (err.message === 'BOOKING_CLOSED') {
      return NextResponse.json({ error: 'BOOKING_CLOSED', message: BOOKING_CLOSED_MESSAGE_AR }, { status: 409 })
    }
    if (err.message === 'SUPER_ADMIN_USE_PLATFORM_BOOKING') {
      return NextResponse.json(
        { error: 'SUPER_ADMIN_USE_PLATFORM_BOOKING', message: 'استخدم مسار حجز المنصة' },
        { status: 409 }
      )
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
