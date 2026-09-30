import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        bus: { include: { layout: { include: { seats: true } }, stations: { orderBy: { order: 'asc' } } } },
        bookings: {
          where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        companyBookings: {
          where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
        },
        tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
        seatHolds: {
          where: { expiresAt: { gt: new Date() } },
          select: { seatLabel: true, fromStopOrder: true, toStopOrder: true, expiresAt: true },
        },
      },
    })
    if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ...trip, stops: trip.tripStops })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { stops, ...tripData } = body

    const existing = await prisma.trip.findUnique({ where: { id }, include: { bus: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (session.user.role === 'COMPANY_ADMIN' && existing.bus.companyId !== null && existing.bus.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update trip in transaction: replace TripStops
    const trip = await prisma.$transaction(async (tx) => {
      // Delete existing TripStops
      await tx.tripStop.deleteMany({ where: { tripId: id } })

      // Create new TripStops
      if (stops && Array.isArray(stops) && stops.length > 0) {
        await tx.tripStop.createMany({
          data: stops.map((s: any) => ({
            tripId: id,
            stationId: s.stationId,
            stopOrder: s.stopOrder,
            priceFromOrigin: s.priceFromOrigin,
            arrivalTime: s.arrivalTime ? new Date(s.arrivalTime) : null,
            departureTime: s.departureTime ? new Date(s.departureTime) : null,
          })),
        })
      }

      // Set origin/destination/price from stops if available
      const updateData: any = { ...tripData }
      if (updateData.departure) updateData.departure = new Date(updateData.departure)
      if (updateData.arrival) updateData.arrival = new Date(updateData.arrival)
      if (updateData.stopsJson && Array.isArray(updateData.stopsJson)) updateData.stopsJson = JSON.stringify(updateData.stopsJson)

      return tx.trip.update({
        where: { id },
        data: updateData,
        include: {
          bus: true,
          tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
        },
      })
    })

    return NextResponse.json({ ...trip, stops: trip.tripStops })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    const existing = await prisma.trip.findUnique({ where: { id }, include: { bus: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (session.user.role === 'COMPANY_ADMIN' && existing.bus.companyId !== null && existing.bus.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.trip.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
