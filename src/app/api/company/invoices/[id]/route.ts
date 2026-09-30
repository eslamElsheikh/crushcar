import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { status, paidAmount } = await req.json()

    const invoice = await prisma.invoice.findUnique({ where: { id } })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    return await prisma.$transaction(async (tx) => {
      let updateData: Record<string, unknown> = {}

      if (status === 'PAID' || paidAmount !== undefined) {
        const newPaidAmount = paidAmount !== undefined ? paidAmount : invoice.totalAmount
        updateData.paidAmount = newPaidAmount
        updateData.paidAt = new Date()

        if (newPaidAmount >= invoice.totalAmount) {
          updateData.status = 'PAID'
          await tx.company.update({
            where: { id: invoice.companyId },
            data: {
              outstandingBalance: { decrement: invoice.totalAmount - invoice.paidAmount },
              lastBillingDate: new Date(),
            },
          })
        } else if (newPaidAmount > 0) {
          updateData.status = 'PARTIAL'
        }
      }

      if (status === 'OVERDUE') {
        updateData.status = 'OVERDUE'
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: updateData,
      })

      return NextResponse.json({
        ...updated,
        periodStart: updated.periodStart.toISOString(),
        periodEnd: updated.periodEnd.toISOString(),
        dueDate: updated.dueDate.toISOString(),
        paidAt: updated.paidAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      })
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
