import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const station = await prisma.station.findUnique({ where: { id } })
    if (!station) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const tripStops = await prisma.tripStop.findMany({
      where: { stationId: id },
      include: {
        trip: {
          include: {
            bus: { select: { name: true, seatCount: true } },
            tripStops: {
              include: { station: true },
              orderBy: { stopOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { trip: { departure: 'asc' } },
    })

    const trips = tripStops.map((ts) => {
      const trip = ts.trip
      const allStops = trip.tripStops
      const fromStop = allStops.find(s => s.stopOrder === ts.stopOrder)
      const toStop = allStops[allStops.length - 1]

      let destination = trip.destination
      let price = trip.price

      if (fromStop && toStop && fromStop.stopOrder < toStop.stopOrder) {
        price = toStop.priceFromOrigin - fromStop.priceFromOrigin
      }

      return {
        id: trip.id,
        origin: station.name,
        destination,
        departure: trip.departure.toISOString(),
        arrival: trip.arrival.toISOString(),
        price: Math.max(price, 0),
        status: trip.status,
        bus: trip.bus,
        availableSeats: trip.bus ? trip.bus.seatCount || 40 : 40,
        routeStops: allStops.map(s => ({
          name: s.station?.name || '',
          order: s.stopOrder,
        })),
      }
    })

    return NextResponse.json({ station, trips })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
