import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role === 'CUSTOMER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { direction } = await req.json()

    const current = await prisma.faq.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (direction === 'up') {
      const above = await prisma.faq.findFirst({
        where: { order: { lt: current.order } },
        orderBy: { order: 'desc' },
      })
      if (above) {
        await prisma.$transaction([
          prisma.faq.update({ where: { id: current.id }, data: { order: above.order } }),
          prisma.faq.update({ where: { id: above.id }, data: { order: current.order } }),
        ])
      }
    } else if (direction === 'down') {
      const below = await prisma.faq.findFirst({
        where: { order: { gt: current.order } },
        orderBy: { order: 'asc' },
      })
      if (below) {
        await prisma.$transaction([
          prisma.faq.update({ where: { id: current.id }, data: { order: below.order } }),
          prisma.faq.update({ where: { id: below.id }, data: { order: current.order } }),
        ])
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
