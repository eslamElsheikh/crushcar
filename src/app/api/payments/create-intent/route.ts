import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-04-22.dahlia',
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tripId, seatLabel } = await req.json()
    if (!tripId || !seatLabel) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Check seat already booked
    const existing = await prisma.booking.findFirst({
      where: { tripId, seatLabel, status: { in: ['PENDING', 'PAID'] } },
    })
    if (existing) return NextResponse.json({ error: 'Seat already booked' }, { status: 409 })

    // Get trip + seat price
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { bus: { include: { layout: { include: { seats: true } } } } },
    })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const seat = trip.bus.layout?.seats.find((s) => s.label === seatLabel)
    const amount = Math.round((seat?.price || trip.price) * 100) // cents

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'egp',
      metadata: {
        tripId,
        userId: session.user.id,
        seatLabel,
      },
    })

    // Create PENDING booking (not PAID yet)
    const ref = `CC${tripId.slice(-4).toUpperCase()}-${seatLabel}-${Date.now().toString(36).toUpperCase().slice(-4)}`
    const booking = await prisma.booking.create({
      data: {
        reference: ref,
        userId: session.user.id,
        tripId,
        seatLabel,
        status: 'PENDING',
        total: amount / 100,
      },
      include: {
        trip: { include: { bus: true } },
        user: { select: { name: true, email: true } },
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingId: booking.id,
      reference: booking.reference,
      amount,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}