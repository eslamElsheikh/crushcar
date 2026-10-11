import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// GET: List all users (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      where: session.user.role === 'COMPANY_ADMIN'
        ? { companyId: session.user.companyId }
        : {},
      orderBy: { createdAt: 'desc' },
    })

    const counts = await prisma.booking.groupBy({
      by: ['userId'],
      where: {
        userId: { in: users.map((u) => u.id) },
        status: { in: ['PAID', 'BOARDED'] },
      },
      _count: true,
    })
    const countByUser = new Map(counts.map((c) => [c.userId, c._count]))

    return NextResponse.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      companyId: u.companyId,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      totalBookings: countByUser.get(u.id) ?? 0,
    })))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: Create admin user (COMPANY_ADMIN only — for creating company staff)
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, email, password, role, phone } = await req.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return NextResponse.json({ error: 'Email already exists' }, { status: 400 })

    // Only SUPER_ADMIN can create other admins
    if (role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN') {
      if (session.user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Not authorized to create admin accounts' }, { status: 403 })
      }
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        phone: phone || '',
        role: role || 'CUSTOMER',
        companyId: session.user.role === 'SUPER_ADMIN' ? undefined : session.user.companyId,
      },
    })

    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
