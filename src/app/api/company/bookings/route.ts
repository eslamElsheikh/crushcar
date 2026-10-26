import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { nextBookingRef, withRefRetry } from '@/lib/booking-reference'
import { parseCollectAmount } from '@/lib/validations'
import { BOOKING_ISOLATION } from '@/lib/transaction-isolation'
import { assertSeatsBookable } from '@/lib/seat-availability'
import { companyBookingExpiryHours } from '@/lib/booking-expiry'
import { companyPaymentDeadline } from '@/lib/payments'
import { chargeCompany, splitCharge } from '@/lib/company-charge'
import { lockRow } from '@/lib/row-lock'
import { resolveBookingLimits } from '@/lib/company-quota'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const q = searchParams.get('q')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const where: Record<string, unknown> = { companyId }
    if (status) where.status = status
    if (q) {
      where.OR = [
        { reference: { contains: q.toUpperCase() } },
        { passengerName: { contains: q } },
        { seatLabel: { contains: q.toUpperCase() } },
      ]
    }

    const [bookings, total] = await Promise.all([
      prisma.companyBooking.findMany({
        where,
        include: {
          trip: { include: { bus: true, tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } } },
          customer: true,
          // Who made the booking, when it was a super admin acting for the
          // company. The company owns the booking either way; this is only
          // the record of who pressed the button.
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.companyBooking.count({ where }),
    ])

    return NextResponse.json({
      data: bookings.map(b => {
        const fromStop = b.trip?.tripStops?.find((s: any) => s.stopOrder === b.fromStopOrder)
        const toStop = b.trip?.tripStops?.find((s: any) => s.stopOrder === b.toStopOrder)
        const actualDeparture = fromStop?.departureTime || fromStop?.arrivalTime || b.trip?.departure
        return {
          ...b,
          createdAt: b.createdAt.toISOString(),
          paidAt: b.paidAt?.toISOString() || null,
          cancelledAt: b.cancelledAt?.toISOString() || null,
          boardedAt: b.boardedAt?.toISOString() || null,
          actualOrigin: fromStop?.station?.name || b.trip?.origin,
          actualDestination: toStop?.station?.name || b.trip?.destination,
          actualDeparture: actualDeparture ? new Date(actualDeparture).toISOString() : undefined,
          stops: b.trip?.tripStops,
        }
      }),
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
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const { tripId, passengers, fromStationId, toStationId, customerId, bookingType, roundTripGroupId }: {
      tripId: string
      passengers: { seatLabel: string; passengerName: string; passengerPhone?: string; passengerHotel?: string; passengerNotes?: string; collectAmount?: unknown }[]
      fromStationId?: string | null
      toStationId?: string | null
      customerId?: string | null
      bookingType?: string
      roundTripGroupId?: string | null
    } = await req.json()

    if (!tripId || !passengers?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Retried as a whole transaction: a reference collision or a counter-row
    // write conflict can abort the transaction, so the create cannot resume
    // inside it.
    return await withRefRetry(() => prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new Error('Company not found')
      if (!company.isActive) throw new Error('COMPANY_INACTIVE')

      // The trip row is locked before anything is counted or created, so two
      // requests cannot both read the same seat or the same allowance and both
      // decide they fit. The company row is locked too, in the canonical order
      // (company, then platform wallet, then trip), so the balance and the
      // seat allowance cannot be spent twice over.
      await lockRow(tx, 'Company', companyId)

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          // station is needed to name the boarding and alighting stops in the
          // booking reference.
          tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
        },
      })
      if (!trip) throw new Error('Trip not found')
      if (trip.bookingMode === 'BUS' || trip.reservedByCompanyId) throw new Error('CHARTER_TRIP')

      await lockRow(tx, 'Trip', tripId)

      // How long an unpaid booking of this company may hold its seat.
      const expiryHours = await companyBookingExpiryHours()

      let globalFromStopOrder = 1
      let globalToStopOrder = 1
      // Station names for the reference, narrowed to the booked segment.
      let fromStationName = trip.origin
      let toStationName = trip.destination

      if (fromStationId && toStationId && trip.tripStops.length > 0) {
        const fromStop = trip.tripStops.find(s => s.stationId === fromStationId)
        const toStop = trip.tripStops.find(s => s.stationId === toStationId)
        if (!fromStop || !toStop) throw new Error('Invalid stations')
        if (fromStop.stopOrder >= toStop.stopOrder) throw new Error('fromStation must be before toStation')
        globalFromStopOrder = fromStop.stopOrder
        globalToStopOrder = toStop.stopOrder
        fromStationName = fromStop.station?.name || trip.origin
        toStationName = toStop.station?.name || trip.destination
      } else if (trip.tripStops.length > 0) {
        globalFromStopOrder = trip.tripStops[0].stopOrder
        globalToStopOrder = trip.tripStops[trip.tripStops.length - 1].stopOrder
        fromStationName = trip.tripStops[0].station?.name || trip.origin
        toStationName = trip.tripStops[trip.tripStops.length - 1].station?.name || trip.destination
      }

      // Calculate individual and total prices
      const seatPrices = passengers.map(p => {
        if (fromStationId && toStationId && trip.tripStops.length > 0) {
          const fromStop = trip.tripStops.find(s => s.stationId === fromStationId)
          const toStop = trip.tripStops.find(s => s.stationId === toStationId)
          const price = toStop && fromStop ? toStop.priceFromOrigin - fromStop.priceFromOrigin : trip.price
          return { ...p, price }
        }
        const seat = trip.bus.layout?.seats.find((s: any) => s.label === p.seatLabel)
        return { ...p, price: seat?.price || trip.price }
      })

      const grandTotal = seatPrices.reduce((sum, p) => sum + p.price, 0)

      // ── How many seats this booking may cover ─────────────────────────
      // The rules live in one place, shared with the path where a super admin
      // books on a company's behalf, so the two cannot drift apart.
      const _limits = await resolveBookingLimits(tx, {
        company,
        tripId,
        trip,
        requestedSeats: seatPrices.length,
        roundTripGroupId: roundTripGroupId || null,
      })

      // Check every seat before creating any: it has to exist, it must not
      // be blocked, and it must be free for the leg being booked.
      await assertSeatsBookable(tx, {
        tripId,
        seatLabels: seatPrices.map((p) => p.seatLabel),
        layoutSeatLabels: (trip.bus.layout?.seats ?? []).map((s: any) => s.label),
        fromStopOrder: globalFromStopOrder,
        toStopOrder: globalToStopOrder,
      })

      // ── Payment ───────────────────────────────────────────────────────
      // With automatic payment on, the booking is charged as it is created
      // and is paid from the start. With it off, the booking waits as PENDING
      // and the company settles it with the confirm button, exactly as before.
      //
      // The charge happens in this same transaction as the rows, so a booking
      // is never paid for without the seats, and the seats are never taken
      // without the money.
      const autoPay = company.autoPayEnabled === true
      let paidFromWallet = 0
      let paidOnCredit = 0
      if (autoPay && grandTotal > 0) {
        const charge = await chargeCompany(tx, {
          companyId,
          total: grandTotal,
          description: `Payment for booking on ${trip.origin} → ${trip.destination}`,
        })
        paidFromWallet = charge.paidFromWallet
        paidOnCredit = charge.paidOnCredit
      }
      // The per-seat figures are what each booking row records. They are
      // split so they add back up to what was charged.
      const walletShares = splitCharge(paidFromWallet, seatPrices.length)
      const creditShares = splitCharge(paidOnCredit, seatPrices.length)

      // Create all bookings
      const created = []
      for (const [index, p] of seatPrices.entries()) {
        // Each seat gets its own serial, so a group of ten takes ten numbers off the
        // same counter — they roll back together with the transaction.
        const reference = await nextBookingRef(tx, {
          fromStation: fromStationName,
          toStation: toStationName,
          seatLabel: p.seatLabel,
        })
        const booking = await tx.companyBooking.create({
          data: {
            reference,
            companyId,
            customerId: customerId || null,
            tripId,
            seatLabel: p.seatLabel,
            passengerName: p.passengerName || '',
            passengerPhone: p.passengerPhone || '',
            passengerHotel: (p as any).passengerHotel || '',
            passengerNotes: (p as any).passengerNotes || '',
            // The booking form has always sent collectAmount and
            // passengerNotes, but the create dropped both on the floor, so the
            // ticket and the admin column could never show them. They are
            // written here now; parseCollectAmount is the single rule both
            // booking paths go through.
            collectAmount: parseCollectAmount(p.collectAmount),
            bookingType: bookingType || 'FOR_EMPLOYEE',
            status: autoPay ? 'PAID' : 'PENDING',
            paidAt: autoPay ? new Date() : null,
            // How long this booking may hold its seat unpaid. Until this was
            // written the column was declared and never set, so an unpaid
            // company booking kept its seat forever and kept eating into the
            // company's trip allowance. A booking that is already paid has
            // no window to expire.
            expiresAt: autoPay ? null : companyPaymentDeadline(new Date(trip.departure), expiryHours),
            total: p.price,
            paidFromWallet: walletShares[index] ?? 0,
            paidOnCredit: creditShares[index] ?? 0,
            roundTripGroupId: roundTripGroupId || null,
            fromStopOrder: globalFromStopOrder,
            toStopOrder: globalToStopOrder,
          },
          include: {
            trip: {
              include: {
                bus: true,
                tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
              },
            },
            customer: true,
          },
        })
        created.push(booking)
      }

      return NextResponse.json({
        bookings: created.map(b => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          stops: b.trip?.tripStops,
        })),
        walletBalance: company.walletBalance,
        creditLimit: company.creditLimit,
        outstandingBalance: company.outstandingBalance,
      })
    }, BOOKING_ISOLATION))
  } catch (err: any) {
    console.error(err)
    // The limit errors carry a code and their own numbers, so the message is
    // not parsed for them.
    if (err?.code === 'UNKNOWN_SEAT') {
      return NextResponse.json(
        { error: 'UNKNOWN_SEAT', message: `الكرسي ${err.seatLabel} غير موجود في تصميم الحافلة` },
        { status: 400 }
      )
    }
    if (err?.code === 'SEAT_BLOCKED') {
      return NextResponse.json(
        { error: 'SEAT_BLOCKED', message: `الكرسي ${err.seatLabel} معطَّل من الإدارة` },
        { status: 409 }
      )
    }
    if (err?.code === 'SEAT_CONFLICT') {
      return NextResponse.json(
        { error: 'SEAT_TAKEN', message: `الكرسي ${err.seatLabel} محجوز من شخص آخر` },
        { status: 409 }
      )
    }
    if (err?.code === 'UNRESOLVED_ROUTE') {
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
    if (err?.code === 'DAILY_QUOTA_EXCEEDED') {
      return NextResponse.json(
        {
          error: 'DAILY_QUOTA_EXCEEDED',
          message: `الحصة اليومية لهذه الشركة في هذا اليوم مكتملة، والمتاح ${err.remaining} مقاعد`,
        },
        { status: 413 },
      )
    }
    if (err?.code === 'SEAT_CAP_EXCEEDED') {
      return NextResponse.json(
        { error: 'SEAT_CAP_EXCEEDED', message: `الحد الأقصى للحجز الواحد ${err.max} مقاعد` },
        { status: 413 },
      )
    }
    if (err?.code === 'TRIP_QUOTA_EXCEEDED') {
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
    if (err?.code === 'DUPLICATE_CHARGE') {
      return NextResponse.json(
        { error: 'ALREADY_BOOKED', message: 'هذا الحجز مُسجَّل بالفعل' },
        { status: 409 },
      )
    }
    if (err.message === 'COMPANY_INACTIVE') {
      return NextResponse.json({ error: 'COMPANY_INACTIVE', message: 'حساب الشركة غير مفعّل' }, { status: 403 })
    }
    if (err.message?.startsWith('SEAT_CAP_EXCEEDED')) {
      const max = err.message.split(':')[1] || ''
      return NextResponse.json(
        { error: 'SEAT_CAP_EXCEEDED', message: `الحد الأقصى للحجز الواحد ${max} مقاعد` },
        { status: 413 },
      )
    }
    if (err.message?.startsWith('TRIP_QUOTA_EXCEEDED')) {
      const remaining = err.message.split(':')[1] || ''
      return NextResponse.json(
        {
          error: 'TRIP_QUOTA_EXCEEDED',
          message: `الحصة المتاحة على هذه الرحلة ${remaining} مقاعد`,
        },
        { status: 413 },
      )
    }
    if (err.code === 'INSUFFICIENT_WALLET' || err.message === 'INSUFFICIENT_WALLET') {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_WALLET',
          message: 'رصيد المحفظة غير كافٍ',
          available: err.available,
          required: err.required,
        },
        { status: 400 },
      )
    }
    if (err.code === 'CREDIT_LIMIT_EXCEEDED' || err.message === 'CREDIT_LIMIT_EXCEEDED') {
      return NextResponse.json(
        { error: 'CREDIT_LIMIT_EXCEEDED', message: 'تجاوزت حد الائتمان المتاح' },
        { status: 400 },
      )
    }
    if (err.code === 'COMPANY_INACTIVE' || err.message === 'COMPANY_INACTIVE') {
      return NextResponse.json({ error: 'COMPANY_INACTIVE', message: 'حساب الشركة غير مفعّل' }, { status: 403 })
    }
    if (err.message === 'CHARTER_TRIP') {
      return NextResponse.json({ error: 'CHARTER_TRIP', message: 'هذه رحلة شارتر، الحجز متاح عبر طلب الشارتر فقط' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
