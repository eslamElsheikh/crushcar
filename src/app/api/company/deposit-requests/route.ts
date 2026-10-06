import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
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

    const { amount, method, attachmentUrl, attachmentName, notes } = await req.json()
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const METHODS = ['VODAFONE_CASH', 'INSTAPAY', 'CASH', 'BANK']
    if (method !== undefined && !METHODS.includes(method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }
    const PROOF_RE = /^\/api\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i
    if (attachmentUrl !== undefined && (typeof attachmentUrl !== 'string' || !PROOF_RE.test(attachmentUrl))) {
      return NextResponse.json({ error: 'Invalid proof URL' }, { status: 400 })
    }

    const depositRequest = await prisma.depositRequest.create({
      data: {
        companyId: session.user.companyId,
        amount,
        method: method || null,
        notes: notes || '',
        attachmentUrl: attachmentUrl || '',
        attachmentName: attachmentName || '',
      },
    })

    return NextResponse.json({ data: depositRequest })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
