import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    console.log('📊 Analytics - user:', session.user.email, 'role:', session.user.role, 'companyId:', session.user.companyId)

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '30d'
    const requestedCompanyId = searchParams.get('companyId')

    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const companyId = session.user.role === 'SUPER_ADMIN'
      ? (requestedCompanyId || undefined)
      : session.user.companyId

    console.log('📊 Analytics - using companyId:', companyId, 'days:', days)

    const baseWhere = companyId ? { trip: { bus: { companyId } } } : {}

    const totalBookingsCount = await prisma.booking.count({ where: baseWhere })
    console.log('📊 totalBookings:', totalBookingsCount)

    const baseWhereCancelled = companyId ? { trip: { bus: { companyId } } } : {}

    const [
      totalBookings,
      totalRevenue,
      activeTrips,
      recentBookings,
      revenueByDay,
      customerCancellationsPending,
      companyCancellationsPending,
      customerCancellationsProcessed,
      companyCancellationsProcessed,
    ] = await Promise.all([
      Promise.resolve(totalBookingsCount),
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
      prisma.booking.count({
        where: { status: 'CANCELLED', refundProcessedAt: null, ...baseWhereCancelled },
      }),
      prisma.companyBooking.count({
        where: { status: 'CANCELLED', refundProcessedAt: null, refundAmount: { not: null } },
      }),
      prisma.booking.count({
        where: { status: 'CANCELLED', refundProcessedAt: { not: null }, ...baseWhereCancelled },
      }),
      prisma.companyBooking.count({
        where: { status: 'CANCELLED', refundProcessedAt: { not: null } },
      }),
    ])

    console.log('📊 revenue:', totalRevenue._sum.total, 'activeTrips:', activeTrips, 'recentBookings:', recentBookings.length)

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
      cancellations: {
        customerPending: customerCancellationsPending,
        companyPending: companyCancellationsPending,
        customerProcessed: customerCancellationsProcessed,
        companyProcessed: companyCancellationsProcessed,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}