import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { effectiveMaxSeatsPerBooking } from '@/lib/booking-limits'

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
      // The seat cap for one booking, so the booking page can stop the
      // customer selecting more seats than the company may hold. The server
      // enforces it either way; this is so the page does not let them try.
      maxSeatsPerBooking: effectiveMaxSeatsPerBooking(company),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
