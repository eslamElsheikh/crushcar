import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const requested = searchParams.get('companyId')

    // COMPANY_ADMIN only ever sees their own company.
    const where =
      session.user.role === 'SUPER_ADMIN'
        ? requested
          ? { id: requested }
          : {}
        : { id: session.user.companyId ?? '__none__' }

    const companies = await prisma.company.findMany({
      where,
      include: { _count: { select: { buses: true, users: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(companies)
  } catch (err) {
    console.error('[companies]', err instanceof Error ? err.message : err)
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
