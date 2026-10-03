import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const fromStationId = searchParams.get('fromStationId')
    const toStationId = searchParams.get('toStationId')
    const origin = searchParams.get('origin')
    const destination = searchParams.get('destination')
    const date = searchParams.get('date')
    const returnDate = searchParams.get('returnDate')
    const busId = searchParams.get('busId')
    const status = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const include: any = {
      bus: { include: { layout: { include: { seats: true } }, stations: { orderBy: { order: 'asc' as const } } } },
      bookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } } },
      companyBookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } } },
      tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' as const } },
    }

    // Build query based on filters
    let queryTrips: any[]
    let queryTotal: number

    const allTrips = searchParams.get('all') === 'true'

    if (fromStationId && toStationId && date) {
      // Station-to-station with date
      const now = new Date()
      const dateStart = new Date(Math.max(new Date(date).getTime(), now.getTime()))
      const dateEnd = new Date(dateStart)
      dateEnd.setDate(dateEnd.getDate() + 1)

      const companyFilter = !allTrips && session?.user?.role === 'COMPANY_ADMIN' && session.user.companyId
        ? `AND t."busId" IN (SELECT id FROM "Bus" WHERE "companyId" = '${session.user.companyId}' OR "companyId" IS NULL)`
        : ''

      const tripRows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          t.id, t."busId", t.origin, t.destination,
          t.departure, t.arrival, t.price, t.status, t."createdAt",
          (toStop."priceFromOrigin" - fromStop."priceFromOrigin") AS "calculatedPrice",
          fromStop."departureTime" AS "boardingTime",
          toStop."arrivalTime" AS "alightingTime"
        FROM "Trip" t
        JOIN "TripStop" fromStop ON t.id = fromStop."tripId"
        JOIN "TripStop" toStop   ON t.id = toStop."tripId"
        WHERE fromStop."stationId" = ?
          AND toStop."stationId"   = ?
          AND fromStop."stopOrder" < toStop."stopOrder"
          AND t.departure >= ?
          AND t.departure < ?
          AND t.status = 'SCHEDULED'
          ${companyFilter}
        ORDER BY t.departure ASC
        ${returnDate ? '' : 'LIMIT ? OFFSET ?'}
      `, ...(returnDate ? [fromStationId, toStationId, dateStart, dateEnd] : [fromStationId, toStationId, dateStart, dateEnd, take, skip]))

      // Round trip: only outbound trips that have a matching return with free
      // seats stay visible. A return matches when it runs the reversed leg on
      // returnDate and departs after the outbound arrival.
      let returnTrips: any[] = []
      let filteredRows = tripRows
      if (returnDate) {
        const returnStart = new Date(Math.max(new Date(returnDate).getTime(), now.getTime()))
        const returnEnd = new Date(returnStart)
        returnEnd.setDate(returnEnd.getDate() + 1)
        const returnRaw = await prisma.$queryRawUnsafe<any[]>(`
          SELECT t.id, t.departure
          FROM "Trip" t
          JOIN "TripStop" fromStop ON t.id = fromStop."tripId"
          JOIN "TripStop" toStop   ON t.id = toStop."tripId"
          WHERE fromStop."stationId" = ?
            AND toStop."stationId"   = ?
            AND fromStop."stopOrder" < toStop."stopOrder"
            AND t.departure >= ?
            AND t.departure < ?
            AND t.status = 'SCHEDULED'
          ORDER BY t.departure ASC
          LIMIT 20
        `, toStationId, fromStationId, returnStart, returnEnd)

        const returnIds = returnRaw.map((r: any) => r.id)
        let candidates: any[] = []
        if (returnIds.length > 0) {
          candidates = await prisma.trip.findMany({
            where: { id: { in: returnIds } },
            include,
          })
        }
        // Sold-out returns don't count as available.
        returnTrips = candidates.filter((rt: any) => {
          const total = rt.bus?.layout?.seats?.length || 0
          const booked = (rt.bookings?.length || 0) + (rt.companyBookings?.length || 0)
          return total - booked > 0
        })
        if (returnTrips.length === 0) {
          return NextResponse.json({
            data: [],
            returnTrips: undefined,
            pagination: { page, take, total: 0, pages: 0 },
          })
        }
        const latestReturnDep = Math.max(...returnTrips.map((rt: any) => new Date(rt.departure).getTime()))
        filteredRows = tripRows.filter(
          (r: any) => new Date(r.arrival).getTime() < latestReturnDep
        )
        queryTotal = filteredRows.length
      } else {
        queryTotal = tripRows.length
      }

      const pageRows = returnDate ? filteredRows.slice(skip, skip + take) : filteredRows
      const tripIds = pageRows.map((t: any) => t.id)
      queryTrips = tripIds.length > 0 ? await prisma.trip.findMany({
        where: { id: { in: tripIds } },
        include,
      }) : []

      const priceMap = new Map(tripRows.map((t: any) => [t.id, t]))
      queryTrips = queryTrips.map(trip => ({
        ...trip,
        calculatedPrice: priceMap.get(trip.id)?.calculatedPrice || trip.price,
        boardingTime: priceMap.get(trip.id)?.boardingTime || null,
        alightingTime: priceMap.get(trip.id)?.alightingTime || null,
        stops: trip.tripStops,
      }))

      return NextResponse.json({
        data: queryTrips,
        returnTrips: returnTrips.length > 0 ? returnTrips : undefined,
        pagination: { page, take, total: queryTotal, pages: Math.ceil((queryTotal || 0) / take) },
      })
    }

    // General search: fromStationId only, toStationId only, both without date, or none
    const where: Record<string, unknown> = {}

    if (!allTrips && session?.user?.role === 'COMPANY_ADMIN' && session.user.companyId) {
      where.bus = { OR: [{ companyId: session.user.companyId }, { companyId: null }] }
    }

    // Only show scheduled trips by default
    if (!status) where.status = 'SCHEDULED'

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
        where.AND = stopFilter
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
    } else {
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

    queryTrips = dbTrips.map(t => ({ ...t, stops: t.tripStops }))
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
        },
        include,
        orderBy: { departure: 'asc' },
        take: 20,
      })
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

    const { busId, origin, destination, departure, arrival, price, stops } = await req.json()

    if (!busId || !departure || !arrival) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
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
