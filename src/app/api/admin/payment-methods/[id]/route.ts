import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['BANK', 'VODAFONE_CASH', 'INSTAPAY', 'OTHER'] as const

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
    const existing = await prisma.paymentMethod.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const { type, displayName, accountHolder, accountNumber, instructions, isActive, sortOrder } = body

    const data: any = {}
    if (displayName !== undefined) {
      if (!String(displayName).trim()) {
        return NextResponse.json({ error: 'DISPLAY_NAME_REQUIRED', message: 'اسم طريقة الدفع مطلوب' }, { status: 400 })
      }
      data.displayName = String(displayName).trim()
    }
    if (type !== undefined) {
      const resolved = String(type).toUpperCase()
      if (!VALID_TYPES.includes(resolved as any)) {
        return NextResponse.json({ error: 'INVALID_TYPE', message: 'نوع طريقة الدفع غير صالح' }, { status: 400 })
      }
      data.type = resolved
    }
    if (accountHolder !== undefined) data.accountHolder = String(accountHolder).trim()
    if (accountNumber !== undefined) data.accountNumber = String(accountNumber).trim()
    if (instructions !== undefined) data.instructions = String(instructions).trim()
    if (isActive !== undefined) data.isActive = Boolean(isActive)
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder)

    const updated = await prisma.paymentMethod.update({
      where: { id },
      data,
    })

    await audit({
      action: 'UPDATE',
      entity: 'Setting' as any,
      entityId: id,
      session,
      metadata: { action: 'UPDATE_PAYMENT_METHOD', changes: data },
    })

    return NextResponse.json({ method: updated })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: err?.message }, { status: 500 })
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
    const existing = await prisma.paymentMethod.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true, depositRequests: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasReferences = (existing._count?.bookings || 0) > 0 || (existing._count?.depositRequests || 0) > 0

    if (hasReferences) {
      // Soft-delete if referenced by existing bookings/deposits
      const updated = await prisma.paymentMethod.update({
        where: { id },
        data: { isActive: false },
      })
      await audit({
        action: 'DELETE',
        entity: 'Setting' as any,
        entityId: id,
        session,
        metadata: { action: 'SOFT_DELETE_PAYMENT_METHOD', reason: 'Has existing references' },
      })
      return NextResponse.json({ success: true, softDeleted: true, method: updated })
    }

    await prisma.paymentMethod.delete({ where: { id } })
    await audit({
      action: 'DELETE',
      entity: 'Setting' as any,
      entityId: id,
      session,
      metadata: { action: 'DELETE_PAYMENT_METHOD' },
    })

    return NextResponse.json({ success: true, softDeleted: false })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: err?.message }, { status: 500 })
  }
}
