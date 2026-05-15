import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendBookingReminderEmail } from '@/lib/email'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret')
  return secret === process.env.CRON_SECRET
}

// Runs every hour to send 24h trip reminders
export async function POST(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const in22h = new Date(now.getTime() + 22 * 60 * 60 * 1000) // 22-24h window

    // Find PAID bookings for trips departing in ~24h
    const upcomingBookings = await prisma.booking.findMany({
      where: {
        status: 'PAID',
        trip: {
          departure: { gte: in22h, lte: in24h },
          status: 'SCHEDULED',
        },
      },
      include: {
        user: true,
        trip: { include: { bus: true } },
        reminders: false, // exclude already-sent
      },
      take: 100,
    })

    let sent = 0
    let skipped = 0

    for (const booking of upcomingBookings) {
      // Skip if already sent a 24h reminder
      const alreadySent = await prisma.reminder.findUnique({ where: { bookingId: booking.id } })
      if (alreadySent) { skipped++; continue }

      try {
        await sendBookingReminderEmail(booking.user.email, {
          reference: booking.reference,
          passenger: booking.passengerName || booking.user.name,
          origin: booking.trip.origin,
          destination: booking.trip.destination,
          departure: booking.trip.departure,
          seatLabel: booking.seatLabel,
          total: booking.total,
          busName: booking.trip.bus.name,
        })
        await prisma.reminder.create({
          data: { bookingId: booking.id, type: '24H' },
        })
        sent++
      } catch (emailErr) {
        console.error('[reminders] Failed to send reminder:', emailErr)
      }
    }

    return NextResponse.json({
      checked: upcomingBookings.length,
      sent,
      skipped,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ job: 'reminders', schedule: '0 * * * *', description: 'Send 24h trip reminder emails' })
}