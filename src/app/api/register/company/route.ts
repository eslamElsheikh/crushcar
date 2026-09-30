import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { companyName, adminName, email, phone, password, notes } = await req.json()

    if (!companyName || !adminName || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!email.includes('@') || password.length < 6) {
      return NextResponse.json({ error: 'Invalid email or password (min 6 chars)' }, { status: 400 })
    }

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    const subdomain = companyName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30) + '-' + Date.now().toString(36)

    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          subdomain,
          isActive: false,
          creditLimit: 0,
          walletBalance: 0,
          paymentMode: 'PREPAID',
          outstandingBalance: 0,
          billingCycle: 'MONTHLY',
        },
      })

      const hashed = await bcrypt.hash(password, 12)
      const user = await tx.user.create({
        data: {
          email,
          password: hashed,
          name: adminName,
          phone: phone || '',
          role: 'COMPANY_ADMIN',
          companyId: company.id,
        },
      })

      return NextResponse.json({
        success: true,
        companyId: company.id,
        message: 'Registration successful. Your account will be reviewed and activated by our team.',
      })
    })
  } catch (err: any) {
    console.error(err)
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Email or subdomain already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
