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
    const session = event.data.object as Stripe.Checkout.Session
    const { tripId, userId, seatLabel, ref } = session.metadata || {}

    try {
      const booking = await prisma.booking.findFirst({
        where: { reference: ref || '', status: 'PENDING' },
        include: { user: true, trip: { include: { bus: true } } },
      })

      if (booking) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'PAID', paidAt: new Date() },
        })

        await sendBookingConfirmationEmail(booking.user.email, {
          reference: booking.reference,
          passenger: booking.user.name,
          origin: booking.trip.origin,
          destination: booking.trip.destination,
          departure: booking.trip.departure,
          seatLabel: booking.seatLabel,
          total: booking.total,
          busName: booking.trip.bus.name,
        })
      }
    } catch (err) {
      console.error('Webhook booking update error:', err)
    }
  }

  return NextResponse.json({ received: true })
}