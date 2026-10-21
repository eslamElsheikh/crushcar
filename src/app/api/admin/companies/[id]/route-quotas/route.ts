import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { SEAT_HOLDING_STATUSES } from '@/lib/booking-limits'
import { resolveRouteIdentity } from '@/lib/route-key'

export const dynamic = 'force-dynamic'

/**
 * The daily allowance for one company on one route.
 *
 * The cap is on the company, not on the bus: a company running three buses on
 * the same route on the same day shares one allowance between them. That is
 * the whole point of the bucket, so the quota is keyed by company + route +
 * travel date.
 *
 * A row with a null maxSeats means no limit for that route and day. A company
 * with no row at all also has no limit — the difference is only in where the
 * fact is written down.
 *
 * The count of used seats is made live from the bookings, so there is no
 * counter column here to drift away from reality and nothing to reconcile
 * when a booking is cancelled.
 */

/** The company whose quotas these are. */
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const companyId = id

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const quotas = await prisma.companyRouteQuota.findMany({
      where: { companyId },
      orderBy: [{ travelDate: 'asc' }, { routeKey: 'asc' }],
    })

    // The seats the company already holds on each route and day, counted
    // across every bus serving that route.
    //
    // The bucket is worked out from each trip's own stops, the same way the
    // booking path works it out, so the number shown here is the number the
    // booking is checked against. A legacy trip, whose stored key is still
    // null, is counted under the key derived from its stops rather than
    // dropped.
    const trips = await prisma.trip.findMany({
      select: {
        id: true,
        routeKey: true,
        travelDate: true,
        departure: true,
        tripStops: { select: { stationId: true, stopOrder: true } },
      },
    })
    const bucketByTrip = new Map<string, string>()
    for (const t of trips) {
      const identity = resolveRouteIdentity(t)
      if (identity.problem) continue
      bucketByTrip.set(t.id, `${identity.routeKey}|${identity.travelDate}`)
    }

    const held = await prisma.companyBooking.groupBy({
      by: ['tripId'],
      where: {
        companyId,
        status: { in: [...SEAT_HOLDING_STATUSES] },
      },
      _count: { _all: true },
    })

    const usedByRouteDay = new Map<string, number>()
    for (const h of held) {
      const key = bucketByTrip.get(h.tripId)
      if (!key) continue
      usedByRouteDay.set(key, (usedByRouteDay.get(key) ?? 0) + h._count._all)
    }

    // The station names behind a route key, so the row can be read by a
    // person and not only by the code.
    const stationIds = new Set<string>()
    for (const q of quotas) {
      for (const id of q.routeKey.split('|')) if (id) stationIds.add(id)
    }
    const stations = await prisma.station.findMany({
      where: { id: { in: [...stationIds] } },
      select: { id: true, name: true },
    })
    const stationName = new Map(stations.map((s) => [s.id, s.name]))

    // The routes this company could be given an allowance on: the routes its
    // own buses run. The earliest day each route runs is offered as the date
    // to start from, so the admin does not have to know the calendar.
    //
    // The route is worked out from the trip's own stops, the same way the
    // booking path works it out — so the key the admin picks is the key the
    // booking will be counted against. A legacy trip, whose stored key is
    // still null, is included the same way, so its route can be given an
    // allowance before the backfill has run.
    const companyTrips = await prisma.trip.findMany({
      where: { bus: { companyId } },
      select: {
        routeKey: true,
        travelDate: true,
        origin: true,
        destination: true,
        departure: true,
        tripStops: { select: { stationId: true, stopOrder: true } },
      },
      orderBy: { departure: 'asc' },
    })
    const routeByKey = new Map<string, { routeKey: string; travelDate: string; label: string }>()
    for (const t of companyTrips) {
      const identity = resolveRouteIdentity(t)
      if (identity.problem) continue
      const existing = routeByKey.get(identity.routeKey)
      if (!existing || identity.travelDate < existing.travelDate) {
        routeByKey.set(identity.routeKey, {
          routeKey: identity.routeKey,
          travelDate: identity.travelDate,
          label: `${t.origin} → ${t.destination}`,
        })
      }
    }

    return NextResponse.json({
      company: company,
      quotas: quotas.map((q) => ({
        id: q.id,
        routeKey: q.routeKey,
        travelDate: q.travelDate,
        maxSeats: q.maxSeats,
        used: usedByRouteDay.get(`${q.routeKey}|${q.travelDate}`) ?? 0,
        routeName: q.routeKey
          .split('|')
          .map((id) => stationName.get(id) || id)
          .join(' → '),
        updatedAt: q.updatedAt.toISOString(),
      })),
      routes: [...routeByKey.values()],
    })
  } catch (err) {
    logger.error('[Company Route Quotas GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * Sets one daily allowance.
 *
 * The route and the day are the identity of the allowance, so setting it
 * twice replaces it rather than adding to it.
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const companyId = id

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const { routeKey, travelDate, maxSeats } = await req.json()

    if (typeof routeKey !== 'string' || !routeKey.trim()) {
      return NextResponse.json({ error: 'A route is required' }, { status: 400 })
    }
    if (typeof travelDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
      return NextResponse.json({ error: 'A travel date of yyyy-mm-dd is required' }, { status: 400 })
    }

    let limit: number | null = null
    if (maxSeats !== null && maxSeats !== undefined && maxSeats !== ('' as any)) {
      const parsed = parseInt(String(maxSeats), 10)
      // The bound matches the per-trip quota's. A cap this high is not a
      // grant — the ten-seat per-booking rule still applies underneath it —
      // it just stops a typo from silently turning a cap into no cap at all.
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
        return NextResponse.json(
          { error: 'The seat cap must be between 1 and 500' },
          { status: 400 },
        )
      }
      limit = parsed
    }

    const row = await prisma.companyRouteQuota.upsert({
      where: {
        companyId_routeKey_travelDate: { companyId, routeKey: routeKey.trim(), travelDate },
      },
      create: { companyId, routeKey: routeKey.trim(), travelDate, maxSeats: limit },
      update: { maxSeats: limit },
    })

    return NextResponse.json({
      ok: true,
      quota: {
        id: row.id,
        routeKey: row.routeKey,
        travelDate: row.travelDate,
        maxSeats: row.maxSeats,
      },
    })
  } catch (err) {
    logger.error('[Company Route Quotas PUT]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * Removes one daily allowance, putting that route and day back to no limit.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const companyId = id

    const { searchParams } = new URL(req.url)
    const routeKey = searchParams.get('routeKey') || ''
    const travelDate = searchParams.get('travelDate') || ''
    if (!routeKey || !travelDate) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    await prisma.companyRouteQuota.deleteMany({ where: { companyId, routeKey, travelDate } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('[Company Route Quotas DELETE]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
