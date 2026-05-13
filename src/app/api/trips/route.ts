import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const origin = searchParams.get('origin')
    const destination = searchParams.get('destination')
    const date = searchParams.get('date')
    const busId = searchParams.get('busId')

    const where: Record<string, unknown> = {}

    // Non-admins only see trips from their company or public trips
    if (session?.user?.role === 'COMPANY_ADMIN' && session.user.companyId) {
      where.bus = { companyId: session.user.companyId }
    } else if (session?.user?.role === 'CUSTOMER') {
      // Customers see all published trips (no company filter needed for public search)
    }

    if (origin) where.origin = { contains: origin }
    if (destination) where.destination = { contains: destination }
    if (busId) where.busId = busId
    if (date) {
      const start = new Date(date)
      const end = new Date(date)
      end.setDate(end.getDate() + 1)
      where.departure = { gte: start, lt: end }
    }

    const trips = await prisma.trip.findMany({
      where,
      include: {
        bus: { include: { layout: { include: { seats: true } } } },
        bookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } } },
      },
      orderBy: { departure: 'asc' },
    })

    return NextResponse.json(trips)
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

    const { busId, origin, destination, departure, arrival, price } = await req.json()

    if (!busId || !origin || !destination || !departure || !arrival || !price) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if (price <= 0 || new Date(departure) >= new Date(arrival)) {
      return NextResponse.json({ error: 'Invalid price or times' }, { status: 400 })
    }

    // Verify bus belongs to admin's company
    if (session.user.role === 'COMPANY_ADMIN' && session.user.companyId) {
      const bus = await prisma.bus.findUnique({ where: { id: busId } })
      if (!bus || bus.companyId !== session.user.companyId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const trip = await prisma.trip.create({
      data: { busId, origin, destination, departure: new Date(departure), arrival: new Date(arrival), price },
      include: { bus: true },
    })

    return NextResponse.json(trip)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
