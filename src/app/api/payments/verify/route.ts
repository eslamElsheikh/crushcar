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

    const authSession = await auth()
    if (!authSession?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = rateLimit(`verify:${authSession.user.id}`, 20, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait.' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      )
    }

    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId)

    if (stripeSession.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed', status: stripeSession.payment_status })
    }

    // Find all PENDING bookings for this Stripe session
    const pendingBookings = await prisma.booking.findMany({
      where: {
        stripeSessionId: sessionId,
        status: 'PENDING',
      },
      include: {
        user: true,
        trip: { include: { bus: true } },
      },
    })

    if (pendingBookings.length === 0) {
      return NextResponse.json({ error: 'Bookings not found' }, { status: 404 })
    }

    // Update all bookings to PAID
    const updated = await Promise.all(
      pendingBookings.map((b) =>
        prisma.booking.update({
          where: { id: b.id },
          data: { status: 'PAID', paidAt: new Date() },
        })
      )
    )

    return NextResponse.json({
      bookings: updated,
      success: true,
      alreadyPaid: false,
      totalPaid: updated.reduce((sum, b) => sum + b.total, 0),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
