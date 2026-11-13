import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { parseMoneyAmount } from '@/lib/validations'

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'COMPANY_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requests = await prisma.depositRequest.findMany({
      where: { companyId: session.user.companyId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: requests })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'COMPANY_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.user.companyId) {
      return NextResponse.json({ error: 'No company linked' }, { status: 400 })
    }

    const { amount, method, paymentMethodId, attachmentUrl, attachmentName, notes } = await req.json()
    // A deposit is money a company says it has sent. It has to be a number,
    // finite, positive, in pounds with at most two decimals, and inside the
    // same ceiling a platform top-up gets: `!amount || amount <= 0` accepted
    // the string `"100"` and let `Infinity` through to the database.
    const parsedAmount = parseMoneyAmount(amount)
    if (!parsedAmount.ok) {
      return NextResponse.json({ error: 'Invalid amount', message: parsedAmount.reason }, { status: 400 })
    }

    const METHODS = ['VODAFONE_CASH', 'INSTAPAY']
    let validatedMethod = method || null
    let validatedMethodId: string | null = null

    if (paymentMethodId) {
      const pm = await prisma.paymentMethod.findUnique({
        where: { id: paymentMethodId, isActive: true },
      })
      if (!pm) {
        return NextResponse.json(
          { error: 'INVALID_PAYMENT_METHOD', message: 'طريقة الدفع غير صالحة أو غير مفعلة' },
          { status: 400 }
        )
      }
      validatedMethodId = pm.id
      validatedMethod = pm.displayName || pm.type
    } else if (method !== undefined && method !== null && !METHODS.includes(method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }
    const PROOF_RE = /^\/api\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i
    if (attachmentUrl !== undefined && (typeof attachmentUrl !== 'string' || !PROOF_RE.test(attachmentUrl))) {
      return NextResponse.json({ error: 'Invalid proof URL' }, { status: 400 })
    }

    const depositRequest = await prisma.depositRequest.create({
      data: {
        companyId: session.user.companyId,
        amount: parsedAmount.value,
        method: validatedMethod,
        paymentMethodId: validatedMethodId,
        notes: typeof notes === 'string' ? notes.slice(0, 500) : '',
        attachmentUrl: attachmentUrl || '',
        attachmentName: typeof attachmentName === 'string' ? attachmentName.slice(0, 200) : '',
      },
    })

    return NextResponse.json({ data: depositRequest })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
