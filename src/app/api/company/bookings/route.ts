import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { generateRef } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const q = searchParams.get('q')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const where: Record<string, unknown> = { companyId }
    if (status) where.status = status
    if (q) {
      where.OR = [
        { reference: { contains: q.toUpperCase() } },
        { passengerName: { contains: q } },
        { seatLabel: { contains: q.toUpperCase() } },
      ]
    }

    const [bookings, total] = await Promise.all([
      prisma.companyBooking.findMany({
        where,
        include: {
          trip: { include: { bus: true, tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } } },
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.companyBooking.count({ where }),
    ])

    return NextResponse.json({
      data: bookings.map(b => {
        const fromStop = b.trip?.tripStops?.find((s: any) => s.stopOrder === b.fromStopOrder)
        const toStop = b.trip?.tripStops?.find((s: any) => s.stopOrder === b.toStopOrder)
        const actualDeparture = fromStop?.departureTime || fromStop?.arrivalTime || b.trip?.departure
        return {
          ...b,
          createdAt: b.createdAt.toISOString(),
          paidAt: b.paidAt?.toISOString() || null,
          cancelledAt: b.cancelledAt?.toISOString() || null,
          boardedAt: b.boardedAt?.toISOString() || null,
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
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const { tripId, passengers, fromStationId, toStationId, customerId, bookingType, roundTripGroupId }: {
      tripId: string
      passengers: { seatLabel: string; passengerName: string; passengerPhone?: string; passengerHotel?: string }[]
      fromStationId?: string | null
      toStationId?: string | null
      customerId?: string | null
      bookingType?: string
      roundTripGroupId?: string | null
    } = await req.json()

    if (!tripId || !passengers?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new Error('Company not found')
      if (!company.isActive) throw new Error('COMPANY_INACTIVE')

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          tripStops: { orderBy: { stopOrder: 'asc' } },
        },
      })
      if (!trip) throw new Error('Trip not found')

      let globalFromStopOrder = 1
      let globalToStopOrder = 1

      if (fromStationId && toStationId && trip.tripStops.length > 0) {
        const fromStop = trip.tripStops.find(s => s.stationId === fromStationId)
        const toStop = trip.tripStops.find(s => s.stationId === toStationId)
        if (!fromStop || !toStop) throw new Error('Invalid stations')
        if (fromStop.stopOrder >= toStop.stopOrder) throw new Error('fromStation must be before toStation')
        globalFromStopOrder = fromStop.stopOrder
        globalToStopOrder = toStop.stopOrder
      } else if (trip.tripStops.length > 0) {
        globalFromStopOrder = trip.tripStops[0].stopOrder
        globalToStopOrder = trip.tripStops[trip.tripStops.length - 1].stopOrder
      }

      // Calculate individual and total prices
      const seatPrices = passengers.map(p => {
        if (fromStationId && toStationId && trip.tripStops.length > 0) {
          const fromStop = trip.tripStops.find(s => s.stationId === fromStationId)
          const toStop = trip.tripStops.find(s => s.stationId === toStationId)
          const price = toStop && fromStop ? toStop.priceFromOrigin - fromStop.priceFromOrigin : trip.price
          return { ...p, price }
        }
        const seat = trip.bus.layout?.seats.find((s: any) => s.label === p.seatLabel)
        return { ...p, price: seat?.price || trip.price }
      })

      const grandTotal = seatPrices.reduce((sum, p) => sum + p.price, 0)

      // Check conflicts for ALL seats before creating any
      for (const p of seatPrices) {
        const conflict = await tx.companyBooking.findFirst({
          where: {
            tripId,
            seatLabel: p.seatLabel,
            status: { in: ['PENDING', 'PAID', 'BOARDED'] },
            fromStopOrder: { lt: globalToStopOrder },
            toStopOrder: { gt: globalFromStopOrder },
          },
        })
        if (conflict) throw new Error(`SEAT_CONFLICT:${p.seatLabel}`)

        const bookingConflict = await tx.booking.findFirst({
          where: {
            tripId,
            seatLabel: p.seatLabel,
            status: { in: ['PENDING', 'PAID', 'BOARDED'] },
            fromStopOrder: { lt: globalToStopOrder },
            toStopOrder: { gt: globalFromStopOrder },
          },
        })
        if (bookingConflict) throw new Error(`SEAT_CONFLICT:${p.seatLabel}`)
      }

      // Create all bookings (no payment processing — deferred to confirm)
      const created = []
      for (const p of seatPrices) {
        const reference = generateRef(trip, p.seatLabel)
        const booking = await tx.companyBooking.create({
          data: {
            reference,
            companyId,
            customerId: customerId || null,
            tripId,
            seatLabel: p.seatLabel,
            passengerName: p.passengerName || '',
            passengerPhone: p.passengerPhone || '',
            passengerHotel: (p as any).passengerHotel || '',
            bookingType: bookingType || 'FOR_EMPLOYEE',
            status: 'PENDING',
            total: p.price,
            paidFromWallet: 0,
            paidOnCredit: 0,
            roundTripGroupId: roundTripGroupId || null,
            fromStopOrder: globalFromStopOrder,
            toStopOrder: globalToStopOrder,
          },
          include: {
            trip: {
              include: {
                bus: true,
                tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
              },
            },
            customer: true,
          },
        })
        created.push(booking)
      }

      return NextResponse.json({
        bookings: created.map(b => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          stops: b.trip?.tripStops,
        })),
        walletBalance: company.walletBalance,
        creditLimit: company.creditLimit,
        outstandingBalance: company.outstandingBalance,
      })
    })
  } catch (err: any) {
    console.error(err)
    if (err.message === 'COMPANY_INACTIVE') {
      return NextResponse.json({ error: 'COMPANY_INACTIVE', message: 'حساب الشركة غير مفعّل' }, { status: 403 })
    }
    if (err.message?.startsWith('SEAT_CONFLICT')) {
      const seat = err.message.split(':')[1] || ''
      return NextResponse.json({ error: 'SEAT_TAKEN', message: `الكرسي ${seat} محجوز من شخص آخر` }, { status: 409 })
    }
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
