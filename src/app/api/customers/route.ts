import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { search } = Object.fromEntries(new URL(req.url).searchParams)

    const users = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        } : {}),
      },
      include: {
        bookings: {
          include: {
            trip: {
              include: { bus: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt.toISOString(),
        totalBookings: u.bookings.length,
        totalSpent: u.bookings.filter(b => b.status === 'PAID').reduce((sum, b) => sum + b.total, 0),
        recentBookings: u.bookings.slice(0, 3).map((b) => ({
          id: b.id,
          reference: b.reference,
          status: b.status,
          seatLabel: b.seatLabel,
          total: b.total,
          createdAt: b.createdAt.toISOString(),
          trip: {
            origin: b.trip.origin,
            destination: b.trip.destination,
            departure: b.trip.departure,
            bus: b.trip.bus,
          },
        })),
      }))
    )
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}