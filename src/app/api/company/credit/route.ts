import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const availableCredit = company.creditLimit - company.outstandingBalance
    const usagePercent = company.creditLimit > 0
      ? Math.round((company.outstandingBalance / company.creditLimit) * 100)
      : 0

    const sixAgo = new Date()
    sixAgo.setDate(1)
    sixAgo.setMonth(sixAgo.getMonth() - 5)
    sixAgo.setHours(0, 0, 0, 0)

    const [
      totalBookings,
      totalSpent,
      monthlyRows,
      charterRequested,
      charterConfirmed,
      charterRevenue,
      pendingTripRequests,
      dueInvoices,
    ] = await Promise.all([
      prisma.companyBooking.count({ where: { companyId } }),
      prisma.companyBooking.aggregate({
        where: { companyId, status: { in: ['PAID', 'BOARDED'] } },
        _sum: { total: true },
      }),
      prisma.companyBooking.findMany({
        where: { companyId, status: { in: ['PAID', 'BOARDED'] }, createdAt: { gte: sixAgo } },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.charterBooking.count({ where: { companyId, status: 'requested' } }),
      prisma.charterBooking.count({ where: { companyId, status: 'confirmed' } }),
      prisma.charterBooking.aggregate({
        where: { companyId, status: 'confirmed' },
        _sum: { price: true },
      }),
      prisma.tripRequest.count({ where: { companyId, status: 'PENDING' } }),
      prisma.invoice.aggregate({
        where: { companyId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
    ])

    const monthlyMap = new Map<string, number>()
    for (const r of monthlyRows) {
      const key = r.createdAt.toISOString().slice(0, 7)
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + (r.total || 0))
    }
    const monthlySpend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }))

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
      availableCredit,
      walletBalance: company.walletBalance,
      outstandingBalance: company.outstandingBalance,
      usagePercent,
      nearLimit: usagePercent >= 80 && company.creditLimit > 0,
      totalBookings,
      totalSpent: totalSpent._sum.total || 0,
      monthlySpend,
      charter: {
        requested: charterRequested,
        confirmed: charterConfirmed,
        revenue: charterRevenue._sum.price || 0,
      },
      pendingTripRequests,
      dueInvoices: {
        count: dueInvoices._count,
        total: Math.max(0, (dueInvoices._sum.totalAmount || 0) - (dueInvoices._sum.paidAmount || 0)),
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
