import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  REVENUE_STATUS_FILTER,
  activeTripWhere,
  businessMonth,
  rangeStart,
  round2,
} from '@/lib/analytics'

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '180d': 180 }

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const availableCredit = round2(company.creditLimit - company.outstandingBalance)
    const usagePercent =
      company.creditLimit > 0
        ? Math.round((company.outstandingBalance / company.creditLimit) * 100)
        : 0

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '180d'
    const days = RANGE_DAYS[range] ?? RANGE_DAYS['180d']
    const since = rangeStart(days)

    const [
      totalBookings,
      totalSpent,
      monthlyRows,
      charterRequested,
      charterConfirmed,
      charterRevenue,
      pendingTripRequests,
      activeTrips,
      cancellations,
    ] = await Promise.all([
      prisma.companyBooking.count({ where: { companyId, status: { not: 'CANCELLED' } } }),
      prisma.companyBooking.aggregate({
        where: { companyId, status: REVENUE_STATUS_FILTER },
        _sum: { total: true },
      }),
      prisma.companyBooking.findMany({
        where: { companyId, status: REVENUE_STATUS_FILTER, createdAt: { gte: since } },
        select: { createdAt: true, total: true },
      }),
      prisma.charterBooking.count({
        where: { companyId, status: 'requested', createdAt: { gte: since } },
      }),
      prisma.charterBooking.count({
        where: { companyId, status: 'confirmed', createdAt: { gte: since } },
      }),
      prisma.charterBooking.aggregate({
        where: { companyId, status: 'confirmed', createdAt: { gte: since } },
        _sum: { price: true },
      }),
      prisma.tripRequest.count({ where: { companyId, status: 'PENDING' } }),
      prisma.trip.count({ where: activeTripWhere(companyId, new Date()) }),
      prisma.companyBooking.count({
        where: { companyId, status: 'CANCELLED', refundProcessedAt: null, refundAmount: { not: null } },
      }),
    ])

    const monthlyMap = new Map<string, number>()
    for (const row of monthlyRows) {
      const key = businessMonth(row.createdAt)
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + (row.total ?? 0))
    }
    const monthlySpend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, total]) => ({ month, total: round2(total) }))

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        creditLimit: company.creditLimit,
        walletBalance: company.walletBalance,
        paymentMode: company.paymentMode,
        outstandingBalance: company.outstandingBalance,
        billingCycle: company.billingCycle,
        lastBillingDate: company.lastBillingDate?.toISOString() || null,
        isActive: company.isActive,
      },
      range,
      availableCredit,
      walletBalance: company.walletBalance,
      outstandingBalance: company.outstandingBalance,
      usagePercent,
      nearLimit: usagePercent >= 80 && company.creditLimit > 0,
      overLimit: company.outstandingBalance > company.creditLimit,
      totalBookings,
      totalSpent: round2(totalSpent._sum.total ?? 0),
      monthlySpend,
      charter: {
        requested: charterRequested,
        confirmed: charterConfirmed,
        revenue: round2(charterRevenue._sum.price ?? 0),
      },
      pendingTripRequests,
      pendingCancellations: cancellations,
      activeTrips,
    })
  } catch (err) {
    console.error('[company/credit]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}