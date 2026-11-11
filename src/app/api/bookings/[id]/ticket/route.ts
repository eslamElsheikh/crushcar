import { NextRequest, NextResponse } from 'next/server'
import '@/lib/auth'
import { prisma } from '@/lib/prisma'
import QRCode from 'qrcode'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        trip: {
          include: {
            bus: {
              include: {
                company: { select: { name: true } },
              },
            },
            tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
          },
        },
      },
    })

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Resolve actual origin/destination from booking's stop orders
    const tripStops = booking.trip.tripStops || []
    const fromStop = tripStops.find((s: any) => s.stopOrder === booking.fromStopOrder)
    const toStop = tripStops.find((s: any) => s.stopOrder === booking.toStopOrder)
    const actualOrigin = fromStop?.station?.name || booking.trip.origin
    const actualDestination = toStop?.station?.name || booking.trip.destination

    // Get departure time for the actual boarding stop
    let actualDeparture = booking.trip.departure
    if (fromStop?.departureTime) {
      actualDeparture = fromStop.departureTime
    } else if (fromStop?.arrivalTime) {
      actualDeparture = fromStop.arrivalTime
    }

    // QR code with booking reference
    const qrDataUrl = await QRCode.toDataURL(booking.reference, {
      width: 120,
      margin: 1,
      color: { dark: '#3b82f6', light: '#00000000' },
    })

    let pairedBooking = null
    let roundTripLeg: 'outbound' | 'return' | null = null
    if (booking.roundTripGroupId) {
      const paired = await prisma.booking.findFirst({
        where: { roundTripGroupId: booking.roundTripGroupId, id: { not: booking.id } },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          trip: {
            include: {
              bus: { include: { company: { select: { name: true } } } },
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
      user: {
        ...booking.user,
        createdAt: undefined,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}