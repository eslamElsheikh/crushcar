import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    // Non-admins see only their company's buses; COMPANY_ADMIN also sees global buses (null companyId)
    const where = session.user.role === 'SUPER_ADMIN'
      ? (companyId ? { companyId } : {})
      : {
          OR: [
            { companyId: session.user.companyId ?? undefined },
            { companyId: null },
          ],
        }

    const buses = await prisma.bus.findMany({
      where,
      include: { layout: { include: { seats: true } }, company: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(buses)
  } catch (err: any) {
    console.error('[buses POST] error:', err?.message || err, 'code:', err?.code)
    return NextResponse.json({ error: 'Server error', detail: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Business rule: only SUPER_ADMIN creates buses. Companies and customers only book.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { name, type, companyId } = body
    const seatCount = body.seatCount ?? 0

    if (!name || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // SUPER_ADMIN may create buses without a company (global) or for one
    const targetCompanyId: string | null = companyId || null

    console.error('[buses POST] session:', JSON.stringify({
      role: session.user.role,
      companyId: session.user.companyId,
      target: targetCompanyId,
      input: { name, type, seatCount, companyId },
    }))

    const bus = await prisma.bus.create({
      data: { name, type, seatCount, companyId: targetCompanyId },
      include: { company: true },
    })

    return NextResponse.json(bus)
  } catch (err: any) {
    console.error('[buses POST] error:', err?.message || err, 'code:', err?.code)
    return NextResponse.json({ error: 'Server error', detail: err?.message }, { status: 500 })
  }
}
