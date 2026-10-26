import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { searchTripsByDate, SearchInputError } from '@/lib/trip-search'
import { toPublicTrip } from '@/lib/public-trip'
import { routeKeyOfStops, travelDateOf } from '@/lib/route-key'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // A signed-out visitor may browse trips. They are read under the public
    // policy — the same trips a CUSTOMER would see — and answered with an
    // allowlisted payload that counts bookings instead of returning them.
    // Every mutation and booking path below stays signed-in.
    const session = await auth()
    const user = session?.user ?? null
    const isVisitor = !user

    const { searchParams } = new URL(req.url)
    const fromStationId = searchParams.get('fromStationId')
    const toStationId = searchParams.get('toStationId')
    const origin = searchParams.get('origin')
    const destination = searchParams.get('destination')
    const date = searchParams.get('date')
    const returnDate = searchParams.get('returnDate')
    const busId = searchParams.get('busId')
    // The admin view knobs are ignored for a visitor: `status=ALL` must not
    // turn a public browse into a history dump of completed trips.
    const rawStatus = isVisitor ? null : searchParams.get('status')
    // "ALL" is the admin's unfiltered tab: no status constraint at all.
    const status = rawStatus && rawStatus.toUpperCase() !== 'ALL' ? rawStatus : undefined
    const rawBookingMode = searchParams.get('bookingMode')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const OCCUPYING = { status: { in: ['PENDING', 'PAID', 'BOARDED'] } }
    // A visitor's rows carry no booking data at all: only the seat label the
    // server-side count is built from, so no passenger, buyer, or payment
    // field is ever fetched on this path, let alone serialized.
    const visitorInclude: any = {
      bus: { include: { layout: { include: { seats: true } } } },
      bookings: { where: OCCUPYING, select: { seatLabel: true } },
      companyBookings: { where: OCCUPYING, select: { seatLabel: true } },
      tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' as const } },
    }
    const include: any = isVisitor ? visitorInclude : {
      bus: { include: { layout: { include: { seats: true } }, stations: { orderBy: { order: 'asc' as const } } } },
      bookings: { where: OCCUPYING },
      companyBookings: { where: OCCUPYING },
      tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' as const } },
    }

    // Build query based on filters.
    // Declared with their fallback values rather than bare: `const x: T` is a
    // TypeScript error and a later single assignment still reads as `let` to
    // prefer-const, which would flag it. Both branches that never reach the
    // query below return early, so these defaults are never served.
    let queryTrips: any[] = []
    let queryTotal: number = 0

    const allTrips = searchParams.get('all') === 'true'

    if (fromStationId && toStationId && date) {
      // Dated search goes through lib/trip-search: Prisma only, no raw SQL.
      // It also handles what this branch never could: trips with no stops at
      // all, and round trips whose return list was previously dropped.
      try {
        const result = await searchTripsByDate(prisma, {
          fromStationId,
          toStationId,
          date,
          returnDate: returnDate || null,
          page,
          take,
          role: user?.role ?? 'CUSTOMER',
          companyId: user?.companyId ?? null,
        })
        // The visitor's copy drops the seat rows the search fetched and keeps
        // only the count; the seat map gets its occupancy from the detail
        // endpoint, which serves positions and nothing else.
        if (isVisitor) {
          return NextResponse.json({
            ...result,
            data: result.data.map(toPublicTrip),
            returnTrips: result.returnTrips.map(toPublicTrip),
          })
        }
        return NextResponse.json(result)
      } catch (err) {
        // A past date or a return before the outbound is the caller's mistake,
        // not a server fault, so it answers 400 with a message it can show.
        if (err instanceof SearchInputError) {
          return NextResponse.json({ error: err.message }, { status: err.status })
        }
        throw err
      }
    }

    // General search: fromStationId only, toStationId only, both without date, or none
    const where: Record<string, unknown> = {}

    if (!allTrips && user?.role === 'COMPANY_ADMIN' && user.companyId) {
      where.bus = { OR: [{ companyId: user.companyId }, { companyId: null }] }
    }

    // Charter trips (bookingMode = BUS) are whole-bus reservations sold to
    // companies, so they must never reach a customer booking list, and a trip a
    // company has already taken is no longer available to anyone else. Admins
    // see everything and filter by type instead.
    const isSuperAdmin = user?.role === 'SUPER_ADMIN'
    if (isSuperAdmin) {
      if (rawBookingMode && rawBookingMode.toUpperCase() !== 'ALL') {
        where.bookingMode = rawBookingMode
      }
    } else {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { bookingMode: { not: 'BUS' } },
        { reservedByCompanyId: null },
      ]
    }

    // Public callers get SCHEDULED by default. Admins that asked for ALL get no
    // status constraint, so completed/cancelled history stays visible.
    if (!status && rawStatus?.toUpperCase() !== 'ALL') where.status = 'SCHEDULED'

    if (fromStationId || toStationId) {
      // Filter by stops when station IDs are provided
      const stopFilter: any[] = []
      if (fromStationId) {
        stopFilter.push({
          tripStops: { some: { stationId: fromStationId } },
        })
      }
      if (toStationId) {
        stopFilter.push({
          tripStops: { some: { stationId: toStationId } },
        })
      }
      if (fromStationId && toStationId) {
        // Merged, not replaced: assigning where.AND = stopFilter threw away the
        // charter/reserved guards added above, so a browse that pinned two
        // stations could leak charter and already-reserved trips to customers.
        where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...stopFilter]
      } else {
        Object.assign(where, ...stopFilter.map(s => ({ ...s })))
      }
    }

    if (origin) where.origin = { contains: origin }
    if (destination) where.destination = { contains: destination }
    if (busId) where.busId = busId
    if (status) where.status = status
    const now = new Date()
    if (date) {
      const start = new Date(Math.max(new Date(date).getTime(), now.getTime()))
      const end = new Date(date)
      end.setDate(end.getDate() + 1)
      where.departure = { gte: start, lt: end }
    } else if (!status) {
      // No explicit status and no date: the public booking list, which must only
      // ever show upcoming trips. When the caller does pin a status (admin tabs
      // like COMPLETED/CANCELLED) we skip this so past trips stay visible.
      where.departure = { gte: now }
    }

    const [dbTrips, dbTotal] = await Promise.all([
      prisma.trip.findMany({
        where,
        include,
        orderBy: { departure: 'asc' },
        skip,
        take,
      }),
      prisma.trip.count({ where }),
    ])

    queryTrips = isVisitor
      ? dbTrips.map(toPublicTrip)
      : dbTrips.map(t => ({ ...t, stops: t.tripStops }))
    queryTotal = dbTotal

    let returnTrips: any[] = []
    if (returnDate && origin && destination) {
      const returnStart = new Date(Math.max(new Date(returnDate).getTime(), now.getTime()))
      const returnEnd = new Date(returnStart)
      returnEnd.setDate(returnEnd.getDate() + 1)

      returnTrips = await prisma.trip.findMany({
        where: {
          origin: { contains: destination },
          destination: { contains: origin },
          departure: { gte: returnStart, lt: returnEnd },
          status: 'SCHEDULED',
          ...(isSuperAdmin
            ? {}
            : { bookingMode: { not: 'BUS' }, reservedByCompanyId: null }),
        },
        include,
        orderBy: { departure: 'asc' },
        take: 20,
      })
      if (isVisitor) returnTrips = returnTrips.map(toPublicTrip)
    }

    return NextResponse.json({
      data: queryTrips,
      returnTrips: returnTrips.length > 0 ? returnTrips : undefined,
      pagination: { page, take, total: queryTotal, pages: Math.ceil(queryTotal / take) },
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
    // Business rule: only SUPER_ADMIN creates trips. Companies and customers only book.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { busId, origin, destination, departure, arrival, price, stops, bookingMode, busPrice } = await req.json()

    if (!busId || !departure || !arrival) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Only two trip types exist. BOTH is deliberately not offered: a trip is
    // either sold per seat to customers or chartered whole to one company.
    const mode = bookingMode ?? 'SEAT'
    if (mode !== 'SEAT' && mode !== 'BUS') {
      return NextResponse.json({ error: 'bookingMode must be SEAT or BUS' }, { status: 400 })
    }

    // A charter trip is priced as one total for the whole bus, so a total is the
    // only meaningful number. Without it the trip would be listed to companies
    // at seat price.
    let charterPrice: number | null = null
    if (mode === 'BUS') {
      charterPrice = Number(busPrice)
      if (!Number.isFinite(charterPrice) || charterPrice <= 0) {
        return NextResponse.json({ error: 'busPrice must be greater than 0 for a charter trip' }, { status: 400 })
      }
    }

    if (new Date(departure) >= new Date(arrival)) {
      return NextResponse.json({ error: 'Invalid times' }, { status: 400 })
    }

    // Create trip with TripStop records
    const trip = await prisma.trip.create({
      data: {
        busId,
        origin: origin || (stops?.[0]?.name || ''),
        destination: destination || (stops?.[stops?.length - 1]?.name || ''),
        departure: new Date(departure),
        arrival: new Date(arrival),
        price: price || (stops?.[stops?.length - 1]?.priceFromOrigin || 0),
        bookingMode: mode,
        busPrice: charterPrice,
        // The route identity, derived from the stops that are about to be
        // written — never from the origin/destination text, which is a
        // display snapshot and can disagree with the stop list.
        routeKey: routeKeyOfStops(stops as any),
        travelDate: travelDateOf(departure),
        tripStops: stops?.length ? {
          create: stops.map((s: any) => ({
            stationId: s.stationId,
            stopOrder: s.stopOrder,
            priceFromOrigin: s.priceFromOrigin,
            arrivalTime: s.arrivalTime ? new Date(s.arrivalTime) : null,
            departureTime: s.departureTime ? new Date(s.departureTime) : null,
          })),
        } : undefined,
      },
      include: {
        bus: true,
        tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
      },
    })

    return NextResponse.json({ ...trip, stops: trip.tripStops })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
