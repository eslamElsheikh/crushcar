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
        bus: { include: { layout: { include: { seats: true } } } },
        bookings: {
          where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    })
    if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // COMPANY_ADMIN can only see trips from their company
    if (session.user.role === 'COMPANY_ADMIN' && trip.bus.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(trip)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const data = await req.json()
    if (data.departure) data.departure = new Date(data.departure)
    if (data.arrival) data.arrival = new Date(data.arrival)

    const existing = await prisma.trip.findUnique({ where: { id }, include: { bus: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (session.user.role === 'COMPANY_ADMIN' && existing.bus.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const trip = await prisma.trip.update({ where: { id }, data })
    return NextResponse.json(trip)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    const existing = await prisma.trip.findUnique({ where: { id }, include: { bus: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (session.user.role === 'COMPANY_ADMIN' && existing.bus.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.trip.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}