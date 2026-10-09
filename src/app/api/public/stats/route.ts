import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { activeTripWhere } from '@/lib/analytics'

/**
 * Public homepage counters. Deliberately narrow: no revenue, no booking totals,
 * no bus counts — those are SUPER_ADMIN-only financials. Anything unauthenticated
 * here is scraped by anyone on the internet.
 */
export async function GET() {
  try {
    const now = new Date()

    const [activeTrips, stationCount, upcomingTrips] = await Promise.all([
      prisma.trip.count({ where: activeTripWhere(null, now) }),
      prisma.station.count(),
      prisma.trip.findMany({
        where: activeTripWhere(null, now),
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          bookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } }, select: { id: true } },
          companyBookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } }, select: { id: true } },
        },
        orderBy: { departure: 'asc' },
        take: 8,
      }),
    ])

    return NextResponse.json({
      activeTrips,
      stationCount,
      recentTrips: upcomingTrips.map((t) => ({
        id: t.id,
        origin: t.origin,
        destination: t.destination,
        departure: t.departure,
        arrival: t.arrival,
        price: t.price,
        status: t.status,
        bus: { id: t.bus.id, name: t.bus.name, type: t.bus.type },
        totalSeats: t.bus.layout?.seats.length || t.bus.seatCount,
        bookedSeats: t.bookings.length + t.companyBookings.length,
      })),
    })
  } catch (err) {
    console.error('[public/stats]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}