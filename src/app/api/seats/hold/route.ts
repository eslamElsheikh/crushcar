import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimitHttp'

/**
 * A hold is a two-minute reservation of one seat while its buyer finishes
 * the checkout form. It is optional — a booking without a hold is still
 * valid — but while it is alive nobody else may take that seat, on any
 * booking path.
 *
 * Two abuses this route has to refuse, both of which cost nothing to
 * attempt and were previously free:
 *
 *   - squatting: one account holding every seat on every trip for two
 *     minutes at a time, so nobody else can book. Capped per user.
 *   - flooding: unbounded hold creation as a write-amplification probe.
 *     Capped per IP like every other write endpoint that matters.
 */
const HOLD_BUCKET = 'seat-hold'
const HOLD_MAX_PER_WINDOW = 30
const HOLD_WINDOW_MS = 60_000

/** Active holds one account may hold at once. */
const MAX_ACTIVE_HOLDS = 10

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, HOLD_BUCKET, HOLD_MAX_PER_WINDOW, HOLD_WINDOW_MS)
  if (rl.blocked) return rl.blocked
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tripId, seatLabel, fromStationId, toStationId } = await req.json()
    if (!tripId || !seatLabel || !fromStationId || !toStationId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Resolve stop orders
    const [fromStop, toStop] = await Promise.all([
      prisma.tripStop.findFirst({ where: { tripId, stationId: fromStationId } }),
      prisma.tripStop.findFirst({ where: { tripId, stationId: toStationId } }),
    ])
    if (!fromStop || !toStop) {
      return NextResponse.json({ error: 'Invalid stations for this trip' }, { status: 400 })
    }
    if (fromStop.stopOrder >= toStop.stopOrder) {
      return NextResponse.json({ error: 'fromStation must be before toStation' }, { status: 400 })
    }

    const fromStopOrder = fromStop.stopOrder
    const toStopOrder = toStop.stopOrder

    // Squatting guard: an account may only have so many seats reserved at
    // once. Expired holds do not count, so a normal browse is unaffected.
    const active = await prisma.seatHold.count({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    })
    if (active >= MAX_ACTIVE_HOLDS) {
      return NextResponse.json(
        { error: 'HOLD_LIMIT', message: 'لديك حجوزات مؤقتة كافية، أكمل أحدها أو ألغِه' },
        { status: 429, headers: { 'Retry-After': '120' } }
      )
    }

    // Overlap against a stored segment: a degenerate (1, 1) row — what a
    // booking on a trip with no stops records — stands for the whole route
    // and therefore overlaps everything. See segmentOverlap in
    // src/lib/seat-availability.ts for why the plain test is not enough.
    const overlap = {
      OR: [
        { fromStopOrder: { lt: toStopOrder }, toStopOrder: { gt: fromStopOrder } },
        { fromStopOrder: 1, toStopOrder: 1 },
      ],
    }

    // Validate no overlapping confirmed booking, on either kind.
    const bookingConflict = await prisma.booking.findFirst({
      where: {
        tripId,
        seatLabel,
        status: { in: ['PENDING', 'PAID', 'BOARDED'] },
        ...overlap,
      },
    })
    if (bookingConflict) {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'الكـرس محجوز' }, { status: 409 })
    }

    const companyConflict = await prisma.companyBooking.findFirst({
      where: {
        tripId,
        seatLabel,
        status: { in: ['PENDING', 'PAID', 'BOARDED'] },
        ...overlap,
      },
    })
    if (companyConflict) {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'الكـرس محجوز' }, { status: 409 })
    }

    // Validate no overlapping active hold
    const holdConflict = await prisma.seatHold.findFirst({
      where: {
        tripId,
        seatLabel,
        expiresAt: { gt: new Date() },
        ...overlap,
      },
    })
    if (holdConflict) {
      return NextResponse.json({ error: 'SEAT_TAKEN', message: 'الكـرس محجوز مؤقتاً' }, { status: 409 })
    }

    // Create hold (2 minutes)
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000)
    const hold = await prisma.seatHold.create({
      data: { tripId, seatLabel, fromStopOrder, toStopOrder, userId: session.user.id, expiresAt },
    })

    // Cleanup old expired holds
    prisma.seatHold.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {})

    return NextResponse.json({ holdId: hold.id, expiresAt: expiresAt.toISOString() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const holdId = searchParams.get('holdId')
    if (!holdId) return NextResponse.json({ error: 'Missing holdId' }, { status: 400 })

    await prisma.seatHold.deleteMany({ where: { id: holdId, userId: session.user.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
