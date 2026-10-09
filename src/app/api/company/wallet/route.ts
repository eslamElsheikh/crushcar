import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'))
    const skip = (page - 1) * take

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.walletTransaction.count({ where: { companyId } }),
    ])

    return NextResponse.json({
      data: transactions.map(t => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
      pagination: { page, take, total, pages: Math.ceil(total / take) },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Deposits must go through an approved DepositRequest (admin-reviewed). A company
// admin topping up their own wallet from this endpoint would be minting money.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = session.user.companyId
    const { targetCompanyId, amount, description } = await req.json()
    const toCompany = targetCompanyId || companyId
    if (!toCompany) return NextResponse.json({ error: 'No company specified' }, { status: 400 })
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: toCompany } })
      if (!company) throw new Error('Company not found')

      const updatedCompany = await tx.company.update({
        where: { id: toCompany },
        data: { walletBalance: { increment: amount } },
      })

      const transaction = await tx.walletTransaction.create({
        data: {
          companyId: toCompany,
          type: 'DEPOSIT',
          amount,
          description: description || 'Wallet deposit',
        },
      })

      await tx.auditLog.create({
        data: {
          action: 'WALLET_CREDIT',
          entity: 'Company',
          entityId: toCompany,
          userId: session.user.id,
          userEmail: session.user.email ?? '',
          companyId: toCompany,
          metadata: JSON.stringify({ amount, description: description || '' }),
        },
      })

      return NextResponse.json({
        transaction: { ...transaction, createdAt: transaction.createdAt.toISOString() },
        newBalance: updatedCompany.walletBalance,
      })
    })
  } catch (err: any) {
    console.error('[company/wallet]', err?.message || err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
