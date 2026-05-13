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
      include: { layout: { include: { seats: true } }, company: true },
    })
    if (!bus) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // COMPANY_ADMIN can only see their company's buses
    if (session.user.role === 'COMPANY_ADMIN' && bus.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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

    const { id } = await params
    const data = await req.json()

    const existing = await prisma.bus.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // COMPANY_ADMIN can only edit their own company's buses
    if (session.user.role === 'COMPANY_ADMIN' && existing.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const bus = await prisma.bus.update({ where: { id }, data })
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
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    const existing = await prisma.bus.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // COMPANY_ADMIN can only delete their own company's buses
    if (session.user.role === 'COMPANY_ADMIN' && existing.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.bus.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}