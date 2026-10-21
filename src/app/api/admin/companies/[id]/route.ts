import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { MAX_DAILY_SEATS, MAX_SEATS_PER_BOOKING } from '@/lib/booking-limits'
import { creditLimitValueSchema } from '@/lib/validations'
import { audit } from '@/lib/audit'

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
    if (creditLimit !== undefined) {
      // The same rule the dedicated credit-limit endpoint applies: a limit is
      // a ceiling on what a company may owe, and a negative one is not a
      // smaller allowance. It is refused here rather than stored.
      const parsed = creditLimitValueSchema.safeParse(creditLimit)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
      }
      updateData.creditLimit = parsed.data
    }
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

    const company = await prisma.$transaction(async (tx) => {
      // A credit limit that moves is a change to the company's exposure, and
      // it is written down: the limit before and after, the exact change, the
      // reason, and who did it. The dedicated credit-limit endpoint has
      // always done this; this path could change the limit without a word of
      // it, which left a change with no trace of it.
      //
      // Nothing is written when the limit did not actually move. A log row
      // that records a change of zero is a record of nothing, and a pile of
      // them hides the ones that matter.
      let creditLog: { previousLimit: number; newLimit: number; changeAmount: number } | null = null
      if (creditLimit !== undefined) {
        const before = await tx.company.findUnique({
          where: { id },
          select: { creditLimit: true },
        })
        const previousLimit = before?.creditLimit ?? 0
        const newLimit = Number(creditLimit)
        if (Number.isFinite(newLimit) && newLimit !== previousLimit) {
          creditLog = { previousLimit, newLimit, changeAmount: newLimit - previousLimit }
        }
      }

      const updated = await tx.company.update({
        where: { id },
        data: updateData,
      })

      if (creditLog) {
        await tx.creditLog.create({
          data: {
            companyId: id,
            previousLimit: creditLog.previousLimit,
            newLimit: creditLog.newLimit,
            changeAmount: creditLog.changeAmount,
            reason: 'Credit limit changed from the company settings',
            createdById: session.user.id,
            createdByEmail: session.user.email || '',
          },
        })
        await audit({
          action: 'UPDATE',
          entity: 'CreditLimit',
          entityId: id,
          companyId: id,
          session,
          metadata: creditLog,
          client: tx,
        })
      }

      return updated
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
