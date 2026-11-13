import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { BOOKING_ISOLATION } from '@/lib/transaction-isolation'
import { chargeCompany } from '@/lib/company-charge'
import { assertSeatsBookable } from '@/lib/seat-availability'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * Super admin actions on a company booking.
 *
 * Requirements (Task 3):
 * 1. Confirm payment without proof (required note)
 * 2. Delete (soft-delete / cancellation with full financial reversal, default 0 fee, required note)
 * 3. Edit (passenger details and notes free; seat change checks availability and adjusts ledger)
 * 4. Attach payment proof
 *
 * Access is restricted to SUPER_ADMIN only.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const booking = await prisma.companyBooking.findUnique({
      where: { id },
      include: {
        company: true,
        trip: { include: { bus: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        customer: true,
      },
    })

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ booking })
  } catch (err: any) {
    console.error('[admin company-bookings]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const {
      action,
      note,
      passengerName,
      passengerPhone,
      passengerHotel,
      passengerNotes,
      seatLabel,
      paymentProofUrl,
    } = body

    const isBoardAction = action === 'BOARD' || body.status === 'BOARDED'
    if (!action && !isBoardAction) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    if (isBoardAction) {
      // Conditional: boarding a cancelled (already refunded) booking would
      // put a released seat back in use. The claim also doubles as the
      // not-found check, so a missing id answers 409 instead of a Prisma
      // throw.
      const claimed = await prisma.companyBooking.updateMany({
        where: { id, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
        data: { status: 'BOARDED', boardedAt: new Date() },
      })
      if (claimed.count === 0) {
        return NextResponse.json(
          { error: 'BOOKING_NOT_BOARDABLE', message: 'لا يمكن الصعود على حجز ملغي' },
          { status: 409 }
        )
      }
      const updated = await prisma.companyBooking.findUnique({ where: { id } })
      await audit({
        action: 'BOARD',
        entity: 'CompanyBooking',
        entityId: id,
        companyId: updated!.companyId,
        session,
        metadata: { action: 'BOARD' },
      })
      return NextResponse.json({ booking: updated, boardedAt: updated?.boardedAt?.toISOString() || null })
    }
    // ─────────────────────────────────────────────────────────────────────────
    // 1. CONFIRM_WITHOUT_PROOF
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'CONFIRM_WITHOUT_PROOF') {
      if (!note || !String(note).trim()) {
        return NextResponse.json(
          { error: 'NOTE_REQUIRED', message: 'ملاحظة التأكيد مطلوبة' },
          { status: 400 }
        )
      }

      return await prisma.$transaction(async (tx) => {
        const booking = await tx.companyBooking.findUnique({
          where: { id },
          include: { company: true },
        })
        if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        if (booking.status === 'PAID') {
          return NextResponse.json(
            { error: 'ALREADY_PAID', message: 'هذا الحجز مؤكد ومدفوع بالفعل' },
            { status: 400 }
          )
        }

        if (booking.status !== 'PENDING') {
          return NextResponse.json(
            { error: 'BOOKING_NOT_PENDING', message: 'تم تغيير حالة هذا الحجز بالفعل' },
            { status: 409 }
          )
        }

        // Claim status conditionally to prevent race conditions
        const claimed = await tx.companyBooking.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'PAID',
            paidAt: new Date(),
          },
        })
        if (claimed.count === 0) {
          return NextResponse.json(
            { error: 'BOOKING_NOT_PENDING', message: 'تم تغيير حالة هذا الحجز بالفعل' },
            { status: 409 }
          )
        }

        // Charge company via shared company-charge
        const { paidFromWallet, paidOnCredit } = await chargeCompany(tx, {
          companyId: booking.companyId,
          total: booking.total,
          reference: booking.id,
          description: `Admin confirmed payment without proof for ${booking.reference}: ${note.trim()}`,
        })

        await tx.companyBooking.update({
          where: { id },
          data: {
            paidFromWallet,
            paidOnCredit,
          },
        })

        // Audit log in-transaction
        await audit({
          action: 'PAY',
          entity: 'CompanyBooking',
          entityId: id,
          companyId: booking.companyId,
          session,
          metadata: {
            action: 'CONFIRM_WITHOUT_PROOF',
            note: note.trim(),
            before: { status: 'PENDING' },
            after: { status: 'PAID', paidFromWallet, paidOnCredit },
          },
          client: tx,
        })

        const updated = await tx.companyBooking.findUnique({
          where: { id },
          include: { company: true },
        })

        return NextResponse.json({
          booking: updated,
          paidFromWallet,
          paidOnCredit,
          walletBalance: updated?.company?.walletBalance ?? 0,
          outstandingBalance: updated?.company?.outstandingBalance ?? 0,
        })
      }, BOOKING_ISOLATION)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. ATTACH_PROOF
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'ATTACH_PROOF') {
      if (!paymentProofUrl) {
        return NextResponse.json(
          { error: 'PAYMENT_PROOF_REQUIRED', message: 'رابط إيصال الدفع مطلوب' },
          { status: 400 }
        )
      }
      // The URL has to be one this application could have served: a filename
      // we generated, under our own upload route. Without this the admin
      // endpoint wrote any string it was handed into the proof column, and
      // every page that renders the proof would then fetch an attacker's
      // chosen URL from an attacker's chosen origin while the reviewer looks
      // at it. Kept in sync with PROOF_RE in bookings/[id] and
      // company/deposit-requests.
      const PROOF_RE = /^\/api\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i
      if (typeof paymentProofUrl !== 'string' || !PROOF_RE.test(paymentProofUrl)) {
        return NextResponse.json({ error: 'Invalid payment proof URL' }, { status: 400 })
      }

      return await prisma.$transaction(async (tx) => {
        const booking = await tx.companyBooking.findUnique({ where: { id } })
        if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        const updated = await tx.companyBooking.update({
          where: { id },
          data: { paymentProofUrl },
        })

        await audit({
          action: 'UPDATE',
          entity: 'CompanyBooking',
          entityId: id,
          companyId: booking.companyId,
          session,
          metadata: {
            action: 'ATTACH_PROOF',
            paymentProofUrl,
            note: note ? String(note).trim() : '',
          },
          client: tx,
        })

        return NextResponse.json({ booking: updated })
      }, BOOKING_ISOLATION)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. EDIT
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'EDIT') {
      return await prisma.$transaction(async (tx) => {
        const booking = await tx.companyBooking.findUnique({
          where: { id },
          include: { trip: { include: { bus: { include: { layout: { include: { seats: true } } } } } } },
        })
        if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        if (booking.status === 'CANCELLED') {
          return NextResponse.json(
            { error: 'CANNOT_EDIT_CANCELLED', message: 'لا يمكن تعديل حجز ملغي' },
            { status: 400 }
          )
        }

        let newSeatLabel = booking.seatLabel
        let newTotal = booking.total
        let priceDiff = 0
        if (seatLabel && seatLabel !== booking.seatLabel) {
          const seats = booking.trip.bus?.layout?.seats || []
          const layoutSeatLabels = seats.map((s) => s.label)

          // Verify new seat availability
          await assertSeatsBookable(tx, {
            tripId: booking.tripId,
            seatLabels: [seatLabel],
            layoutSeatLabels,
            fromStopOrder: booking.fromStopOrder,
            toStopOrder: booking.toStopOrder,
          })

          const oldSeat = seats.find((s) => s.label === booking.seatLabel)
          const nextSeat = seats.find((s) => s.label === seatLabel)
          if (!nextSeat) {
            return NextResponse.json(
              { error: 'UNKNOWN_SEAT', message: `المقعد ${seatLabel} غير موجود` },
              { status: 400 }
            )
          }

          const oldSeatPrice = oldSeat?.price || 0
          const nextSeatPrice = nextSeat?.price || 0
          priceDiff = nextSeatPrice - oldSeatPrice
          newTotal = booking.total + priceDiff
          newSeatLabel = seatLabel
        }

        // The claim comes before any money moves. Two concurrent EDITs that
        // both read the same old seat would each compute the same price
        // difference and each charge or refund it — and the old
        // `edit-refund:${id}:${Date.now()}` key was unique per call, so it
        // could never dedupe anything. The WHERE clause pins the row to the
        // state this transaction read (seat, total and status), so the
        // database lets exactly one writer through; the loser is told 409
        // instead of moving the ledger twice.
        const claimed = await tx.companyBooking.updateMany({
          where: { id, seatLabel: booking.seatLabel, total: booking.total, status: booking.status },
          data: {
            passengerName: passengerName !== undefined ? String(passengerName).trim() : booking.passengerName,
            passengerPhone: passengerPhone !== undefined ? String(passengerPhone).trim() : booking.passengerPhone,
            passengerHotel: passengerHotel !== undefined ? String(passengerHotel).trim() : booking.passengerHotel,
            passengerNotes: passengerNotes !== undefined ? String(passengerNotes).trim() : booking.passengerNotes,
            seatLabel: newSeatLabel,
            total: newTotal,
          },
        })
        if (claimed.count === 0) {
          return NextResponse.json(
            { error: 'BOOKING_CHANGED', message: 'تم تعديل هذا الحجز من مستخدم آخر، أعد المحاولة' },
            { status: 409 }
          )
        }

        // If booking was already PAID and price changed, adjust balances —
        // now only reachable by the single writer that won the claim.
        if (booking.status === 'PAID' && priceDiff !== 0) {
          if (priceDiff > 0) {
            // Charge the difference
            const { paidFromWallet, paidOnCredit } = await chargeCompany(tx, {
              companyId: booking.companyId,
              total: priceDiff,
              reference: booking.id,
              description: `Price difference for seat change (${booking.seatLabel} -> ${newSeatLabel}) on ${booking.reference}`,
            })
            await tx.companyBooking.update({
              where: { id },
              data: {
                paidFromWallet: { increment: paidFromWallet },
                paidOnCredit: { increment: paidOnCredit },
              },
            })
          } else {
            // Refund difference to wallet
            const refund = Math.abs(priceDiff)
            await tx.company.update({
              where: { id: booking.companyId },
              data: { walletBalance: { increment: refund } },
            })
            await tx.walletTransaction.create({
              data: {
                companyId: booking.companyId,
                type: 'REFUND',
                amount: refund,
                description: `Price difference refund for seat change on ${booking.reference}`,
                reference: booking.id,
                // The claim above already guarantees a single winner, so the
                // key no longer needs a timestamp to be unique per attempt.
                idempotencyKey: `edit-refund:${id}:${booking.seatLabel}->${newSeatLabel}`,
              },
            })
            // Reduce paid amount on booking
            const refundWallet = Math.min(refund, booking.paidFromWallet)
            const refundCredit = refund - refundWallet
            await tx.companyBooking.update({
              where: { id },
              data: {
                paidFromWallet: { decrement: refundWallet },
                paidOnCredit: { decrement: refundCredit },
              },
            })
          }
        }

        const updated = await tx.companyBooking.findUnique({ where: { id } })
        if (!updated) {
          // The claim above just wrote this row, so it exists; treat its
          // disappearance as a conflict rather than dereferencing null.
          return NextResponse.json({ error: 'BOOKING_CHANGED' }, { status: 409 })
        }

        await audit({
          action: 'UPDATE',
          entity: 'CompanyBooking',
          entityId: id,
          companyId: booking.companyId,
          session,
          metadata: {
            action: 'EDIT',
            note: note ? String(note).trim() : '',
            before: {
              passengerName: booking.passengerName,
              passengerPhone: booking.passengerPhone,
              passengerHotel: booking.passengerHotel,
              passengerNotes: booking.passengerNotes,
              seatLabel: booking.seatLabel,
              total: booking.total,
            },
            after: {
              passengerName: updated.passengerName,
              passengerPhone: updated.passengerPhone,
              passengerHotel: updated.passengerHotel,
              passengerNotes: updated.passengerNotes,
              seatLabel: updated.seatLabel,
              total: updated.total,
            },
          },
          client: tx,
        })

        return NextResponse.json({ booking: updated })
      }, BOOKING_ISOLATION)
    }

    return NextResponse.json({ error: 'INVALID_ACTION', message: 'إجراء غير معروف' }, { status: 400 })
  } catch (err: any) {
    if (err?.code === 'INSUFFICIENT_WALLET') {
      return NextResponse.json({ error: 'INSUFFICIENT_WALLET', message: 'رصيد المحفظة غير كافٍ' }, { status: 400 })
    }
    if (err?.code === 'CREDIT_LIMIT_EXCEEDED') {
      return NextResponse.json({ error: 'CREDIT_LIMIT_EXCEEDED', message: 'تجاوزت حد الائتمان المتاح' }, { status: 400 })
    }
    if (err?.code === 'SEAT_CONFLICT' || err?.code === 'SEAT_TAKEN') {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'المقعد محجوز بالفعل' }, { status: 409 })
    }
    // No message echoed: the raw text of an internal failure used to ride
    // along in the body.
    console.error('[admin company-bookings]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { note, fee } = body

    if (!note || !String(note).trim()) {
      return NextResponse.json(
        { error: 'NOTE_REQUIRED', message: 'سبب الحذف / الإلغاء مطلوب' },
        { status: 400 }
      )
    }

    return await prisma.$transaction(async (tx) => {
      const booking = await tx.companyBooking.findUnique({
        where: { id },
        include: { company: true },
      })
      if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      if (booking.status === 'CANCELLED') {
        return NextResponse.json(
          { error: 'ALREADY_CANCELLED', message: 'هذا الحجز ملغي بالفعل' },
          { status: 400 }
        )
      }

      if (booking.status === 'BOARDED') {
        return NextResponse.json(
          { error: 'CANNOT_CANCEL_BOARDED', message: 'لا يمكن إلغاء الحجز بعد الصعود' },
          { status: 400 }
        )
      }

      // Claim status conditionally
      const claimed = await tx.companyBooking.updateMany({
        where: { id, status: booking.status },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: session.user.id,
          cancellationReason: note.trim(),
        },
      })
      if (claimed.count === 0) {
        return NextResponse.json(
          { error: 'CONCURRENT_MODIFICATION', message: 'تم تغيير حالة هذا الحجز بالفعل' },
          { status: 409 }
        )
      }

      // 1. PENDING booking: no money moved, seats & quota released
      if (booking.status === 'PENDING') {
        await audit({
          action: 'DELETE',
          entity: 'CompanyBooking',
          entityId: id,
          companyId: booking.companyId,
          session,
          metadata: {
            action: 'ADMIN_DELETE',
            note: note.trim(),
            fee: 0,
            refundAmount: 0,
            before: { status: 'PENDING' },
            after: { status: 'CANCELLED' },
          },
          client: tx,
        })

        const updated = await tx.companyBooking.findUnique({ where: { id } })
        return NextResponse.json({
          booking: updated,
          refundAmount: 0,
          cancellationFee: 0,
        })
      }

      // 2. PAID booking: full financial reversal (default 0 fee, optional fee)
      const cancellationFee =
        typeof fee === 'number' && fee >= 0 ? Math.min(fee, booking.total) : 0
      const refundAmount = Math.max(0, booking.total - cancellationFee)

      const refundWallet = Math.min(refundAmount, booking.paidFromWallet || 0)
      const refundCredit = refundAmount - refundWallet

      if (refundWallet > 0) {
        await tx.company.update({
          where: { id: booking.companyId },
          data: { walletBalance: { increment: refundWallet } },
        })
        await tx.walletTransaction.create({
          data: {
            companyId: booking.companyId,
            type: 'REFUND',
            amount: refundWallet,
            description: `Refund for admin deleted booking ${booking.reference}: ${note.trim()}`,
            reference: booking.id,
            idempotencyKey: `admin-delete-refund:${id}`,
          },
        })
      }

      if (refundCredit > 0) {
        await tx.company.update({
          where: { id: booking.companyId },
          data: { outstandingBalance: { decrement: refundCredit } },
        })
      }

      const updated = await tx.companyBooking.update({
        where: { id },
        data: {
          refundAmount,
          cancellationFee,
          refundProcessedAt: new Date(),
          refundProcessedBy: session.user.id,
        },
      })

      await audit({
        action: 'DELETE',
        entity: 'CompanyBooking',
        entityId: id,
        companyId: booking.companyId,
        session,
        metadata: {
          action: 'ADMIN_DELETE',
          note: note.trim(),
          fee: cancellationFee,
          refundAmount,
          refundWallet,
          refundCredit,
          before: { status: 'PAID', total: booking.total },
          after: { status: 'CANCELLED', refundAmount, cancellationFee },
        },
        client: tx,
      })

      const refreshedCompany = await tx.company.findUnique({ where: { id: booking.companyId } })

      return NextResponse.json({
        booking: updated,
        refundAmount,
        cancellationFee,
        walletBalance: refreshedCompany?.walletBalance ?? 0,
        outstandingBalance: refreshedCompany?.outstandingBalance ?? 0,
      })
    }, BOOKING_ISOLATION)
  } catch (err: any) {
    console.error('[admin company-bookings]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
