import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (session?.user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { status, adminNotes } = await req.json()

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    if (status === 'REJECTED' && !adminNotes) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
    }

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.depositRequest.findUnique({ where: { id } })
      if (!existing) throw new Error('Not found')
      if (existing.status !== 'PENDING') throw new Error('Already processed')

      if (status === 'REJECTED') {
        const updated = await tx.depositRequest.update({
          where: { id },
          data: { status, adminNotes: adminNotes || '' },
        })
        return NextResponse.json({ data: updated })
      }

      // APPROVED: apply deposit to company account
      const company = await tx.company.findUnique({ where: { id: existing.companyId } })
      if (!company) throw new Error('Company not found')

      const amount = existing.amount
      let payOutstanding = 0
      let toWallet = amount

      if (company.outstandingBalance > 0) {
        payOutstanding = Math.min(amount, company.outstandingBalance)
        toWallet = amount - payOutstanding
      }

      await tx.company.update({
        where: { id: existing.companyId },
        data: {
          outstandingBalance: { decrement: payOutstanding },
          walletBalance: { increment: toWallet },
        },
      })

      await tx.walletTransaction.create({
        data: {
          companyId: existing.companyId,
          type: 'DEPOSIT',
          amount,
          description: payOutstanding > 0
            ? `Deposit ${amount} EGP (${payOutstanding} paid off outstanding, ${toWallet} to wallet)`
            : `Wallet deposit ${amount} EGP`,
        },
      })

      const updated = await tx.depositRequest.update({
        where: { id },
        data: { status: 'APPROVED', adminNotes: adminNotes || '' },
      })

      return NextResponse.json({ data: updated })
    })
  } catch (err: any) {
    console.error(err)
    if (err.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (err.message === 'Already processed') {
      return NextResponse.json({ error: 'Already processed' }, { status: 400 })
    }
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
