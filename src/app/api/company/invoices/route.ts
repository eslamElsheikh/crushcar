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

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const where: Record<string, unknown> = { companyId }
    if (status) where.status = status

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.invoice.count({ where }),
    ])

    return NextResponse.json({
      data: invoices.map(inv => ({
        ...inv,
        periodStart: inv.periodStart.toISOString(),
        periodEnd: inv.periodEnd.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        paidAt: inv.paidAt?.toISOString() || null,
        createdAt: inv.createdAt.toISOString(),
        updatedAt: inv.updatedAt.toISOString(),
      })),
      pagination: { page, take, total, pages: Math.ceil(total / take) },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { companyId, periodStart, periodEnd, dueDate, notes } = await req.json()
    if (!companyId || !periodStart || !periodEnd || !dueDate) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const bookings = await prisma.companyBooking.findMany({
      where: {
        companyId,
        createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
        status: { in: ['PAID', 'BOARDED'] },
      },
    })

    const totalAmount = bookings.reduce((sum, b) => sum + b.paidOnCredit, 0)

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalAmount,
        dueDate: new Date(dueDate),
        notes: notes || '',
        status: totalAmount > 0 ? 'PENDING' : 'PAID',
      },
    })

    return NextResponse.json({
      ...invoice,
      periodStart: invoice.periodStart.toISOString(),
      periodEnd: invoice.periodEnd.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
