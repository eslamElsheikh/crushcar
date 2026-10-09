import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { activeTripWhere, rangeStart, getRevenueBreakdown, round2 } from '@/lib/analytics'

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

// Everything here is platform-wide financial data — SUPER_ADMIN only.
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '30d'
    const days = RANGE_DAYS[range] ?? RANGE_DAYS['30d']
    const since = rangeStart(days)
    const now = new Date()

    const [
      creditAgg,
      activeCompanies,
      totalCompanies,
      pendingDeposits,
      charterRequested,
      charterConfirmed,
      charterCancelled,
      charterRevenue,
      activeTrips,
      revenue,
    ] = await Promise.all([
      prisma.company.aggregate({
        where: { isActive: true },
        _sum: { creditLimit: true, outstandingBalance: true, walletBalance: true },
      }),
      prisma.company.count({ where: { isActive: true } }),
      prisma.company.count(),
      prisma.depositRequest.aggregate({
        where: { status: 'PENDING' },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.charterBooking.count({ where: { status: 'requested', createdAt: { gte: since } } }),
      prisma.charterBooking.count({ where: { status: 'confirmed', createdAt: { gte: since } } }),
      prisma.charterBooking.count({
        where: { status: { in: ['cancelled', 'cancel_requested'] }, createdAt: { gte: since } },
      }),
      prisma.charterBooking.aggregate({
        where: { status: 'confirmed', createdAt: { gte: since } },
        _sum: { price: true },
      }),
      prisma.trip.count({ where: activeTripWhere(null, now) }),
      getRevenueBreakdown(prisma, { since }),
    ])

    const totalLimit = round2(creditAgg._sum.creditLimit ?? 0)
    const totalOutstanding = round2(creditAgg._sum.outstandingBalance ?? 0)

    return NextResponse.json({
      range,
      credit: {
        totalLimit,
        totalOutstanding,
        totalWallet: round2(creditAgg._sum.walletBalance ?? 0),
        usagePercent: totalLimit > 0 ? Math.round((totalOutstanding / totalLimit) * 100) : 0,
        activeCompanies,
        totalCompanies,
      },
      revenue,
      activeTrips,
      deposits: {
        pendingCount: pendingDeposits._count,
        pendingTotal: round2(pendingDeposits._sum.amount ?? 0),
      },
      charter: {
        requested: charterRequested,
        confirmed: charterConfirmed,
        cancelled: charterCancelled,
        revenue: round2(charterRevenue._sum.price ?? 0),
      },
    })
  } catch (err) {
    console.error('[admin/overview]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}