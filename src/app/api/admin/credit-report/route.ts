import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const includeInactive = searchParams.get('all') === '1'

    const companies = await prisma.company.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: {
        id: true,
        name: true,
        subdomain: true,
        plan: true,
        creditLimit: true,
        walletBalance: true,
        paymentMode: true,
        outstandingBalance: true,
        billingCycle: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { outstandingBalance: 'desc' },
    })

    const report = companies.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      availableCredit: Math.round((c.creditLimit - c.outstandingBalance) * 100) / 100,
      usagePercent: c.creditLimit > 0 ? Math.round((c.outstandingBalance / c.creditLimit) * 100) : 0,
    }))

    const totals = report.reduce(
      (acc, c) => ({
        creditLimit: acc.creditLimit + c.creditLimit,
        outstandingBalance: acc.outstandingBalance + c.outstandingBalance,
        walletBalance: acc.walletBalance + c.walletBalance,
      }),
      { creditLimit: 0, outstandingBalance: 0, walletBalance: 0 },
    )
    totals.creditLimit = Math.round(totals.creditLimit * 100) / 100
    totals.outstandingBalance = Math.round(totals.outstandingBalance * 100) / 100
    totals.walletBalance = Math.round(totals.walletBalance * 100) / 100

    return NextResponse.json({ companies: report, totals, includeInactive })
  } catch (err) {
    console.error('[admin/credit-report]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
