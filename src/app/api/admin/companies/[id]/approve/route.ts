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
    const { creditLimit, paymentMode, billingCycle, action } = await req.json()

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    if (action === 'reject') {
      await prisma.company.delete({ where: { id } })
      return NextResponse.json({ success: true, message: 'Company rejected and removed' })
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        isActive: true,
        creditLimit: creditLimit || 0,
        paymentMode: paymentMode || 'PREPAID',
        billingCycle: billingCycle || 'MONTHLY',
      },
      include: {
        users: {
          where: { role: 'COMPANY_ADMIN' },
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Company activated successfully',
      company: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
      },
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
