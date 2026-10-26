import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { isBusType } from '@/lib/bus-types'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // The fleet is the operator's own asset list and every write is already
    // SUPER_ADMIN-only. Reading it used to be open to any signed-in user, and
    // the non-admin branch was ineffective anyway: companyId is undefined for a
    // customer, and an undefined filter is ignored by Prisma, so it collapsed to
    // "every global bus". That handed any logged-in account the whole fleet with
    // its seat layout and its owning company.
    //
    // No customer or company screen reads this: their seat map comes from
    // /api/trips/[id], which returns only the bus fields needed to draw seats.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    const where = companyId ? { companyId } : {}

    const buses = await prisma.bus.findMany({
      where,
      include: { layout: { include: { seats: true } }, company: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(buses)
  } catch (err: any) {
    // The message stays in the log: a Prisma failure names the table, the
    // column and sometimes the file path, none of which belongs to a caller.
    console.error('[buses GET] error:', err?.message || err, 'code:', err?.code)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
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

    // type drives which trips a bus can be assigned to (CHARTER buses only
    // appear in the charter tab), so an unknown value must not be stored.
    if (!isBusType(type)) {
      return NextResponse.json({ error: 'Invalid bus type' }, { status: 400 })
    }

    // SUPER_ADMIN may create buses without a company (global) or for one
    const targetCompanyId: string | null = companyId || null;

    const bus = await prisma.bus.create({
      data: { name, type, seatCount, companyId: targetCompanyId },
      include: { company: true },
    })

    return NextResponse.json(bus)
  } catch (err: any) {
    // Logged, never returned — see the GET handler above.
    console.error('[buses POST] error:', err?.message || err, 'code:', err?.code)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
