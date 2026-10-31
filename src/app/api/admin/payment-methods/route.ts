import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['BANK', 'VODAFONE_CASH', 'INSTAPAY', 'OTHER'] as const

/**
 * Super admin payment methods management (list all & create).
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const methods = await prisma.paymentMethod.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({ methods })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { type, displayName, accountHolder, accountNumber, instructions, isActive, sortOrder } = body

    if (!displayName || !String(displayName).trim()) {
      return NextResponse.json({ error: 'DISPLAY_NAME_REQUIRED', message: 'اسم طريقة الدفع مطلوب' }, { status: 400 })
    }

    const resolvedType = String(type || 'OTHER').toUpperCase()
    if (!VALID_TYPES.includes(resolvedType as any)) {
      return NextResponse.json({ error: 'INVALID_TYPE', message: 'نوع طريقة الدفع غير صالح' }, { status: 400 })
    }

    const method = await prisma.paymentMethod.create({
      data: {
        type: resolvedType,
        displayName: String(displayName).trim(),
        accountHolder: accountHolder ? String(accountHolder).trim() : '',
        accountNumber: accountNumber ? String(accountNumber).trim() : '',
        instructions: instructions ? String(instructions).trim() : '',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      },
    })

    await audit({
      action: 'CREATE',
      entity: 'Setting' as any,
      entityId: method.id,
      session,
      metadata: { action: 'CREATE_PAYMENT_METHOD', methodId: method.id, displayName: method.displayName },
    })

    return NextResponse.json({ method }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: err?.message }, { status: 500 })
  }
}
