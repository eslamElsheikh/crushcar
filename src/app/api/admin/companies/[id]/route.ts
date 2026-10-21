import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { MAX_DAILY_SEATS, MAX_SEATS_PER_BOOKING } from '@/lib/booking-limits'

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
    const { name, subdomain, creditLimit, paymentMode, billingCycle, isActive, autoPayEnabled, maxSeatsPerBooking, maxDailySeats } = await req.json()

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (subdomain !== undefined) updateData.subdomain = subdomain
    if (creditLimit !== undefined) updateData.creditLimit = creditLimit
    if (paymentMode !== undefined) updateData.paymentMode = paymentMode
    if (billingCycle !== undefined) updateData.billingCycle = billingCycle
    if (isActive !== undefined) updateData.isActive = isActive
    // Automatic payment: the booking is charged to the wallet or the credit
    // line as it is created, instead of waiting for the company to settle it.
    if (autoPayEnabled !== undefined) updateData.autoPayEnabled = Boolean(autoPayEnabled)
    // The ceiling on seats in one booking. Null means the application default.
    // Zero is not a valid ceiling — it would mean "no seats at all", which is
    // what isActive and autoPayEnabled are for.
    //
    // The stored value may only lower the ceiling, never raise it. Ten seats
    // is the business rule, and a stored number is not a decision to change
    // that, so a request for more is refused rather than quietly stored and
    // then ignored.
    if (maxSeatsPerBooking !== undefined) {
      if (maxSeatsPerBooking === null || maxSeatsPerBooking === '') {
        updateData.maxSeatsPerBooking = null
      } else {
        const parsed = parseInt(String(maxSeatsPerBooking), 10)
        if (!Number.isFinite(parsed) || parsed < 1) {
          return NextResponse.json({ error: 'Seat cap must be at least 1' }, { status: 400 })
        }
        if (parsed > MAX_SEATS_PER_BOOKING) {
          return NextResponse.json(
            { error: `Seat cap cannot be more than ${MAX_SEATS_PER_BOOKING}` },
            { status: 400 },
          )
        }
        updateData.maxSeatsPerBooking = parsed
      }
    }
    // The overall daily cap: how many seats this company may hold on one
    // travel date, across every trip, route, direction and bus on that date.
    //
    // Null means no daily cap. It is not the ten-seat per-booking ceiling and
    // it is not bounded by it: a company may hold more seats across a day than
    // it may hold in one booking.
    if (maxDailySeats !== undefined) {
      if (maxDailySeats === null || maxDailySeats === '') {
        updateData.maxDailySeats = null
      } else {
        const parsed = parseInt(String(maxDailySeats), 10)
        if (!Number.isFinite(parsed) || parsed < 1) {
          return NextResponse.json(
            { error: 'The daily cap must be at least 1' },
            { status: 400 },
          )
        }
        if (parsed > MAX_DAILY_SEATS) {
          return NextResponse.json(
            { error: `The daily cap cannot be more than ${MAX_DAILY_SEATS}` },
            { status: 400 },
          )
        }
        updateData.maxDailySeats = parsed
      }
    }

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
