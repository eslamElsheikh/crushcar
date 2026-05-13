import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-04-22.dahlia',
})

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 checkout sessions per user per minute
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = rateLimit(`checkout:${session.user.id}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      )
    }

    const { tripId, seatLabel } = await req.json()
    if (!tripId || !seatLabel) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Check seat availability
    const existing = await prisma.booking.findFirst({
      where: { tripId, seatLabel, status: { in: ['PENDING', 'PAID'] } },
    })
    if (existing) return NextResponse.json({ error: 'Seat already booked' }, { status: 409 })

    // Get trip + price
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { bus: { include: { layout: { include: { seats: true } } } } },
    })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const seat = trip.bus.layout?.seats.find((s) => s.label === seatLabel)
    const amount = Math.round((seat?.price || trip.price) * 100)
    const ref = `CC${tripId.slice(-4).toUpperCase()}-${seatLabel}-${Date.now().toString(36).toUpperCase().slice(-4)}`

    // Create Stripe Checkout session
    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'egp',
          product_data: {
            name: `${trip.origin} → ${trip.destination}`,
            description: `${seatLabel} · ${trip.bus.name} · ${new Date(trip.departure).toLocaleDateString('ar-EG')}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: { tripId, userId: session.user.id, seatLabel, ref },
      success_url: `${origin}/bookings/success?session_id={CHECKOUT_SESSION_ID}&ref=${ref}`,
      cancel_url: `${origin}/trips/${tripId}?cancelled=1`,
    })

    // Create PENDING booking
    await prisma.booking.create({
      data: {
        reference: ref,
        userId: session.user.id,
        tripId,
        seatLabel,
        status: 'PENDING',
        total: amount / 100,
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}