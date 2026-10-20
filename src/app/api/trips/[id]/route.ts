import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { autoExpireUnpaidBookings } from '@/lib/booking-expiry'
import { isBookableByCustomer, isBookableByAnyRole } from '@/lib/booking-rules'
import { routeKeyOfStops, travelDateOf } from '@/lib/route-key'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // No cron is guaranteed to be running on the host, so releasing timed-out
    // seats also happens here. This is the path the booking screen polls, so a
    // seat never stays blocked because a job never fired. Failures are
    // swallowed: a sweep problem must not break trip browsing.
    await autoExpireUnpaidBookings().catch(() => {})

    const { id } = await params

    // The fleet belongs to the operator: only SUPER_ADMIN manages it. Every
    // customer and company screen gets its seat map from the trip below, not
    // from /api/buses, so nothing here needs the raw fleet endpoints.
    const isSuperAdmin = session.user.role === 'SUPER_ADMIN'

    // Seat occupancy is all a customer or a company booking screen reads. The
    // wider payload includes the passenger name, phone and hotel of everyone
    // already on the bus, the payment proof URL, internal payment notes, the
    // buyer's userId, and whole CharterBooking rows carrying the company id,
    // price and wallet amounts.
    const OCCUPYING = { status: { in: ['PENDING', 'PAID', 'BOARDED'] } }
    const seatOnly = {
      where: OCCUPYING,
      select: { seatLabel: true, fromStopOrder: true, toStopOrder: true },
    }

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        bus: { include: { layout: { include: { seats: true } }, stations: { orderBy: { order: 'asc' } } } },
        bookings: isSuperAdmin
          ? { where: OCCUPYING, include: { user: { select: { id: true, name: true, email: true } } } }
          : seatOnly,
        companyBookings: isSuperAdmin ? { where: OCCUPYING } : seatOnly,
        tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' as const } },
        seatHolds: {
          where: { expiresAt: { gt: new Date() } },
          select: { seatLabel: true, fromStopOrder: true, toStopOrder: true, expiresAt: true },
        },
      },
    })
    if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!isSuperAdmin) {
      // A charter trip is whole-bus business between the operator and one
      // company. Fetching it by id exposed the full-bus price and the id of the
      // company holding it, which the search deliberately hides.
      if (trip.bookingMode === 'BUS' || trip.reservedByCompanyId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      // Keep this in step with the search and the booking route, so a customer
      // cannot reach a seat map for a trip they are no longer allowed to book.
      // Companies keep the looser rule and may still book up to departure.
      const open = session.user.role === 'CUSTOMER'
        ? isBookableByCustomer(trip.departure, new Date())
        : isBookableByAnyRole(trip.departure, new Date());
      if (!open) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }

    // How much of this trip the calling company's allowance still covers.
    // Only the company that owns the allowance is told about it, so one
    // company cannot see another's.
    let companyQuota: { maxSeats: number | null; used: number; remaining: number | null } | null = null
    const companyId = session.user.companyId
    if (companyId && session.user.role !== 'SUPER_ADMIN') {
      const quota = await prisma.companyTripQuota.findUnique({
        where: { companyId_tripId: { companyId, tripId: id } },
      })
      const limit = quota?.maxSeats ?? null
      const used = await prisma.companyBooking.count({
        where: { companyId, tripId: id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
      })
      companyQuota = {
        maxSeats: limit,
        used,
        remaining: limit === null ? null : Math.max(0, limit - used),
      }
    }

    return NextResponse.json({ ...trip, stops: trip.tripStops, companyQuota })
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

      // The route identity and the travel date are re-derived from the stop
      // list that was just written. The stops are replaced wholesale on every
      // edit, so a key derived before the edit would be stale, and origin and
      // destination are a display snapshot that the edit page does not even
      // send.
      updateData.routeKey = routeKeyOfStops(stops as any)
      updateData.travelDate = travelDateOf(updateData.departure ?? existing.departure)

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
