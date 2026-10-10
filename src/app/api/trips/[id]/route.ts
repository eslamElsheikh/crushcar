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
    // Business rule: only SUPER_ADMIN edits trips. Companies and customers only book.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { stops, ...tripData } = body

    const existing = await prisma.trip.findUnique({ where: { id }, include: { bus: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const mode = tripData.bookingMode ?? existing.bookingMode ?? 'SEAT'
    if (mode !== 'SEAT' && mode !== 'BUS') {
      return NextResponse.json({ error: 'bookingMode must be SEAT or BUS' }, { status: 400 })
    }

    // A company paying for this whole bus has a confirmed charter. Turning the
    // trip into a seat bookable one would silently invalidate that deal.
    if (existing.bookingMode === 'BUS' && mode === 'SEAT') {
      const confirmed = await prisma.charterBooking.findFirst({
        where: { tripId: id, status: 'confirmed' },
        select: { id: true },
      })
      if (confirmed) {
        return NextResponse.json(
          { error: 'Trip has a confirmed charter booking and cannot become a seat trip' },
          { status: 409 }
        )
      }
    }

    if (mode === 'BUS') {
      const charterPrice = Number(tripData.busPrice ?? existing.busPrice)
      if (!Number.isFinite(charterPrice) || charterPrice <= 0) {
        return NextResponse.json(
          { error: 'busPrice must be greater than 0 for a charter trip' },
          { status: 400 }
        )
      }
      tripData.busPrice = charterPrice
    }
    tripData.bookingMode = mode

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
    // Business rule: only SUPER_ADMIN deletes trips.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    const existing = await prisma.trip.findUnique({ where: { id }, include: { bus: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.trip.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
