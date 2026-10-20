import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { readBookingLimits } from '@/lib/company-quota'

export const dynamic = 'force-dynamic'

/**
 * What a company-funded booking would look like before it is made.
 *
 * The admin picks a company and a trip and needs to see three things before
 * committing: how many seats are left in the company's allowance, how much
 * money is in the company's wallet, and what the seats will cost. Without
 * this the admin finds out the wallet is empty only after trying.
 *
 * It reads and writes nothing: no row is locked and no quota row is created.
 * The booking path re-checks all of it under lock, so a stale preview can
 * never let something through that should have been refused.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') || ''
    const tripId = searchParams.get('tripId') || ''
    if (!companyId || !tripId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const [company, trip] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          bus: { include: { layout: { include: { seats: true } } } },
          tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } },
        },
      }),
    ])
    if (!company) return NextResponse.json({ error: 'No company linked' }, { status: 404 })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const limits = await readBookingLimits(prisma, { company, tripId, trip })

    // The price of one seat, from the same arithmetic the booking uses.
    const seatPrice =
      trip.bus.layout?.seats.find((s: any) => s.price != null)?.price || trip.price

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        isActive: company.isActive,
        walletBalance: company.walletBalance,
        maxSeatsPerBooking: company.maxSeatsPerBooking,
      },
      trip: {
        id: trip.id,
        origin: trip.origin,
        destination: trip.destination,
        departure: trip.departure.toISOString(),
        routeKey: trip.routeKey,
        travelDate: trip.travelDate,
      },
      limits,
      seatPrice,
      // The seats the company could take right now: the smallest of the
      // ceilings that applies, less what it already holds.
      availableSeats: Math.max(
        0,
        Math.min(
          limits.maxSeats,
          limits.tripLimit ?? limits.maxSeats,
          limits.routeLimit ?? limits.maxSeats,
        ) - Math.max(limits.tripUsed, limits.routeUsed),
      ),
    })
  } catch (err) {
    logger.error('[Admin Company Bookings Preview]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
