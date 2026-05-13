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
    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

    // Rate limit: 20 verifies per user per minute
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = rateLimit(`verify:${session.user.id}`, 20, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait.' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      )
    }

    // Retrieve the Stripe checkout session
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
    const { ref, tripId, userId, seatLabel } = stripeSession.metadata || {}

    // Check if already paid
    const existingBooking = await prisma.booking.findFirst({
      where: { reference: ref || '' },
      include: { user: true, trip: { include: { bus: true } } },
    })

    if (!existingBooking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (existingBooking.status === 'PAID') {
      return NextResponse.json({ booking: existingBooking, alreadyPaid: true })
    }

    if (stripeSession.payment_status === 'paid') {
      const updated = await prisma.booking.update({
        where: { id: existingBooking.id },
        data: { status: 'PAID', paidAt: new Date() },
      })

      return NextResponse.json({ booking: updated, success: true })
    }

    return NextResponse.json({ error: 'Payment not completed', status: stripeSession.payment_status })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}