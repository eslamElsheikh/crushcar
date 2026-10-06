import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calculateRefund } from '@/lib/cancellation-policy'

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

    const PAYMENT_METHODS = ['VODAFONE_CASH', 'INSTAPAY', 'CASH', 'BANK']
    const PROOF_RE = /^\/api\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i

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
        await prisma.booking.update({ where: { id }, data })
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
      const updated = await prisma.booking.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date() },
      })
      return NextResponse.json({ ...updated, paidAt: updated.paidAt?.toISOString() || null })
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
