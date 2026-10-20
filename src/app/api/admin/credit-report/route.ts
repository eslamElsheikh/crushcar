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

    const [companies, platformRows] = await Promise.all([
      prisma.company.findMany({
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
      }),
      // Seats the platform covered on this company's buses. The platform owes
      // the company for them and has not paid, so they are shown on their own
      // column rather than mixed into the credit totals.
      prisma.booking.findMany({
        where: { fundingSource: 'PLATFORM', status: { in: ['PAID', 'BOARDED'] } },
        select: { total: true, trip: { select: { bus: { select: { companyId: true } } } } },
      }),
    ])

    // The platform-funded bookings belong to the company that operates the bus,
    // not to the admin who made them.
    const unsettledByCompany = new Map<string, number>()
    for (const row of platformRows) {
      const owner = row.trip.bus.companyId
      if (!owner) continue
      unsettledByCompany.set(owner, (unsettledByCompany.get(owner) ?? 0) + row.total)
    }

    const report = companies.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      availableCredit: Math.round((c.creditLimit - c.outstandingBalance) * 100) / 100,
      usagePercent: c.creditLimit > 0 ? Math.round((c.outstandingBalance / c.creditLimit) * 100) : 0,
      platformUnsettled: Math.round((unsettledByCompany.get(c.id) ?? 0) * 100) / 100,
    }))

    const totals = report.reduce(
      (acc, c) => ({
        creditLimit: acc.creditLimit + c.creditLimit,
        outstandingBalance: acc.outstandingBalance + c.outstandingBalance,
        walletBalance: acc.walletBalance + c.walletBalance,
        platformUnsettled: acc.platformUnsettled + c.platformUnsettled,
      }),
      { creditLimit: 0, outstandingBalance: 0, walletBalance: 0, platformUnsettled: 0 },
    )
    totals.creditLimit = Math.round(totals.creditLimit * 100) / 100
    totals.outstandingBalance = Math.round(totals.outstandingBalance * 100) / 100
    totals.walletBalance = Math.round(totals.walletBalance * 100) / 100
    totals.platformUnsettled = Math.round(totals.platformUnsettled * 100) / 100

    return NextResponse.json({ companies: report, totals, includeInactive })
  } catch (err) {
    console.error('[admin/credit-report]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
