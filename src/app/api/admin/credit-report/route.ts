import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companies = await prisma.company.findMany({
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

    const report = companies.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      availableCredit: c.creditLimit - c.outstandingBalance,
      usagePercent: c.creditLimit > 0 ? Math.round((c.outstandingBalance / c.creditLimit) * 100) : 0,
    }))

    return NextResponse.json(report)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
