import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { nextBookingRef, withRefRetry } from '@/lib/booking-reference'
import { lockRow } from '@/lib/row-lock'
import { segmentPrice } from '@/lib/segment-price'
import { parseCollectAmount } from '@/lib/validations'
import { chargePlatform, toPiastres, fromPiastres } from '@/lib/platform-wallet'
import { BOOKING_ISOLATION } from '@/lib/transaction-isolation'

export const dynamic = 'force-dynamic'

/**
 * A booking the platform pays for with its own money.
 *
 * Super admin only, and there is no choice of who pays: the money comes from
 * the platform's wallet, never from a company's. That is deliberate — a
 * platform booking is not a company booking, so it is not written to
 * CompanyBooking and it is not subject to any company rule: no seat cap, no
 * trip allowance, no automatic-payment setting, no company credit line.
 *
 * The whole leg is one transaction. Creating the rows, taking the money and
 * writing the ledger row either all happen or none of them do, so there is
 * never a paid booking with no money taken, nor a taken payment with no
 * seats.
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
      passengers,
      fromStationId,
      toStationId,
      roundTripGroupId,
      idempotencyKey,
    }: {
      tripId: string
      passengers: {
        seatLabel: string
        passengerName?: string
        passengerPhone?: string
        passengerHotel?: string
        passengerNotes?: string
      }[]
      fromStationId?: string | null
      toStationId?: string | null
      roundTripGroupId?: string | null
      idempotencyKey?: string
    } = await req.json()

    if (!tripId || !passengers?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: 'An idempotency key is required' }, { status: 400 })
    }

    return await withRefRetry(() => prisma.$transaction(async (tx) => {
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

      // The trip row is locked so two requests cannot both check the same seat
      // and both find it free.
      await lockRow(tx, 'Trip', tripId)

      let fromStopOrder = 1
      let toStopOrder = 1
      let fromStationName = trip.origin
      let toStationName = trip.destination

      if (fromStationId && toStationId && trip.tripStops.length > 0) {
        const fromStop = trip.tripStops.find((s) => s.stationId === fromStationId)
        const toStop = trip.tripStops.find((s) => s.stationId === toStationId)
        if (!fromStop || !toStop) throw new Error('Invalid stations')
        if (fromStop.stopOrder >= toStop.stopOrder) {
          throw new Error('fromStation must be before toStation')
        }
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

      // The same pricing the search and the customer path use, so what is
      // shown is what is charged.
      const priced = passengers.map((p) => {
        const price = (fromStationId && toStationId && trip.tripStops.length > 0)
          ? segmentPrice(trip as any, fromStationId, toStationId)
          : (trip.bus.layout?.seats.find((s: any) => s.label === p.seatLabel)?.price || trip.price)
        return { ...p, price }
      })
      const total = priced.reduce((sum, p) => sum + p.price, 0)

      // Every seat is checked before any row is written.
      for (const p of priced) {
        const conflict = await tx.booking.findFirst({
          where: {
            tripId,
            seatLabel: p.seatLabel,
            status: { in: ['PENDING', 'PAID', 'BOARDED'] },
            fromStopOrder: { lt: toStopOrder },
            toStopOrder: { gt: fromStopOrder },
          },
        })
        if (conflict) throw new Error(`SEAT_CONFLICT:${p.seatLabel}`)

        const companyConflict = await tx.companyBooking.findFirst({
          where: {
            tripId,
            seatLabel: p.seatLabel,
            status: { in: ['PENDING', 'PAID', 'BOARDED'] },
            fromStopOrder: { lt: toStopOrder },
            toStopOrder: { gt: fromStopOrder },
          },
        })
        if (companyConflict) throw new Error(`SEAT_CONFLICT:${p.seatLabel}`)
      }

      // The money. The wallet lock and the conditional decrement mean two
      // bookings can never spend the same balance twice.
      const amountPiastres = toPiastres(total)
      const movement = await chargePlatform(tx, {
        amountPiastres,
        reference: tripId,
        description: `Platform-funded booking on ${trip.origin} → ${trip.destination}`,
        idempotencyKey: `charge:${idempotencyKey}`,
        actorId: session.user.id,
        actorEmail: session.user.email ?? '',
      })

      const created = []
      for (const p of priced) {
        const reference = await nextBookingRef(tx, {
          fromStation: fromStationName,
          toStation: toStationName,
          seatLabel: p.seatLabel,
        })
        const booking = await tx.booking.create({
          data: {
            reference,
            userId: session.user.id,
            tripId,
            seatLabel: p.seatLabel,
            passengerName: p.passengerName || '',
            passengerPhone: p.passengerPhone || '',
            passengerHotel: p.passengerHotel || '',
            // A platform booking has nobody to collect from — the platform
            // pays — and the customer Booking has no collected-amount field
            // in any case; that lives on CompanyBooking, where there is a
            // client to charge.
            // Paid, and paid by the platform: no receipt, no payment window,
            // and the funding source that keeps it out of customer revenue.
            status: 'PAID',
            paidAt: new Date(),
            fundingSource: 'PLATFORM',
            paymentStatus: 'NONE',
            paymentExpiresAt: null,
            total: p.price,
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

      return NextResponse.json({
        bookings: created.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          paidAt: b.paidAt?.toISOString() || null,
          stops: b.trip?.tripStops,
        })),
        charged: fromPiastres(movement.amountPiastres),
        balance: fromPiastres(movement.balanceAfterPiastres),
        requiresPayment: false,
      })
    }, BOOKING_ISOLATION))
  } catch (err: any) {
    const message = String(err?.message || '')
    if (message.startsWith('SEAT_CONFLICT')) {
      const seat = message.split(':')[1] || ''
      return NextResponse.json(
        { error: 'SEAT_TAKEN', message: `المقعد ${seat} محجوز بالفعل` },
        { status: 409 },
      )
    }
    if (err?.code === 'INSUFFICIENT_PLATFORM_BALANCE') {
      return NextResponse.json(
        {
          error: 'INSUFFICIENT_PLATFORM_BALANCE',
          message: `رصيد محفظة المنصة غير كافٍ. المتاح ${err.available} والمطلوب ${err.required}`,
          available: err.available,
          required: err.required,
        },
        { status: 400 },
      )
    }
    if (err?.code === 'DUPLICATE_PLATFORM_TRANSACTION') {
      return NextResponse.json(
        { error: 'ALREADY_BOOKED', message: 'هذا الحجز مُسجَّل بالفعل' },
        { status: 409 },
      )
    }
    if (message === 'CHARTER_TRIP') {
      return NextResponse.json(
        { error: 'CHARTER_TRIP', message: 'هذه رحلة شارتر، الحجز متاح للشركات فقط' },
        { status: 409 },
      )
    }
    if (message === 'TRIP_NOT_BOOKABLE') {
      return NextResponse.json(
        { error: 'TRIP_NOT_BOOKABLE', message: 'هذه الرحلة غير متاحة للحجز' },
        { status: 400 },
      )
    }
    if (message === 'Invalid stations' || message.includes('fromStation must be before')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    if (message === 'Trip not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    logger.error('[Platform Bookings]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
