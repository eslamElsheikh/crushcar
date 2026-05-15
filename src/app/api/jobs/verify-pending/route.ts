import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { sendBookingConfirmationEmail } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-04-22.dahlia',
})

function isCronAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret')
  return secret === process.env.CRON_SECRET
}

// Runs every 15 minutes to recover PENDING bookings whose webhooks may have failed
export async function POST(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    // PENDING bookings older than 2 minutes that have a Stripe session
    const staleThreshold = new Date(now.getTime() - 2 * 60 * 1000)

    const staleBookings = await prisma.booking.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: staleThreshold },
        stripeSessionId: { not: '' },
      },
      include: {
        user: true,
        trip: { include: { bus: true } },
      },
    })

    let recovered = 0
    let failed = 0

    for (const booking of staleBookings) {
      try {
        const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId)
        if (session.payment_status === 'paid') {
          await prisma.booking.update({
            where: { id: booking.id },
            data: { status: 'PAID', paidAt: new Date() },
          })
          try {
            await sendBookingConfirmationEmail(booking.user.email, {
              reference: booking.reference,
              passenger: booking.passengerName || booking.user.name,
              origin: booking.trip.origin,
              destination: booking.trip.destination,
              departure: booking.trip.departure,
              seatLabel: booking.seatLabel,
              total: booking.total,
              busName: booking.trip.bus.name,
            })
          } catch (emailErr) {
            console.error('[verify-pending] Email failed:', emailErr)
          }
          recovered++
        }
      } catch {
        // Stripe session not found or error — leave as PENDING
        failed++
      }
    }

    return NextResponse.json({
      checked: staleBookings.length,
      recovered,
      failed,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ job: 'verify-pending', schedule: '*/15 * * * *', description: 'Recover failed webhook payments' })
}