import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const companies = await prisma.company.findMany({
      include: { _count: { select: { buses: true, users: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(companies)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, subdomain } = await req.json()
    if (!name || !subdomain) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const company = await prisma.company.create({ data: { name, subdomain } })
    return NextResponse.json(company)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
