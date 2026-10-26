import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  activeTripWhere,
  getRevenueBreakdown,
  getRevenueByDay,
  rangeStart,
  tripCompanyScope,
} from '@/lib/analytics'
import { applyRateLimitHeaders, checkRateLimit } from '@/lib/rateLimitHttp'
import { requireTurnstile } from '@/lib/turnstile'

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

export async function GET(req: NextRequest) {
  // "Tracking" in the abuse sense: the dashboard's range picker re-hits this
  // on every click, so the ceiling is set well above any real analyst and
  // still far below a scraper walking ranges.
  const rl = checkRateLimit(req, 'tracking-analytics', 150, 60_000)
  if (rl.blocked) return rl.blocked
  const captcha = await requireTurnstile(req)
  if (captcha) return captcha
  try {
    const session = await auth()
    if (!session?.user) {
      return applyRateLimitHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), rl.headers)
    }
    if (session.user.role === 'CUSTOMER') {
      return applyRateLimitHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), rl.headers)
    }

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') || '30d'
    const days = RANGE_DAYS[range] ?? RANGE_DAYS['30d']
    const startDate = rangeStart(days)
    const now = new Date()

    const companyId =
      session.user.role === 'SUPER_ADMIN'
        ? searchParams.get('companyId') || undefined
        : session.user.companyId ?? undefined

    const baseWhere = tripCompanyScope(companyId)
    const companyFilter = companyId ? { companyId } : {}

    const [totals, revenueByDay, activeTrips, recentBookings, recentCompanyBookings, cancellations] =
      await Promise.all([
        getRevenueBreakdown(prisma, { companyId, since: startDate }),
        getRevenueByDay(prisma, { companyId, since: startDate }),
        prisma.trip.count({ where: activeTripWhere(companyId, now) }),
        prisma.booking.findMany({
          where: baseWhere,
          include: {
            trip: { include: { bus: true } },
            user: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        prisma.companyBooking.findMany({
          where: companyFilter,
          include: {
            trip: { include: { bus: true } },
            company: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 2,
        }),
        Promise.all([
          prisma.booking.count({
            where: { status: 'CANCELLED', refundProcessedAt: null, refundAmount: { not: null }, ...baseWhere },
          }),
          prisma.companyBooking.count({
            where: { status: 'CANCELLED', refundProcessedAt: null, refundAmount: { not: null }, ...companyFilter },
          }),
        ]),
      ])

    const [customerPending, companyPending] = cancellations

    const payload = {
      range,
      since: startDate.toISOString(),
      totalBookings: totals.bookings.total,
      totalRevenue: totals.total,
      revenue: totals,
      activeTrips,
      chartData: revenueByDay,
      cancellations: {
        customerPending,
        companyPending,
        pendingTotal: customerPending + companyPending,
      },
      recentBookings: [
        ...recentBookings.map((b) => ({
          id: b.id,
          _type: 'customer',
          status: b.status,
          total: b.total,
          seatLabel: b.seatLabel,
          passengerName: b.passengerName,
          createdAt: b.createdAt.toISOString(),
          paidAt: b.paidAt ? b.paidAt.toISOString() : null,
          user: b.user,
          company: null,
          trip: b.trip,
        })),
        ...recentCompanyBookings.map((b) => ({
          id: b.id,
          _type: 'company',
          status: b.status,
          total: b.total,
          seatLabel: b.seatLabel,
          passengerName: b.passengerName,
          createdAt: b.createdAt.toISOString(),
          paidAt: b.paidAt ? b.paidAt.toISOString() : null,
          user: null,
          company: b.company,
          trip: b.trip,
        })),
      ]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 8),
    }

    return applyRateLimitHeaders(NextResponse.json(payload), rl.headers)
  } catch (err) {
    console.error('[analytics]', err instanceof Error ? err.message : err)
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Server error' }, { status: 500 }),
      rl.headers
    )
  }
}