import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// SUPER_ADMIN credit + charter overview for the admin dashboard KPI row.
// Credit totals are live snapshots; charter/deposit stats respect ?range=.
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '30d'
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const since = new Date()
    since.setDate(since.getDate() - days)

    const [
      creditAgg,
      activeCompanies,
      pendingDeposits,
      charterRequested,
      charterConfirmed,
      charterCancelled,
      charterRevenue,
    ] = await Promise.all([
      prisma.company.aggregate({
        where: { isActive: true },
        _sum: { creditLimit: true, outstandingBalance: true, walletBalance: true },
      }),
      prisma.company.count({ where: { isActive: true } }),
      prisma.depositRequest.aggregate({
        where: { status: 'PENDING' },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.charterBooking.count({ where: { status: 'requested', createdAt: { gte: since } } }),
      prisma.charterBooking.count({ where: { status: 'confirmed', createdAt: { gte: since } } }),
      prisma.charterBooking.count({ where: { status: { in: ['cancelled', 'cancel_requested'] }, createdAt: { gte: since } } }),
      prisma.charterBooking.aggregate({
        where: { status: 'confirmed', createdAt: { gte: since } },
        _sum: { price: true },
      }),
    ])

    const totalLimit = creditAgg._sum.creditLimit || 0
    const totalOutstanding = creditAgg._sum.outstandingBalance || 0

    return NextResponse.json({
      credit: {
        totalLimit,
        totalOutstanding,
        totalWallet: creditAgg._sum.walletBalance || 0,
        usagePercent: totalLimit > 0 ? Math.round((totalOutstanding / totalLimit) * 100) : 0,
        activeCompanies,
      },
      deposits: {
        pendingCount: pendingDeposits._count,
        pendingTotal: pendingDeposits._sum.amount || 0,
      },
      charter: {
        requested: charterRequested,
        confirmed: charterConfirmed,
        cancelled: charterCancelled,
        revenue: charterRevenue._sum.price || 0,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
