import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || !session.user.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      include: {
        _count: { select: { buses: true } },
      },
    })

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    return NextResponse.json({
      id: company.id,
      name: company.name,
      isActive: company.isActive,
      busesCount: company._count.buses,
      logoUrl: company.logoUrl,
      showLogoOnTicket: company.showLogoOnTicket,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
