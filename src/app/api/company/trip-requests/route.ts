import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'COMPANY_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requests = await prisma.tripRequest.findMany({
      where: { companyId: session.user.companyId },
      include: {
        fromStation: { select: { id: true, name: true, city: true } },
        toStation: { select: { id: true, name: true, city: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: requests })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'COMPANY_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { fromStationId, toStationId, date, passengerCount, notes } = await req.json()

    if (!fromStationId || !toStationId || !date || !passengerCount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (fromStationId === toStationId) {
      return NextResponse.json({ error: 'From and To stations must be different' }, { status: 400 })
    }

    if (!session.user.companyId) {
      return NextResponse.json({ error: 'No company associated' }, { status: 400 })
    }

    const request = await prisma.tripRequest.create({
      data: {
        companyId: session.user.companyId,
        fromStationId,
        toStationId,
        date: new Date(date),
        passengerCount,
        notes: notes || '',
      },
      include: {
        fromStation: { select: { id: true, name: true, city: true } },
        toStation: { select: { id: true, name: true, city: true } },
      },
    })

    return NextResponse.json({ data: request })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
