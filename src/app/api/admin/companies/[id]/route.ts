import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, buses: true } },
      },
    })

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const availableCredit = company.creditLimit - company.outstandingBalance

    const [totalBookings, totalSpent] = await Promise.all([
      prisma.companyBooking.count({ where: { companyId: id } }),
      prisma.companyBooking.aggregate({
        where: { companyId: id, status: { in: ['PAID', 'BOARDED'] } },
        _sum: { total: true },
      }),
    ])

    return NextResponse.json({
      ...company,
      lastBillingDate: company.lastBillingDate?.toISOString() || null,
      createdAt: company.createdAt.toISOString(),
      availableCredit,
      totalBookings,
      totalSpent: totalSpent._sum.total || 0,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { name, subdomain, creditLimit, paymentMode, billingCycle, isActive } = await req.json()

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (subdomain !== undefined) updateData.subdomain = subdomain
    if (creditLimit !== undefined) updateData.creditLimit = creditLimit
    if (paymentMode !== undefined) updateData.paymentMode = paymentMode
    if (billingCycle !== undefined) updateData.billingCycle = billingCycle
    if (isActive !== undefined) updateData.isActive = isActive

    const company = await prisma.company.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      ...company,
      lastBillingDate: company.lastBillingDate?.toISOString() || null,
      createdAt: company.createdAt.toISOString(),
    })
  } catch (err: any) {
    console.error(err)
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Subdomain already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
