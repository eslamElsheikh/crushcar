import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { REVENUE_STATUS_FILTER } from '@/lib/analytics'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') ?? searchParams.get('q') ?? '').trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const companyId = session.user.role === 'COMPANY_ADMIN' ? session.user.companyId ?? undefined : undefined

    const where = {
      role: 'CUSTOMER',
      ...(companyId ? { companyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    }

    const [users, total, aggregate] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.user.count({ where }),
      prisma.booking.groupBy({
        by: ['userId'],
        where: { status: REVENUE_STATUS_FILTER },
        _sum: { total: true },
        _count: true,
      }),
    ])

    const statsByUser = new Map<string, { revenue: number; bookings: number }>()
    for (const row of aggregate) {
      statsByUser.set(row.userId, {
        revenue: Math.round((row._sum.total ?? 0) * 100) / 100,
        bookings: row._count,
      })
    }

    const customerIds = users.map((u) => u.id)
    const recentRows = await prisma.booking.findMany({
      where: { userId: { in: customerIds }, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
      include: {
        trip: {
          include: {
            bus: { select: { name: true } },
            tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const recentByUser = new Map<string, typeof recentRows>()
    for (const row of recentRows) {
      const list = recentByUser.get(row.userId) ?? []
      if (list.length < 3) list.push(row)
      recentByUser.set(row.userId, list)
    }

    const scopedUserIds = users.map((u) => u.id)
    const allStats = scopedUserIds
      .map((id) => statsByUser.get(id))
      .filter(Boolean) as { revenue: number; bookings: number }[]

    return NextResponse.json({
      data: users.map((u) => {
        const stats = statsByUser.get(u.id)
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          createdAt: u.createdAt.toISOString(),
          totalBookings: stats?.bookings ?? 0,
          totalRevenue: stats?.revenue ?? 0,
          recentBookings: (recentByUser.get(u.id) ?? []).map((b) => {
            const tripStops = b.trip.tripStops || []
            const fromStop = tripStops.find((s: any) => s.stopOrder === b.fromStopOrder)
            const toStop = tripStops.find((s: any) => s.stopOrder === b.toStopOrder)
            return {
              id: b.id,
              reference: b.reference,
              status: b.status,
              seatLabel: b.seatLabel,
              total: b.total,
              createdAt: b.createdAt.toISOString(),
              actualOrigin: fromStop?.station?.name || b.trip.origin,
              actualDestination: toStop?.station?.name || b.trip.destination,
              trip: {
                origin: b.trip.origin,
                destination: b.trip.destination,
                departure: b.trip.departure,
                bus: b.trip.bus,
              },
            }
          }),
        }
      }),
      stats: {
        totalCustomers: total,
        totalBookings: allStats.reduce((s, r) => s + r.bookings, 0),
        totalRevenue: Math.round(allStats.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
        avgBookingsPerCustomer: total > 0 ? Math.round((allStats.reduce((s, r) => s + r.bookings, 0) / total) * 10) / 10 : 0,
      },
      pagination: { page, take, total, pages: Math.ceil(total / take) },
    })
  } catch (err) {
    console.error('[customers]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}