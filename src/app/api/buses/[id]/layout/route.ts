import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const layout = await prisma.busLayout.findUnique({
      where: { busId: id },
      include: { seats: { orderBy: [{ row: 'asc' }, { col: 'asc' }] } },
    })
    return NextResponse.json(layout)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { rows, cols, aisleAfter, colsPerRow, seats } = await req.json()

    const existing = await prisma.busLayout.findUnique({ where: { busId: id } })
    if (existing) {
      await prisma.seat.deleteMany({ where: { layoutId: existing.id } })
      await prisma.busLayout.delete({ where: { busId: id } })
    }

    const layout = await prisma.busLayout.create({
      data: {
        busId: id,
        rows,
        cols,
        aisleAfter: aisleAfter ?? 2,
        colsPerRow: colsPerRow || '',
        seats: {
          create: seats.map((s: { label: string; row: number; col: number; type: string; price: number }) => ({
            label: s.label,
            row: s.row,
            col: s.col,
            type: s.type,
            price: s.price,
          })),
        },
      },
      include: { seats: true },
    })

    await prisma.bus.update({
      where: { id },
      data: { seatCount: seats.length },
    })

    return NextResponse.json(layout)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}