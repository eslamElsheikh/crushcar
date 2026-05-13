import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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
          },
        },
      },
    })

    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // QR code with booking reference
    const qrDataUrl = await QRCode.toDataURL(booking.reference, {
      width: 120,
      margin: 1,
      color: { dark: '#3b82f6', light: '#00000000' },
    })

    return NextResponse.json({
      ...booking,
      qrCode: qrDataUrl,
      paidAt: booking.paidAt?.toISOString() || null,
      createdAt: booking.createdAt.toISOString(),
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