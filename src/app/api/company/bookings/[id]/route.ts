import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calculateRefund } from '@/lib/cancellation-policy'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const { id } = await params
    const booking = await prisma.companyBooking.findFirst({
      where: { id, companyId },
      include: {
        trip: { include: { bus: true, tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } } },
        customer: true,
      },
    })

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let pairedBooking = null
    if (booking.roundTripGroupId) {
      pairedBooking = await prisma.companyBooking.findFirst({
        where: { roundTripGroupId: booking.roundTripGroupId, id: { not: booking.id }, companyId },
        include: {
          trip: { select: { id: true, origin: true, destination: true, departure: true } },
        },
      })
    }

    return NextResponse.json({
      ...booking,
      createdAt: booking.createdAt.toISOString(),
      paidAt: booking.paidAt?.toISOString() || null,
      cancelledAt: booking.cancelledAt?.toISOString() || null,
      cancelledBy: booking.cancelledBy || null,
      cancellationReason: booking.cancellationReason || null,
      refundAmount: booking.refundAmount ?? null,
      cancellationFee: booking.cancellationFee ?? null,
      refundProcessedAt: booking.refundProcessedAt?.toISOString() || null,
      refundProcessedBy: booking.refundProcessedBy || null,
      boardedAt: booking.boardedAt?.toISOString() || null,
      pairedBooking: pairedBooking ? {
        id: pairedBooking.id,
        reference: pairedBooking.reference,
        status: pairedBooking.status,
        trip: pairedBooking.trip,
        seatLabel: pairedBooking.seatLabel,
        passengerName: pairedBooking.passengerName,
        total: pairedBooking.total,
      } : null,
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
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const { id } = await params
    const { status, reason, action, passengerName, passengerPhone, passengerHotel, adminOverride } = await req.json()

    // SUPER_ADMIN can access any booking; COMPANY_ADMIN only their own
    const whereClause: any = { id }
    if (session.user.role !== 'SUPER_ADMIN') whereClause.companyId = companyId
    else if (!companyId && session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const booking = await prisma.companyBooking.findFirst({
      where: whereClause,
      include: { trip: true },
    })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'UPDATE') {
      const updated = await prisma.companyBooking.update({
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
      if (booking.status !== 'PENDING') {
        return NextResponse.json({ error: 'Booking is not pending' }, { status: 400 })
      }

      return await prisma.$transaction(async (tx) => {
        const company = await tx.company.findUnique({ where: { id: companyId } })
        if (!company) throw new Error('Company not found')
        if (!company.isActive) throw new Error('COMPANY_INACTIVE')

        const total = booking.total
        let paidFromWallet = 0
        let paidOnCredit = 0

        if (company.paymentMode === 'PREPAID') {
          if (company.walletBalance < total) throw new Error('INSUFFICIENT_WALLET')
          paidFromWallet = total
        } else {
          // CREDIT or BOTH: deduct from wallet first, credit for what remains
          paidFromWallet = Math.min(company.walletBalance, total)
          const remaining = total - paidFromWallet
          if (remaining > 0) {
            if (company.outstandingBalance + remaining > company.creditLimit) throw new Error('CREDIT_LIMIT_EXCEEDED')
            paidOnCredit = remaining
          }
        }

        if (paidFromWallet > 0) {
          await tx.company.update({
            where: { id: companyId },
            data: { walletBalance: { decrement: paidFromWallet } },
          })
          await tx.walletTransaction.create({
            data: {
              companyId,
              type: 'BOOKING_CHARGE',
              amount: -paidFromWallet,
              description: `Payment for booking ${booking.reference}`,
              reference: booking.id,
            },
          })
        }

        if (paidOnCredit > 0) {
          await tx.company.update({
            where: { id: companyId },
            data: { outstandingBalance: { increment: paidOnCredit } },
          })
        }

        const updated = await tx.companyBooking.update({
          where: { id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            paidFromWallet,
            paidOnCredit,
          },
        })

        return NextResponse.json({
          ...updated,
          paidAt: updated.paidAt?.toISOString() || null,
          paidFromWallet,
          paidOnCredit,
          walletBalance: company.walletBalance - paidFromWallet,
          outstandingBalance: company.outstandingBalance + paidOnCredit,
        })
      })
    }

    if (status === 'CANCELLED') {
      if (booking.status === 'CANCELLED') {
        return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })
      }
      if (booking.status === 'BOARDED') {
        return NextResponse.json({ error: 'Cannot cancel after boarding' }, { status: 400 })
      }

      // PENDING → cancel immediately (no money involved)
      if (booking.status === 'PENDING') {
        const updated = await prisma.companyBooking.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledBy: session.user.id,
            cancellationReason: reason || '',
          },
        })
        return NextResponse.json({
          ...updated,
          cancelledAt: updated.cancelledAt?.toISOString() || null,
        })
      }

      // PAID → calculate refund using policy, defer to admin processing
      const isAdmin = session.user.role === 'SUPER_ADMIN'
      const departureTime = new Date(booking.trip.departure)
      const bookingTime = booking.createdAt

      const { refundAmount, cancellationFee, refundPercent, canCancel } = calculateRefund(
        booking.total,
        departureTime,
        bookingTime,
        adminOverride && isAdmin
      )

      if (!canCancel && !isAdmin) {
        return NextResponse.json({ error: 'Cancellation not allowed at this time' }, { status: 400 })
      }

      const updated = await prisma.companyBooking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: session.user.id,
          cancellationReason: reason || '',
          refundAmount,
          cancellationFee,
        },
      })

      return NextResponse.json({
        ...updated,
        cancelledAt: updated.cancelledAt?.toISOString() || null,
        refundAmount,
        cancellationFee,
        refundPercent,
        walletBalance: booking.paidFromWallet,
        outstandingBalance: booking.paidOnCredit,
      })
    }

    if (status === 'BOARDED') {
      const updated = await prisma.companyBooking.update({
        where: { id },
        data: { status: 'BOARDED', boardedAt: new Date() },
      })
      return NextResponse.json({ ...updated, boardedAt: updated.boardedAt?.toISOString() || null })
    }

    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  } catch (err: any) {
    console.error(err)
    if (err.message === 'INSUFFICIENT_WALLET') {
      return NextResponse.json({ error: 'INSUFFICIENT_WALLET', message: 'رصيد المحفظة غير كافي لتأكيد الدفع' }, { status: 400 })
    }
    if (err.message === 'CREDIT_LIMIT_EXCEEDED') {
      return NextResponse.json({ error: 'CREDIT_LIMIT_EXCEEDED', message: 'تم تجاوز حد الكريدت، يرجى السداد أولاً' }, { status: 400 })
    }
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
