import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companies = await prisma.company.findMany({
      where: { isActive: false },
      include: {
        users: {
          where: { role: 'COMPANY_ADMIN' },
          select: { id: true, name: true, email: true, phone: true },
        },
        _count: { select: { buses: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      companies.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      }))
    )
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
