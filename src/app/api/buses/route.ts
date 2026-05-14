import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    // Non-admins see only their company's buses
    const where = session.user.role === 'SUPER_ADMIN'
      ? (companyId ? { companyId } : {})
      : { companyId: session.user.companyId ?? undefined }

    const buses = await prisma.bus.findMany({
      where,
      include: { layout: { include: { seats: true } }, company: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(buses)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, type, companyId } = body
    const seatCount = body.seatCount ?? 0

    if (!name || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // COMPANY_ADMIN can only create buses for their own company
    if (session.user.role === 'COMPANY_ADMIN') {
      if (companyId && companyId !== session.user.companyId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const bus = await prisma.bus.create({
      data: { name, type, seatCount, companyId: companyId || session.user.companyId },
      include: { company: true },
    })

    return NextResponse.json(bus)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
