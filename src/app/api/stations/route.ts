import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const city = searchParams.get('city') || ''

    const where: any = {}
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { city: { contains: q } },
      ]
    }
    if (city) {
      where.city = city
    }

    const stations = await prisma.station.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { tripStops: true },
        },
      },
    })

    const cities = await prisma.station.findMany({
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    })

    return NextResponse.json({
      stations: stations.map(s => ({
        id: s.id,
        name: s.name,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
        tripCount: s._count.tripStops,
      })),
      cities: cities.map(c => c.city),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role === 'CUSTOMER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, city, lat, lng } = await req.json()
    if (!name || !city) {
      return NextResponse.json({ error: 'Name and city are required' }, { status: 400 })
    }

    const existing = await prisma.station.findFirst({ where: { name, city } })
    if (existing) {
      return NextResponse.json({ error: 'Station already exists' }, { status: 409 })
    }

    const station = await prisma.station.create({ data: { name, city, lat, lng } })
    return NextResponse.json(station)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
