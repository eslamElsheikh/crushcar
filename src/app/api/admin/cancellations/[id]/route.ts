import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { BOOKING_ISOLATION } from '@/lib/transaction-isolation'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { type } = await req.json()

    if (type === 'company') {
      return await prisma.$transaction(async (tx) => {
        const booking = await tx.companyBooking.findUnique({
          where: { id },
          include: { company: true },
        })
        if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (booking.status !== 'CANCELLED') return NextResponse.json({ error: 'Not cancelled' }, { status: 400 })

        // Claim the row before any money moves.
        //
        // Reading refundProcessedAt and then writing it is a race: two admins
        // (or one admin double-clicking) can both read "not processed yet" and
        // both credit the company. The claim is a conditional update, so the
        // database decides the winner and only one request may proceed.
        // The whole thing is one transaction, so if the money movement below
        // fails, the claim is rolled back with it.
        const claimed = await tx.companyBooking.updateMany({
          where: { id, status: 'CANCELLED', refundProcessedAt: null },
          data: {
            refundProcessedAt: new Date(),
            refundProcessedBy: session.user.id,
          },
        })
        if (claimed.count === 0) {
          return NextResponse.json({ error: 'Already processed' }, { status: 409 })
        }

        const refundAmount = booking.refundAmount || 0
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
              description: `Refund for cancelled booking ${booking.reference}`,
              reference: booking.id,
              // A second guard at the ledger level: even if a future change
              // weakens the claim above, this row cannot be written twice.
              idempotencyKey: `company-refund:${id}`,
            },
          })
        }

        if (refundCredit > 0) {
          await tx.company.update({
            where: { id: booking.companyId },
            data: { outstandingBalance: { decrement: refundCredit } },
          })
        }

        const updated = await tx.companyBooking.findUnique({ where: { id } })

        return NextResponse.json({
          ...updated,
          refundProcessedAt: updated?.refundProcessedAt?.toISOString() || null,
        })
      }, BOOKING_ISOLATION)
    }

    // Customer booking
    const booking = await prisma.booking.findUnique({ where: { id } })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (booking.status !== 'CANCELLED') return NextResponse.json({ error: 'Not cancelled' }, { status: 400 })
    // A platform-funded booking was refunded to the platform wallet when it was
    // cancelled, in the same transaction. This branch moves no money at all —
    // it only stamps the row as processed — so letting it through would mark
    // the refund as handled a second time, with no money behind it.
    if (booking.fundingSource === 'PLATFORM') {
      return NextResponse.json(
        { error: 'Platform refunds are settled automatically' },
        { status: 400 }
      )
    }
    if (booking.refundProcessedAt) return NextResponse.json({ error: 'Already processed' }, { status: 400 })

    // Claim the row conditionally, exactly like the company branch above:
    // the read above is only a read, so two administrators processing the
    // same refund at the same time could both see "not processed yet" and
    // both stamp it. The status and the unprocessed stamp live in the WHERE
    // clause, so the database picks one winner and the loser is told 409.
    const claimed = await prisma.booking.updateMany({
      where: { id, status: 'CANCELLED', refundProcessedAt: null },
      data: {
        refundProcessedAt: new Date(),
        refundProcessedBy: session.user.id,
      },
    })
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Already processed' }, { status: 409 })
    }

    const updated = await prisma.booking.findUnique({ where: { id } })
    if (!updated) {
      // The conditional claim above just stamped this row, so it existed a
      // moment ago; treat its disappearance as the conflict it now is rather
      // than dereferencing null.
      return NextResponse.json({ error: 'Already processed' }, { status: 409 })
    }

    return NextResponse.json({
      ...updated,
      refundProcessedAt: updated.refundProcessedAt?.toISOString() || null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
