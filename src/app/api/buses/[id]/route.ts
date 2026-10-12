import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { isBusType } from '@/lib/bus-types'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    // Read is staff-only for the same reason the write is: this returns the seat
    // layout and the owning company for the whole fleet, and the only screens
    // that call it are the admin bus screens.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const bus = await prisma.bus.findUnique({
      where: { id },
      include: { layout: { include: { seats: true } }, company: true },
    })
    if (!bus) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(bus)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Business rule: only SUPER_ADMIN edits buses. Companies and customers only book.
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const data = await req.json()

    const existing = await prisma.bus.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Allowlist instead of passing the body straight into prisma.bus.update:
    // the fleet is SUPER_ADMIN-owned, so only its editable columns should be
    // writable. companyId in particular must not be reassignable from here.
    const patch: Record<string, unknown> = {}
    if (typeof data.name === 'string' && data.name.trim()) patch.name = data.name.trim()
    if (data.type !== undefined) {
      if (!isBusType(data.type)) {
        return NextResponse.json({ error: 'Invalid bus type' }, { status: 400 })
      }
      patch.type = data.type
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const bus = await prisma.bus.update({ where: { id }, data: patch })
    return NextResponse.json(bus)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Business rule: only SUPER_ADMIN deletes buses. (Extended from the PUT lock: same fleet rule.)
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    const existing = await prisma.bus.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.bus.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}