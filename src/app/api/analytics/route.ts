import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '30d'
    const requestedCompanyId = searchParams.get('companyId')

    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const companyId = session.user.role === 'SUPER_ADMIN'
      ? (requestedCompanyId || undefined)
      : session.user.companyId

    const baseWhere = companyId ? { trip: { bus: { companyId } } } : {}

    const [
      totalBookings,
      totalRevenue,
      activeTrips,
      recentBookings,
      revenueByDay,
    ] = await Promise.all([
      prisma.booking.count({ where: baseWhere }),
      prisma.booking.aggregate({
        where: { status: 'PAID', createdAt: { gte: startDate }, ...baseWhere },
        _sum: { total: true },
      }),
      prisma.trip.count({
        where: { status: 'SCHEDULED', ...(companyId ? { bus: { companyId } } : {}) },
      }),
      prisma.booking.findMany({
        where: baseWhere,
        include: {
          trip: { include: { bus: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.booking.findMany({
        where: { status: 'PAID', createdAt: { gte: startDate }, ...baseWhere },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // Group by day
    const revenueMap = new Map<string, number>()
    for (const entry of revenueByDay) {
      const day = entry.createdAt.toISOString().split('T')[0]
      revenueMap.set(day, (revenueMap.get(day) || 0) + (entry.total || 0))
    }

    const chartData = Array.from(revenueMap.entries()).map(([day, revenue]) => ({
      day,
      revenue: Math.round(revenue * 100) / 100,
    }))

    return NextResponse.json({
      totalBookings,
      totalRevenue: totalRevenue._sum.total || 0,
      activeTrips,
      recentBookings: recentBookings.map(b => ({ ...b, paidAt: b.paidAt ? b.paidAt.toISOString() : null })),
      chartData,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}