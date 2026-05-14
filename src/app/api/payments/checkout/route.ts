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
    const authSession = await auth()
    if (!authSession?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = rateLimit(`checkout:${authSession.user.id}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      )
    }

    const body = await req.json()
    const { tripId, seats } = body
    // seats: [{ seatLabel: string, passengerName: string }]

    if (!tripId || !seats || !Array.isArray(seats) || seats.length === 0) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Check all seats are available
    for (const { seatLabel } of seats) {
      const existing = await prisma.booking.findFirst({
        where: { tripId, seatLabel, status: { in: ['PENDING', 'PAID'] } },
      })
      if (existing) {
        return NextResponse.json({ error: `Seat ${seatLabel} is already booked` }, { status: 409 })
      }
    }

    // Get trip + bus info
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { bus: { include: { layout: { include: { seats: true } } } } },
    })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    // Calculate prices per seat
    const lineItems = seats.map(({ seatLabel, passengerName }: { seatLabel: string; passengerName: string }) => {
      const seat = trip.bus.layout?.seats.find((s) => s.label === seatLabel)
      const price = seat?.price ?? trip.price
      const passengerDisplay = passengerName || authSession.user?.name || 'Passenger'
      return {
        price_data: {
          currency: 'egp',
          product_data: {
            name: `${trip.origin} → ${trip.destination}`,
            description: `${passengerDisplay} · Seat ${seatLabel} · ${trip.bus.name} · ${new Date(trip.departure).toLocaleDateString('ar-EG')}`,
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: 1,
      }
    })

    const total = lineItems.reduce((sum, item) => sum + (item.price_data.unit_amount / 100), 0)
    const bookingGroupId = `BG-${Date.now().toString(36).toUpperCase()}`

    // Create Stripe Checkout session
    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      metadata: {
        tripId,
        userId: authSession.user.id,
        bookingGroupId,
        seatsJson: JSON.stringify(seats),
      },
      success_url: `${origin}/bookings/success?session_id={CHECKOUT_SESSION_ID}&group=${bookingGroupId}`,
      cancel_url: `${origin}/trips/${tripId}?cancelled=1`,
    })

    // Create PENDING bookings (one per passenger)
    await Promise.all(seats.map(async ({ seatLabel, passengerName }: { seatLabel: string; passengerName: string }) => {
      const seat = trip.bus.layout?.seats.find((s) => s.label === seatLabel)
      const seatPrice = seat?.price ?? trip.price
      const ref = `CC${tripId.slice(-4).toUpperCase()}-${seatLabel}-${Date.now().toString(36).toUpperCase().slice(-4)}`

      return prisma.booking.create({
        data: {
          reference: ref,
          userId: authSession.user.id,
          tripId,
          seatLabel,
          passengerName: passengerName || authSession.user?.name || '',
          status: 'PENDING',
          total: seatPrice,
          stripeSessionId: checkoutSession.id,
        },
      })
    }))

    return NextResponse.json({ url: checkoutSession.url, groupId: bookingGroupId })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
