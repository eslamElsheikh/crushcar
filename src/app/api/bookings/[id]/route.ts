import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calculateRefund } from '@/lib/cancellation-policy'
import { paymentDeadline } from '@/lib/payments'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { trip: { include: { bus: true, tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } } }, user: { select: { id: true, name: true, email: true } } },
    })

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (booking.userId !== session.user.id && session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      ...booking,
      paidAt: booking.paidAt?.toISOString() || null,
      boardedAt: booking.boardedAt?.toISOString() || null,
      cancelledAt: booking.cancelledAt?.toISOString() || null,
      refundProcessedAt: booking.refundProcessedAt?.toISOString() || null,
      refundProcessedBy: booking.refundProcessedBy || null,
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

    const { id } = await params
    const { status, reason, adminOverride, action, passengerName, passengerPhone, passengerHotel, paymentMethod, paymentProofUrl, paymentNotes, applyToGroup } = await req.json()

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { trip: true, user: true },
    })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (booking.userId !== session.user.id && session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const PAYMENT_METHODS = ['VODAFONE_CASH', 'INSTAPAY']
    const PROOF_RE = /^\/api\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i

    // Bookings created before this date predate the proof requirement, so they stay
// confirmable without a screenshot. It sits after the last legacy booking
// (2026-06-26) and before the rule went live. Override with
// PROOF_REQUIRED_FROM to move the line.
const PROOF_REQUIRED_FROM = process.env.PROOF_REQUIRED_FROM
  ? new Date(process.env.PROOF_REQUIRED_FROM)
  : new Date('2026-07-01T00:00:00Z')
    const proofRequiredFor = (b: { createdAt: Date }) =>
      b.createdAt.getTime() >= PROOF_REQUIRED_FROM.getTime()

    // Customer attaches a transfer proof (single booking or whole group).
    if (action === 'SUBMIT_PROOF') {
      if (booking.userId !== session.user.id) {
        return NextResponse.json({ error: 'Only the booking owner can pay' }, { status: 403 })
      }
      if (booking.status !== 'PENDING') {
        return NextResponse.json({ error: 'Booking is not pending' }, { status: 400 })
      }
      if (!PAYMENT_METHODS.includes(paymentMethod)) {
        return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
      }
      if (typeof paymentProofUrl !== 'string' || !PROOF_RE.test(paymentProofUrl)) {
        return NextResponse.json({ error: 'Invalid proof URL' }, { status: 400 })
      }
      const data = {
        paymentMethod,
        paymentProofUrl,
        paymentNotes: paymentNotes || '',
        paymentStatus: 'PENDING',
        paymentRejectReason: '',
      }
      if (applyToGroup && booking.groupId) {
        await prisma.booking.updateMany({
          where: { groupId: booking.groupId, userId: session.user.id, status: 'PENDING' },
          data,
        })
      } else {
        // Conditional, for the same reason the sweep is: a plain update would
        // happily attach a receipt to a booking the sweep cancelled in the
        // meantime, leaving a paid customer with a cancelled booking.
        const res = await prisma.booking.updateMany({
          where: { id, userId: session.user.id, status: 'PENDING' },
          data,
        })
        if (res.count === 0) {
          return NextResponse.json({ error: 'Booking is no longer pending' }, { status: 409 })
        }
      }
      const updated = await prisma.booking.findUnique({ where: { id } })
      return NextResponse.json({ ...updated })
    }

    // Admin asks for a new proof instead of cancelling.
    if (action === 'REQUEST_PROOF') {
      if (session.user.role === 'CUSTOMER') {
        return NextResponse.json({ error: 'Only admins can request a new proof' }, { status: 403 })
      }
      if (booking.status !== 'PENDING') {
        return NextResponse.json({ error: 'Booking is not pending' }, { status: 400 })
      }
      if (!reason || typeof reason !== 'string') {
        return NextResponse.json({ error: 'A reason is required' }, { status: 400 })
      }
      const updated = await prisma.booking.update({
        where: { id },
        data: { paymentStatus: 'REJECTED', paymentRejectReason: reason },
      })
      return NextResponse.json({ ...updated })
    }

    if (action === 'REACTIVATE') {
      if (session.user.role === 'CUSTOMER') {
        return NextResponse.json({ error: 'Only admins can reactivate a booking' }, { status: 403 })
      }
      if (booking.status !== 'CANCELLED' || !booking.expiredAt) {
        return NextResponse.json({ error: 'Only an expired booking can be reactivated' }, { status: 400 })
      }

      // The seat was released when this expired, so someone else may have taken
      // it. Check the whole segment, not just this seat, matching the create path.
      const taken = await prisma.booking.findFirst({
        where: {
          tripId: booking.tripId,
          seatLabel: booking.seatLabel,
          status: { in: ['PENDING', 'PAID', 'BOARDED'] },
          fromStopOrder: { lt: booking.toStopOrder },
          toStopOrder: { gt: booking.fromStopOrder },
        },
        select: { reference: true },
      })
      if (taken) {
        return NextResponse.json(
          {
            error: 'SEAT_TAKEN',
            message: `الكرسي ${booking.seatLabel} محجوز الآن بحجز ${taken.reference}. التحويل وصل بعد انتهاء المهلة، يجب معالجة الاسترداد يدوياً.`,
            manualRefundRequired: true,
            conflictingReference: taken.reference,
          },
          { status: 409 }
        )
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          status: 'PENDING',
          expiredAt: null,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: '',
          // Give the customer a fresh window now that an admin is on the case.
          paymentExpiresAt: paymentDeadline(new Date(booking.trip?.departure ?? new Date())),
        },
      })
      return NextResponse.json({ ...updated })
    }

    if (action === 'UPDATE') {
      const updated = await prisma.booking.update({
        where: { id },
        data: {
          passengerName: passengerName ?? booking.passengerName,
          passengerPhone: passengerPhone ?? booking.passengerPhone,
          passengerHotel: passengerHotel ?? booking.passengerHotel,
        },
      })
      return NextResponse.json({ ...updated })
    }

    if (status === 'PAID') {
      if (session.user.role === 'CUSTOMER') {
        return NextResponse.json({ error: 'Only admins can confirm payment' }, { status: 403 })
      }
      if (booking.status !== 'PENDING') {
        return NextResponse.json({ error: 'Booking is not pending' }, { status: 400 })
      }
      // Money is only ever confirmed against a transfer screenshot. Without this
      // check an admin can mark any unpaid booking PAID by clicking the button.
      if (!booking.paymentProofUrl && proofRequiredFor(booking)) {
        return NextResponse.json(
          { error: 'PAYMENT_PROOF_REQUIRED', message: 'لا يمكن تأكيد الدفع قبل رفع العميل لصورة التحويل' },
          { status: 400 }
        )
      }
      const updated = await prisma.booking.updateMany({
        // Conditional: the sweep may have cancelled this booking between the
        // read above and this write. With the status in the where clause only
        // one of the two can take the row, so a paid booking can never be
        // overwritten back to CANCELLED with no refund recorded.
        where: { id, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          // Keep the proof state consistent with the booking state; leaving it
          // PENDING here made a confirmed booking look unreviewed everywhere.
          ...(booking.paymentProofUrl ? { paymentStatus: 'APPROVED' } : {}),
        },
      })
      if (updated.count === 0) {
        return NextResponse.json(
          { error: 'Booking is no longer pending', message: 'تم إلغاء هذا الحجز بالفعل' },
          { status: 409 }
        )
      }
      const row = await prisma.booking.findUnique({ where: { id } })
      return NextResponse.json({ ...row, paidAt: row?.paidAt?.toISOString() || null })
    }

    if (status === 'CANCELLED') {
      if (booking.status === 'CANCELLED') {
        return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })
      }

      if (booking.status === 'BOARDED') {
        return NextResponse.json({ error: 'Cannot cancel after boarding' }, { status: 400 })
      }

      const isAdmin = session.user.role === 'COMPANY_ADMIN' || session.user.role === 'SUPER_ADMIN'
      const departureTime = new Date(booking.trip.departure)
      const bookingTime = booking.createdAt

      const { refundAmount, cancellationFee, refundPercent, canCancel } = calculateRefund(
        booking.total,
        departureTime,
        bookingTime,
        adminOverride && isAdmin
      )

      if (!canCancel && !isAdmin) {
        return NextResponse.json({ error: 'Cancellation not allowed' }, { status: 400 })
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: session.user.id,
          cancellationReason: reason || '',
          refundAmount: booking.status === 'PAID' ? refundAmount : 0,
          cancellationFee: booking.status === 'PAID' ? cancellationFee : 0,
        },
      })

      return NextResponse.json({
        ...updated,
        paidAt: updated.paidAt?.toISOString() || null,
        cancelledAt: updated.cancelledAt?.toISOString() || null,
        refundAmount: booking.status === 'PAID' ? refundAmount : 0,
        cancellationFee: booking.status === 'PAID' ? cancellationFee : 0,
        refundPercent,
      })
    }

    if (status === 'BOARDED') {
      if (session.user.role === 'CUSTOMER') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const updated = await prisma.booking.update({
        where: { id },
        data: { status: 'BOARDED', boarded: true, boardedAt: new Date() },
      })
      return NextResponse.json({ ...updated, paidAt: updated.paidAt?.toISOString() || null, boardedAt: updated.boardedAt?.toISOString() || null })
    }

    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
