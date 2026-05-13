import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Called by cron or on dashboard load
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const now = new Date()

    // Auto-expire PENDING bookings older than 30 minutes
    const expiryThreshold = new Date(now.getTime() - 30 * 60 * 1000)
    const expiredResult = await prisma.booking.updateMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: expiryThreshold },
      },
      data: { status: 'CANCELLED' },
    })

    // SCHEDULED → IN_PROGRESS when departure time reached
    const toInProgress = await prisma.trip.updateMany({
      where: {
        status: 'SCHEDULED',
        departure: { lte: now },
      },
      data: { status: 'IN_PROGRESS' },
    })

    // IN_PROGRESS → COMPLETED when arrival time reached
    const toCompleted = await prisma.trip.updateMany({
      where: {
        status: 'IN_PROGRESS',
        arrival: { lte: now },
      },
      data: { status: 'COMPLETED' },
    })

    return NextResponse.json({
      success: true,
      expiredBookings: expiredResult.count,
      tripsStarted: toInProgress.count,
      tripsCompleted: toCompleted.count,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET for monitoring / health checks
export async function GET(req: NextRequest) {
  try {
    const now = new Date()
    const expiryThreshold = new Date(now.getTime() - 30 * 60 * 1000)

    const [pendingCount, expiredCount, activeTrips, completedTrips] = await Promise.all([
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'PENDING', createdAt: { lt: expiryThreshold } } }),
      prisma.trip.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } }),
      prisma.trip.count({ where: { status: 'COMPLETED' } }),
    ])

    return NextResponse.json({
      pendingBookings: pendingCount,
      expiredBookings: expiredCount,
      activeTrips,
      completedTrips,
      nextTransitionCheck: new Date(now.getTime() + 60 * 1000).toISOString(),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}