import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  PLATFORM_WALLET_ID,
  fundPlatform,
  fromPiastres,
  toPiastres,
} from '@/lib/platform-wallet'

export const dynamic = 'force-dynamic'

/**
 * The platform wallet: its balance and its ledger.
 *
 * Super admin only. The balance is the operator's own float — it is not part
 * of the company credit totals, and the two are never added together.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100')))

    const [wallet, transactions, sum] = await Promise.all([
      prisma.platformWallet.findUnique({ where: { id: PLATFORM_WALLET_ID } }),
      prisma.platformTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.platformTransaction.aggregate({ _sum: { amountPiastres: true } }),
    ])

    const balancePiastres = wallet?.balancePiastres ?? 0
    const ledgerSumPiastres = sum._sum.amountPiastres ?? 0

    return NextResponse.json({
      balance: fromPiastres(balancePiastres),
      balancePiastres,
      // The ledger total and the balance are two different numbers on purpose:
      // the ledger is the record of movements, the balance is what is there
      // now. They must agree, and the reconcile script proves it.
      ledgerSum: fromPiastres(ledgerSumPiastres),
      inSync: balancePiastres === ledgerSumPiastres,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: fromPiastres(t.amountPiastres),
        balanceAfter: fromPiastres(t.balanceAfterPiastres),
        description: t.description,
        reference: t.reference,
        actorEmail: t.actorEmail,
        method: t.method,
        attachmentUrl: t.attachmentUrl,
        createdAt: t.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    logger.error('[Platform Wallet GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * Funds the platform wallet from outside.
 *
 * The operator is the owner of this cash, so it is a direct top-up rather
 * than a request that somebody else approves.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { amount, method, reference, description, attachmentUrl } = await req.json()
    const amountPiastres = toPiastres(Number(amount))
    if (!(amountPiastres > 0)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    if (amountPiastres > 100_000_000) {
      return NextResponse.json({ error: 'Amount is out of range' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) =>
      fundPlatform(tx, {
        amountPiastres,
        method: typeof method === 'string' ? method.slice(0, 40) : '',
        reference: typeof reference === 'string' ? reference.slice(0, 190) : '',
        description: typeof description === 'string' ? description.slice(0, 190) : '',
        attachmentUrl: typeof attachmentUrl === 'string' ? attachmentUrl.slice(0, 190) : null,
        actorId: session.user.id,
        actorEmail: session.user.email ?? '',
      }),
    )

    await prisma.auditLog.create({
      data: {
        action: 'PLATFORM_WALLET_FUND',
        entity: 'PlatformWallet',
        entityId: PLATFORM_WALLET_ID,
        metadata: JSON.stringify({
          amount: fromPiastres(amountPiastres),
          method: method ?? '',
          reference: reference ?? '',
        }),
      },
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      amount: fromPiastres(amountPiastres),
      balance: fromPiastres(result.balanceAfterPiastres),
    })
  } catch (err) {
    logger.error('[Platform Wallet POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
