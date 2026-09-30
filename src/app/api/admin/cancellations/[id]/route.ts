import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

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
        if (booking.refundProcessedAt) return NextResponse.json({ error: 'Already processed' }, { status: 400 })

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
            refundProcessedAt: new Date(),
            refundProcessedBy: session.user.id,
          },
        })

        return NextResponse.json({
          ...updated,
          refundProcessedAt: updated.refundProcessedAt?.toISOString() || null,
        })
      })
    }

    // Customer booking
    const booking = await prisma.booking.findUnique({ where: { id } })
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (booking.status !== 'CANCELLED') return NextResponse.json({ error: 'Not cancelled' }, { status: 400 })
    if (booking.refundProcessedAt) return NextResponse.json({ error: 'Already processed' }, { status: 400 })

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        refundProcessedAt: new Date(),
        refundProcessedBy: session.user.id,
      },
    })

    return NextResponse.json({
      ...updated,
      refundProcessedAt: updated.refundProcessedAt?.toISOString() || null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
