import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const station = await prisma.station.findUnique({
      where: { id },
      include: {
        _count: { select: { tripStops: true } },
      },
    })

    if (!station) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      ...station,
      tripCount: station._count.tripStops,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role === 'CUSTOMER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { name, city } = await req.json()

    if (!name || !city) {
      return NextResponse.json({ error: 'Name and city are required' }, { status: 400 })
    }

    const existing = await prisma.station.findFirst({
      where: { name, city, id: { not: id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Station already exists' }, { status: 409 })
    }

    const station = await prisma.station.update({
      where: { id },
      data: { name, city },
    })

    return NextResponse.json(station)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role === 'CUSTOMER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const tripCount = await prisma.tripStop.count({
      where: { stationId: id },
    })

    if (tripCount > 0) {
      return NextResponse.json({ error: 'Station is used in trips', tripCount }, { status: 400 })
    }

    await prisma.station.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
