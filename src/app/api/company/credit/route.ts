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

    const [totalBookings, totalSpent] = await Promise.all([
      prisma.companyBooking.count({ where: { companyId } }),
      prisma.companyBooking.aggregate({
        where: { companyId, status: { in: ['PAID', 'BOARDED'] } },
        _sum: { total: true },
      }),
    ])

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
      totalBookings,
      totalSpent: totalSpent._sum.total || 0,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
