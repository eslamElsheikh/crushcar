import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role, companyId, phone } = await req.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if (!email.includes('@') || password.length < 6) {
      return NextResponse.json({ error: 'Invalid email or password (min 6 chars)' }, { status: 400 })
    }

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    // Self-registration always creates CUSTOMER role — no one can self-register as admin
    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        phone: phone || '',
        role: 'CUSTOMER',
        companyId: null,
      },
    })

    return NextResponse.json({ id: user.id, email: user.email, name: user.name })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
