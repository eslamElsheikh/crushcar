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
        // Conditional claim: the PENDING check above is only a read, so two
        // rejections racing each other would both pass it. The status lives
        // in the WHERE clause, so exactly one request wins the row.
        const claimed = await tx.depositRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: { status, adminNotes: adminNotes || '' },
        })
        if (claimed.count === 0) throw new Error('Already processed')
        const updated = await tx.depositRequest.findUnique({ where: { id } })
        return NextResponse.json({ data: updated })
      }

      // APPROVED: apply deposit to company account
      const company = await tx.company.findUnique({ where: { id: existing.companyId } })
      if (!company) throw new Error('Company not found')

      const amount = existing.amount
      // The stored amount is what a *company* wrote when it filed the
      // request, so it is not trusted input — if it is not a plausible sum
      // of money (the write path has always validated it, but a row could
      // predate that or be edited out-of-band) the approval must stop here
      // rather than credit a NaN or a negative figure to the ledger.
      if (!Number.isFinite(amount) || amount <= 0) {
        console.error('[deposit-requests] implausible stored amount', id, amount)
        throw new Error('BAD_STORED_AMOUNT')
      }
      let payOutstanding = 0
      let toWallet = amount

      if (company.outstandingBalance > 0) {
        payOutstanding = Math.min(amount, company.outstandingBalance)
        toWallet = amount - payOutstanding
      }

      // Claim the request before any money moves. A second approval that
      // loses this claim throws and rolls back, so the company can be
      // credited exactly once even if two administrators click at the same
      // time. The claim is inside the same transaction as the credit, so a
      // later failure puts the status back to PENDING too.
      const claimed = await tx.depositRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', adminNotes: adminNotes || '' },
      })
      if (claimed.count === 0) throw new Error('Already processed')

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
          // Unique per deposit request: even if a future change weakened the
          // status claim, the ledger would refuse to record the same deposit
          // twice.
          idempotencyKey: `deposit-request:${id}`,
        },
      })

      const updated = await tx.depositRequest.findUnique({ where: { id } })

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
    // Nothing else is echoed back: `err.message` used to be returned as the
    // response body, which turns any internal failure (a driver error with a
    // connection string in it, a Prisma schema hint) into an answer for the
    // caller. The details stay in the log, where an operator can read them.
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
