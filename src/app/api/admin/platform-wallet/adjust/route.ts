import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { adjustPlatform, fromPiastres, toPiastres } from '@/lib/platform-wallet'

export const dynamic = 'force-dynamic'

/**
 * Corrects the platform wallet by hand.
 *
 * For what a ledger cannot describe: a bank fee, a mistyped figure, money
 * that arrived outside the system. The reason is mandatory — an adjustment
 * without one is indistinguishable from a mistake, and the next person to
 * read the ledger would have to guess.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { amount, reason, reference } = await req.json()
    const trimmed = typeof reason === 'string' ? reason.trim() : ''
    if (!trimmed) {
      return NextResponse.json({ error: 'A reason is required' }, { status: 400 })
    }

    const amountPiastres = toPiastres(Number(amount))
    if (!Number.isFinite(amountPiastres) || amountPiastres === 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) =>
      adjustPlatform(tx, {
        amountPiastres,
        description: trimmed.slice(0, 190),
        reference: typeof reference === 'string' ? reference.slice(0, 190) : '',
        actorId: session.user.id,
        actorEmail: session.user.email ?? '',
      }),
    )

    await prisma.auditLog.create({
      data: {
        action: 'PLATFORM_WALLET_ADJUST',
        entity: 'PlatformWallet',
        entityId: 'main',
        metadata: JSON.stringify({ amount: fromPiastres(amountPiastres), reason: trimmed }),
      },
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      amount: fromPiastres(amountPiastres),
      balance: fromPiastres(result.balanceAfterPiastres),
    })
  } catch (err: any) {
    if (err?.code === 'INSUFFICIENT_PLATFORM_BALANCE') {
      return NextResponse.json(
        { error: 'INSUFFICIENT_PLATFORM_BALANCE', message: 'الرصيد لا يكفي لهذا التعديل' },
        { status: 400 },
      )
    }
    logger.error('[Platform Wallet Adjust]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
