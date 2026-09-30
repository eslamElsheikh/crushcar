import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (session?.user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const { status, adminNotes } = await req.json()

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    if (status === 'REJECTED' && !adminNotes) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
    }

    const existing = await prisma.tripRequest.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (existing.status !== 'PENDING') {
      return NextResponse.json({ error: 'Request already processed' }, { status: 400 })
    }

    const updated = await prisma.tripRequest.update({
      where: { id },
      data: { status, adminNotes: adminNotes || '' },
      include: {
        company: { select: { id: true, name: true } },
        fromStation: { select: { id: true, name: true, city: true } },
        toStation: { select: { id: true, name: true, city: true } },
      },
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
