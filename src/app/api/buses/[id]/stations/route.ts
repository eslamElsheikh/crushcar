import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const bus = await prisma.bus.findUnique({
      where: { id },
      include: { stations: { orderBy: { order: 'asc' } } },
    })
    if (!bus) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (session.user.role === 'COMPANY_ADMIN' && bus.companyId !== null && bus.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(bus.stations)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Business rule: only SUPER_ADMIN edits bus stations.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { stations } = await req.json()
    // stations: [{ name: string, order: number }]

    const bus = await prisma.bus.findUnique({ where: { id } })
    if (!bus) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Delete all existing stations and recreate
    await prisma.busStation.deleteMany({ where: { busId: id } })

    const created = await Promise.all(
      stations.map((s: { name: string; order: number }) =>
        prisma.busStation.create({ data: { busId: id, name: s.name, order: s.order } })
      )
    )

    return NextResponse.json(created)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
