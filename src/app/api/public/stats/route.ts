import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [
      totalBookings,
      confirmedRevenue,
      activeTrips,
      totalBuses,
      recentTrips,
    ] = await Promise.all([
      prisma.booking.count({ where: { status: { in: ['PENDING', 'PAID'] } } }),
      prisma.booking.aggregate({
        where: { status: 'PAID' },
        _sum: { total: true },
        _count: true,
      }),
      prisma.trip.count({ where: { status: 'SCHEDULED' } }),
      prisma.bus.count(),
      prisma.trip.findMany({
        where: { status: 'SCHEDULED', departure: { gte: new Date() } },
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          bookings: { where: { status: { in: ['PENDING', 'PAID'] } } },
        },
        orderBy: { departure: 'asc' },
        take: 8,
      }),
    ])

    return NextResponse.json({
      totalBookings,
      totalRevenue: confirmedRevenue._sum.total || 0,
      activeTrips,
      totalBuses,
      recentTrips: recentTrips.map((t) => ({
        id: t.id,
        origin: t.origin,
        destination: t.destination,
        departure: t.departure,
        arrival: t.arrival,
        price: t.price,
        status: t.status,
        bus: { id: t.bus.id, name: t.bus.name, type: t.bus.type },
        totalSeats: t.bus.layout?.seats.length || t.bus.seatCount,
        bookedSeats: t.bookings.length,
      })),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
