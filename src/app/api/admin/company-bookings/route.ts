import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { nextBookingRef, withRefRetry } from '@/lib/booking-reference'
import { lockRow } from '@/lib/row-lock'
import { resolveBookingLimits } from '@/lib/company-quota'
import { chargeCompanyWithCreditTopUp, splitCharge } from '@/lib/company-charge'
import { audit } from '@/lib/audit'
import { parseCollectAmount } from '@/lib/validations'
import '@/lib/payments'
import { BOOKING_ISOLATION } from '@/lib/transaction-isolation'
import { assertSeatsBookable } from '@/lib/seat-availability'

export const dynamic = 'force-dynamic'

/**
 * The company bookings a super admin made on a company's behalf.
 *
 * The filter is on the creator, not the company: this is the list of
 * "bookings I made for someone else". A booking the company made itself has
 * no creator, so it is not in this list — it is in the company's own bookings.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const bookings = await prisma.companyBooking.findMany({
      where: { createdByUserId: { not: null }, ...(companyId ? { companyId } : {}) },
      include: {
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        trip: { select: { id: true, origin: true, destination: true, departure: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        companyId: b.companyId,
        companyName: b.company?.name || b.companyId,
        createdBy: b.createdBy,
        seatLabel: b.seatLabel,
        passengerName: b.passengerName,
        total: b.total,
        status: b.status,
        trip: b.trip,
        createdAt: b.createdAt.toISOString(),
        paidAt: b.paidAt?.toISOString() || null,
      })),
    })
  } catch (err) {
    logger.error('[Admin Company Bookings GET list]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * A super admin books seats on a company's behalf.
 *
 * The booking belongs to the company: it is a CompanyBooking, so it appears in
 * that company's bookings, its credit report and its revenue, exactly as if
 * the company had made it. The person who made it is recorded separately in
 * createdByUserId, so the owner of the booking and the creator of the booking
 * are never confused for one another.
 *
 * The company's own wallet pays for it. Not the platform wallet, not the
 * credit line, and never a negative balance: if the wallet cannot cover the
 * booking the whole thing is refused and nothing is written.
 *
 * This is a different thing from the platform-funded booking, which is a
 * different table and a different wallet. Both exist; neither is the other.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const {
      tripId,
      companyId,
      passengers,
      fromStationId,
      toStationId,
      roundTripGroupId,
      idempotencyKey,
    }: {
      tripId: string
      companyId: string
      passengers: {
        seatLabel: string
        passengerName?: string
        passengerPhone?: string
        passengerHotel?: string
        passengerNotes?: string
        collectAmount?: unknown
      }[]
      fromStationId?: string | null
      toStationId?: string | null
      roundTripGroupId?: string | null
      idempotencyKey?: string
    } = await req.json()

    if (!tripId || !companyId || !passengers?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: 'An idempotency key is required' }, { status: 400 })
    }

    // The company is looked up here, on the server. A company id in the body
    // is never trusted on its own, and only a super admin may name a company
    // that is not their own.
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: 'No company linked' }, { status: 404 })
    }
    if (!company.isActive) {
      return NextResponse.json({ error: 'COMPANY_INACTIVE', message: 'حساب الشركة غير مفعّل' }, { status: 403 })
    }

    return await withRefRetry(() => prisma.$transaction(async (tx) => {
      // Lock order: company, then trip, then the quota rows.
      await lockRow(tx, 'Company', companyId)

      // A replay of a request that was already charged is refused here, while
      // the company lock is held. Two requests with the same key are therefore
      // decided one after the other, and the second one sees the first one's
      // rows.
      //
      // The check has to be on the bookings and not only on the wallet
      // ledger: a booking paid entirely on credit moves no money, so there is
      // no ledger row to find.
      const replay = await tx.companyBooking.findFirst({
        where: { companyId, idempotencyKey },
        select: { id: true, reference: true },
      })
      if (replay) {
        const err = new Error('Duplicate charge')
        ;(err as Error & { code?: string }).code = 'DUPLICATE_CHARGE'
        throw err
      }

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
        },
      })
      if (!trip) throw new Error('Trip not found')
      if (trip.bookingMode === 'BUS' || trip.reservedByCompanyId) {
        throw new Error('CHARTER_TRIP')
      }
      if (trip.status !== 'SCHEDULED') throw new Error('TRIP_NOT_BOOKABLE')

      await lockRow(tx, 'Trip', tripId)

      let fromStopOrder = 1
      let toStopOrder = 1
      let fromStationName = trip.origin
      let toStationName = trip.destination

      if (fromStationId && toStationId && trip.tripStops.length > 0) {
        const fromStop = trip.tripStops.find((s) => s.stationId === fromStationId)
        const toStop = trip.tripStops.find((s) => s.stationId === toStationId)
        if (!fromStop || !toStop) throw new Error('Invalid stations')
        if (fromStop.stopOrder >= toStop.stopOrder) throw new Error('fromStation must be before toStation')
        fromStopOrder = fromStop.stopOrder
        toStopOrder = toStop.stopOrder
        fromStationName = fromStop.station?.name || trip.origin
        toStationName = toStop.station?.name || trip.destination
      } else if (trip.tripStops.length > 0) {
        fromStopOrder = trip.tripStops[0].stopOrder
        toStopOrder = trip.tripStops[trip.tripStops.length - 1].stopOrder
        fromStationName = trip.tripStops[0].station?.name || trip.origin
        toStationName = trip.tripStops[trip.tripStops.length - 1].station?.name || trip.destination
      }

      // The same pricing the search and the company path use.
      const priced = passengers.map((p) => {
        const price = (fromStationId && toStationId && trip.tripStops.length > 0)
          ? segmentPriceOf(trip, fromStationId, toStationId)
          : (trip.bus.layout?.seats.find((s: any) => s.label === p.seatLabel)?.price || trip.price)
        return { ...p, price }
      })
      const total = priced.reduce((sum, p) => sum + p.price, 0)

      // The seat limits, shared with the company's own booking path.
      const limits = await resolveBookingLimits(tx, {
        company,
        tripId,
        trip,
        requestedSeats: priced.length,
        roundTripGroupId: roundTripGroupId || null,
      })

      // Every seat is checked before anything is written: it has to exist,
      // it must not be blocked, and it must be free for the leg being
      // booked.
      await assertSeatsBookable(tx, {
        tripId,
        seatLabels: priced.map((p) => p.seatLabel),
        layoutSeatLabels: (trip.bus.layout?.seats ?? []).map((s: any) => s.label),
        fromStopOrder,
        toStopOrder,
      })

      // The references are drawn before the money moves, so the credit log can
      // name the booking that caused an automatic limit increase.
      const references: string[] = []
      for (const p of priced) {
        references.push(
          await nextBookingRef(tx, {
            fromStation: fromStationName,
            toStation: toStationName,
            seatLabel: p.seatLabel,
          }),
        )
      }

      // The company's own money: the wallet first, then the credit the
      // company already has, and if that is not enough the credit limit is
      // raised by exactly the shortfall.
      //
      // A prepaid company has no credit line. It is refused when its wallet
      // is short, and its limit is not touched.
      const charge = await chargeCompanyWithCreditTopUp(tx, {
        companyId,
        total,
        reference: tripId,
        description: `Payment for booking on ${trip.origin} → ${trip.destination}`,
        idempotencyKey: `charge:${idempotencyKey}`,
        actorId: session.user.id,
        actorEmail: session.user.email ?? '',
        bookingReference: references[0] ?? null,
      })

      if (charge.creditLimitIncrease > 0) {
        // The generic audit trail, written inside the transaction so it
        // rolls back with the increase it describes.
        await audit({
          action: 'UPDATE',
          entity: 'CreditLimit',
          entityId: companyId,
          companyId,
          session: { user: { id: session.user.id, email: session.user.email ?? '' } },
          metadata: {
            previousLimit: charge.previousCreditLimit,
            newLimit: charge.newCreditLimit,
            changeAmount: charge.creditLimitIncrease,
            reason: 'Automatic credit increase for a Super Admin company booking',
            bookingReference: references[0] ?? null,
          },
          client: tx,
        })
      }

      const walletShares = splitCharge(charge.paidFromWallet, priced.length)
      const creditShares = splitCharge(charge.paidOnCredit, priced.length)

      const created: any[] = []
      for (const [index, p] of priced.entries()) {
        const reference = references[index]
        const booking = await tx.companyBooking.create({
          data: {
            reference,
            companyId,
            customerId: null,
            tripId,
            seatLabel: p.seatLabel,
            passengerName: p.passengerName || '',
            passengerPhone: p.passengerPhone || '',
            passengerHotel: p.passengerHotel || '',
            passengerNotes: p.passengerNotes || '',
            collectAmount: parseCollectAmount(p.collectAmount),
            bookingType: 'FOR_CLIENT',
            // Paid at once: the money has already left the company's wallet
            // and, where it was needed, its credit line.
            status: 'PAID',
            paidAt: new Date(),
            expiresAt: null,
            total: p.price,
            paidFromWallet: walletShares[index] ?? 0,
            paidOnCredit: creditShares[index] ?? 0,
            // The audit trail: the company owns the booking, this user made it.
            createdByUserId: session.user.id,
            // The request that made it, so a retry can be recognised.
            idempotencyKey,
            roundTripGroupId: roundTripGroupId || null,
            fromStopOrder,
            toStopOrder,
          },
          include: {
            trip: {
              include: {
                bus: true,
                tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' as const } },
              },
            },
          },
        })
        created.push(booking)
      }

      const companyAfter = await tx.company.findUniqueOrThrow({ where: { id: companyId } })

      return NextResponse.json({
        bookings: created.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          paidAt: b.paidAt?.toISOString() || null,
          stops: b.trip?.tripStops,
        })),
        charged: charge.paidFromWallet,
        chargedOnCredit: charge.paidOnCredit,
        creditLimitIncrease: charge.creditLimitIncrease,
        previousCreditLimit: charge.previousCreditLimit,
        newCreditLimit: charge.newCreditLimit,
        walletBalance: companyAfter.walletBalance,
        outstandingBalance: companyAfter.outstandingBalance,
        limits: {
          maxSeats: limits.maxSeats,
          tripLimit: limits.tripLimit,
          routeLimit: limits.routeLimit,
          tripUsed: limits.tripUsed,
          routeUsed: limits.routeUsed,
          dailyLimit: limits.dailyLimit,
          dailyUsed: limits.dailyUsed,
        },
        requiresPayment: false,
      })
    }, BOOKING_ISOLATION))
  } catch (err: any) {
    const code = err?.code
    // A unique-constraint failure on the idempotency key means a request with
    // this key is already being charged. It is a conflict, not a server
    // fault, and it must not be reported as one.
    if (code === 'P2002') {
      const target = String(err?.meta?.target ?? '')
      if (target.includes('idempotencyKey')) {
        return NextResponse.json(
          { error: 'ALREADY_BOOKED', message: 'هذا الحجز مُسجَّل بالفعل' },
          { status: 409 },
        )
      }
    }
    if (code === 'UNKNOWN_SEAT') {
      return NextResponse.json(
        { error: 'UNKNOWN_SEAT', message: `الكرسي ${err.seatLabel} غير موجود في تصميم الحافلة` },
        { status: 400 }
      )
    }
    if (code === 'SEAT_BLOCKED') {
      return NextResponse.json(
        { error: 'SEAT_BLOCKED', message: `الكرسي ${err.seatLabel} معطَّل من الإدارة` },
        { status: 409 }
      )
    }
    if (code === 'SEAT_CONFLICT') {
      return NextResponse.json(
        { error: 'SEAT_TAKEN', message: `الكرسي ${err.seatLabel} محجوز من شخص آخر` },
        { status: 409 }
      )
    }
    if (code === 'UNRESOLVED_ROUTE') {
      return NextResponse.json(
        {
          error: 'UNRESOLVED_ROUTE',
          message:
            err.problem === 'NO_STOPS'
              ? 'هذه الرحلة بلا محطات، فلا يمكن تحديد مسارها ولا تطبيق الحصة اليومية عليها. أضف محطات الرحلة أو احذفها.'
              : 'مفتاح المسار المخزَّن لهذه الرحلة لا يطابق محطاتها، فلا يمكن تطبيق الحصة اليومية عليها. أعد اشتقاق مفاتيح المسارات.',
          problem: err.problem,
          tripId: err.tripId,
        },
        { status: 409 }
      )
    }
    if (code === 'DAILY_QUOTA_EXCEEDED') {
      return NextResponse.json(
        {
          error: 'DAILY_QUOTA_EXCEEDED',
          message: `الحصة اليومية لهذه الشركة في هذا اليوم مكتملة، والمتاح ${err.remaining} مقاعد`,
        },
        { status: 413 },
      )
    }
    if (code === 'SEAT_CAP_EXCEEDED') {
      return NextResponse.json(
        { error: 'SEAT_CAP_EXCEEDED', message: `الحد الأقصى للحجز الواحد ${err.max} مقاعد` },
        { status: 413 },
      )
    }
    if (code === 'TRIP_QUOTA_EXCEEDED') {
      return NextResponse.json(
        {
          error: 'TRIP_QUOTA_EXCEEDED',
          message:
            err.kind === 'ROUTE'
              ? `الحصة اليومية المشتركة لهذا المسار في هذا اليوم ${err.remaining} مقعد`
              : `الحصة المتاحة على هذه الرحلة ${err.remaining} مقاعد`,
        },
        { status: 413 },
      )
    }
    if (code === 'DUPLICATE_CHARGE') {
      return NextResponse.json(
        { error: 'ALREADY_BOOKED', message: 'هذا الحجز مُسجَّل بالفعل' },
        { status: 409 },
      )
    }
    if (code === 'INSUFFICIENT_WALLET') {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_WALLET',
          // A prepaid company has no credit line to fall back on, so the
          // message says the limit was not raised rather than leaving the
          // administrator to wonder whether it was.
          message: 'رصيد محفظة الشركة غير كافٍ',
          available: err.available,
          required: err.required,
          creditLimitIncreased: false,
        },
        { status: 400 },
      )
    }
    if (code === 'COMPANY_INACTIVE') {
      return NextResponse.json({ error: 'COMPANY_INACTIVE', message: 'حساب الشركة غير مفعّل' }, { status: 403 })
    }
    const message = String(err?.message || '')
    if (message === 'CHARTER_TRIP') {
      return NextResponse.json(
        { error: 'CHARTER_TRIP', message: 'هذه رحلة شارتر، الحجز متاح عبر طلب الشارتر فقط' },
        { status: 409 },
      )
    }
    if (message === 'TRIP_NOT_BOOKABLE') {
      return NextResponse.json({ error: 'TRIP_NOT_BOOKABLE', message: 'هذه الرحلة غير متاحة للحجز' }, { status: 400 })
    }
    if (message === 'Invalid stations' || message.includes('fromStation must be before')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    if (message === 'Trip not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    logger.error('[Admin Company Bookings]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * The fare for a leg, from the trip's own stop prices. The same arithmetic
 * the search and the customer path use, so what is shown is what is charged.
 */
function segmentPriceOf(
  trip: { tripStops: { stationId: string; stopOrder: number; priceFromOrigin: number }[] },
  fromStationId: string,
  toStationId: string,
): number {
  const from = trip.tripStops.find((s) => s.stationId === fromStationId)
  const to = trip.tripStops.find((s) => s.stationId === toStationId)
  if (!from || !to) return 0
  return to.priceFromOrigin - from.priceFromOrigin
}
