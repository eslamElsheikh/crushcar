import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import QRCode from 'qrcode'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params

    const booking = await prisma.companyBooking.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        trip: {
          include: {
            bus: true,
            tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
          },
        },
      },
    })

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
    const isCompanyAdmin = session.user.role === 'COMPANY_ADMIN' && Boolean(session.user.companyId) && booking.companyId === session.user.companyId

    if (!isSuperAdmin && !isCompanyAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const tripStops = booking.trip.tripStops || []
    const fromStop = tripStops.find((s: any) => s.stopOrder === booking.fromStopOrder)
    const toStop = tripStops.find((s: any) => s.stopOrder === booking.toStopOrder)
    const actualOrigin = fromStop?.station?.name || booking.trip.origin
    const actualDestination = toStop?.station?.name || booking.trip.destination

    let actualDeparture = booking.trip.departure
    if (fromStop?.departureTime) {
      actualDeparture = fromStop.departureTime
    } else if (fromStop?.arrivalTime) {
      actualDeparture = fromStop.arrivalTime
    }

    const qrDataUrl = await QRCode.toDataURL(booking.reference, {
      width: 120,
      margin: 1,
      color: { dark: '#3b82f6', light: '#00000000' },
    })

    let pairedBooking = null
    let roundTripLeg: 'outbound' | 'return' | null = null
    if (booking.roundTripGroupId) {
      const paired = await prisma.companyBooking.findFirst({
        where: { roundTripGroupId: booking.roundTripGroupId, id: { not: booking.id }, companyId: booking.companyId },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          trip: {
            include: {
              bus: true,
              tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
            },
          },
        },
      })
      if (paired) {
        const pTripStops = paired.trip.tripStops || []
        const pFrom = pTripStops.find((s: any) => s.stopOrder === paired.fromStopOrder)
        const pTo = pTripStops.find((s: any) => s.stopOrder === paired.toStopOrder)
        let pDep = paired.trip.departure
        if (pFrom?.departureTime) pDep = pFrom.departureTime
        else if (pFrom?.arrivalTime) pDep = pFrom.arrivalTime

        const pQr = await QRCode.toDataURL(paired.reference, {
          width: 120,
          margin: 1,
          color: { dark: '#3b82f6', light: '#00000000' },
        })

        pairedBooking = {
          ...paired,
          qrCode: pQr,
          actualOrigin: pFrom?.station?.name || paired.trip.origin,
          actualDestination: pTo?.station?.name || paired.trip.destination,
          actualDeparture: pDep.toISOString(),
          trip: {
            ...paired.trip,
            departure: paired.trip.departure.toISOString(),
            arrival: paired.trip.arrival.toISOString(),
          },
        }
      }

      if (booking.reference.includes('-O-') || booking.reference.endsWith('-O')) {
        roundTripLeg = 'outbound'
      } else if (booking.reference.includes('-R-') || booking.reference.endsWith('-R')) {
        roundTripLeg = 'return'
      } else if (paired) {
        const depThis = new Date(actualDeparture).getTime()
        const depPaired = new Date(paired.trip.departure).getTime()
        roundTripLeg = depThis <= depPaired ? 'outbound' : 'return'
      }
    }

    return NextResponse.json({
      ...booking,
      roundTripLeg,
      pairedBooking,
      qrCode: qrDataUrl,
      paidAt: booking.paidAt?.toISOString() || null,
      createdAt: booking.createdAt.toISOString(),
      actualOrigin,
      actualDestination,
      actualDeparture: actualDeparture.toISOString(),
      trip: {
        ...booking.trip,
        departure: booking.trip.departure.toISOString(),
        arrival: booking.trip.arrival.toISOString(),
      },
      companyName: booking.company.name,
      passengerLabel: booking.passengerName || booking.customer?.name || '',
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
