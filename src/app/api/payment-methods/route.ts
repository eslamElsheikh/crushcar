import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Public endpoint: returns active payment methods for payers to choose from.
 */
export async function GET() {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({ methods })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: err?.message }, { status: 500 })
  }
}
