import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { sendBookingConfirmationEmail } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-04-22.dahlia',
})

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig || '',
      process.env.STRIPE_WEBHOOK_SECRET || ''
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const stripeSession = event.data.object as Stripe.Checkout.Session

    try {
      // Find all PENDING bookings for this Stripe session
      const bookings = await prisma.booking.findMany({
        where: {
          stripeSessionId: stripeSession.id,
          status: 'PENDING',
        },
        include: { user: true, trip: { include: { bus: true } } },
      })

      // Update all to PAID
      await Promise.all(bookings.map((b) =>
        prisma.booking.update({
          where: { id: b.id },
          data: { status: 'PAID', paidAt: new Date() },
        })
      ))

      // Send confirmation email for each booking
      await Promise.all(bookings.map((b) =>
        sendBookingConfirmationEmail(b.user.email, {
          reference: b.reference,
          passenger: b.passengerName || b.user.name,
          origin: b.trip.origin,
          destination: b.trip.destination,
          departure: b.trip.departure,
          seatLabel: b.seatLabel,
          total: b.total,
          busName: b.trip.bus.name,
        })
      ))
    } catch (err) {
      console.error('Webhook booking update error:', err)
    }
  }

  return NextResponse.json({ received: true })
}