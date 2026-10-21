import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { SEAT_HOLDING_STATUSES } from '@/lib/booking-limits'
import { resolveRouteIdentity, routeDayKey } from '@/lib/route-key'

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
      select: { id: true, name: true, maxDailySeats: true },
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
    const dateByTrip = new Map<string, string>()
    for (const t of trips) {
      const identity = resolveRouteIdentity(t)
      if (identity.problem) continue
      bucketByTrip.set(t.id, routeDayKey(identity.routeKey, identity.travelDate))
      dateByTrip.set(t.id, identity.travelDate)
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
    // The same seats, counted per travel date. The overall daily cap is about
    // a date, not about a route, so the day has to be counted on its own.
    const dailyUsedByDate = new Map<string, number>()
    for (const h of held) {
      const key = bucketByTrip.get(h.tripId)
      if (key) {
        usedByRouteDay.set(key, (usedByRouteDay.get(key) ?? 0) + h._count._all)
      }
      const date = dateByTrip.get(h.tripId)
      if (date) {
        dailyUsedByDate.set(date, (dailyUsedByDate.get(date) ?? 0) + h._count._all)
      }
    }

    // The routes this company could be given an allowance on.
    //
    // Two sources, and the union of them:
    //
    //   1. the routes the company has actually booked on, from its own
    //      bookings and the trips they are on. These are the routes where
    //      its seats are, so these are the routes an allowance has to cover.
    //   2. the routes the buses it owns serve, so an allowance can be set
    //      before the first booking on a route.
    //
    // The first source is the one that matters. A company can book on any
    // bus, not only on its own, and in the production data no bus is
    // associated with a company at all — so a list built from the company's
    // own buses is empty, and there is no way to give the only real company
    // an allowance.
    //
    // The route is worked out from the trip's own stops, the same way the
    // booking path works it out — so the key the admin picks is the key the
    // booking will be counted against. A legacy trip, whose stored key is
    // still null, is included the same way, so its route can be given an
    // allowance before the backfill has run.
    const bookedTripIds = (
      await prisma.companyBooking.findMany({
        where: { companyId },
        select: { tripId: true },
        distinct: ['tripId'],
      })
    ).map((b) => b.tripId)

    const companyTrips = await prisma.trip.findMany({
      where: { OR: [{ id: { in: bookedTripIds } }, { bus: { companyId } }] },
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

    // The station names behind a route key, so the row can be read by a
    // person and not only by the code. The names are needed both for the
    // allowances already set and for the routes that can be chosen, so they
    // are loaded in one go.
    const stationIds = new Set<string>()
    for (const q of quotas) {
      for (const id of q.routeKey.split('|')) if (id) stationIds.add(id)
    }
    for (const t of companyTrips) {
      const identity = resolveRouteIdentity(t)
      if (identity.problem) continue
      for (const id of identity.routeKey.split('|')) if (id) stationIds.add(id)
    }
    const stations = await prisma.station.findMany({
      where: { id: { in: [...stationIds] } },
      select: { id: true, name: true },
    })
    const stationName = new Map(stations.map((s) => [s.id, s.name]))

    // Deduplicated by the full canonical route identity, so the reverse of a
    // route and a route with different intermediate stops stay apart, and the
    // same route reached from both sources is listed once.
    const routeByKey = new Map<string, RouteOption>()
    for (const t of companyTrips) {
      const identity = resolveRouteIdentity(t)
      if (identity.problem) continue
      const existing = routeByKey.get(identity.routeKey)
      if (!existing || identity.travelDate < existing.travelDate) {
        routeByKey.set(identity.routeKey, describeRoute(identity.routeKey, identity.travelDate, t, stationName))
      }
    }

    return NextResponse.json({
      company: company,
      // The overall daily cap, and what the company has used of it on each
      // date it has booked on. It is the ceiling the route allowances sit
      // inside, so it is shown next to them.
      dailyCap: {
        limit: company.maxDailySeats ?? null,
        usedByDate: dailyUsedByDate,
      },
      quotas: quotas.map((q) => ({
        id: q.id,
        maxSeats: q.maxSeats,
        used: usedByRouteDay.get(routeDayKey(q.routeKey, q.travelDate)) ?? 0,
        ...describeRoute(q.routeKey, q.travelDate, { origin: '', destination: '' }, stationName),
        updatedAt: q.updatedAt.toISOString(),
      })),
      routes: [...routeByKey.values()],
    })
  } catch (err) {
    logger.error('[Company Route Quotas GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** A route as the editor shows it. */
interface RouteOption {
  routeKey: string
  travelDate: string
  /** The origin and destination as the trip displays them. */
  origin: string
  destination: string
  /** The ordered stops, in the order the bus visits them. A null is a stop whose name is not known. */
  stops: (string | null)[]
  /** False when a stop's name is missing, so the stops cannot be shown. */
  stopsComplete: boolean
  /** A ready-made label, for anything that does not compose its own. */
  label: string
}

/**
 * Describes a route for the editor.
 *
 * Two journeys can have the same origin and the same destination and still be
 * different journeys — the same endpoints with a different stop in between, or
 * the same road run the other way. The canonical key keeps them apart; the
 * label has to as well, or the administrator cannot tell which one they are
 * choosing.
 *
 * So the stops are returned in the order the bus visits them, and the label
 * carries the intermediate ones. A name that is not known is not invented: it
 * is reported as unknown, and the label says so rather than guessing.
 *
 * The trip's own origin and destination text is used when it is there, and
 * the stop names are used when it is not — which is the case for an
 * allowance that was set on a route with no trip behind it.
 */
function describeRoute(
  routeKey: string,
  travelDate: string,
  trip: { origin: string; destination: string },
  stationName: Map<string, string>,
): RouteOption {
  const ids = routeKey.split('|').filter(Boolean)
  const stops = ids.map((id) => stationName.get(id) ?? null)
  const stopsComplete = stops.every((s) => s !== null)

  const first = stops[0] ?? ''
  const last = stops.length > 1 ? stops[stops.length - 1] : first
  const intermediates = stops.slice(1, -1)

  const from = trip.origin || first
  const to = trip.destination || last
  let label = `${from} → ${to}`
  if (!stopsComplete) {
    // A stop's name is not known. The endpoints still say which journey it
    // is, and the label says that the stops could not be read.
    label += ' (stops unknown)'
  } else if (intermediates.length > 0) {
    label += ` (via ${intermediates.join(', ')})`
  }

  return {
    routeKey,
    travelDate,
    origin: trip.origin,
    destination: trip.destination,
    stops,
    stopsComplete,
    label,
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

    const { routeKey, travelDate, maxSeats, dateTo } = await req.json()

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
          {
            error: 'INVALID_SEAT_CAP',
            // The code is what the page keys off to show a translated
            // message; this one is for anything reading the response raw.
            message: 'The seat cap must be between 1 and 500',
            min: 1,
            max: 500,
          },
          { status: 400 },
        )
      }
      limit = parsed
    }

    // A date range is a convenience, not a different model: the allowance is
    // held per route and per travel date, so a range is written as one row
    // per date in it. The enforcement is unchanged, and every row can still be
    // edited or removed on its own.
    const dates = datesInRange(travelDate, dateTo)
    if (dates.length === 0) {
      return NextResponse.json({ error: 'The date range is empty' }, { status: 400 })
    }

    const written: { travelDate: string; maxSeats: number | null }[] = []
    for (const date of dates) {
      const row = await prisma.companyRouteQuota.upsert({
        where: {
          companyId_routeKey_travelDate: { companyId, routeKey: routeKey.trim(), travelDate: date },
        },
        create: { companyId, routeKey: routeKey.trim(), travelDate: date, maxSeats: limit },
        update: { maxSeats: limit },
      })
      written.push({ travelDate: row.travelDate, maxSeats: row.maxSeats })
    }

    return NextResponse.json({
      ok: true,
      quota: {
        routeKey: routeKey.trim(),
        travelDate,
        maxSeats: limit,
      },
      written,
    })
  } catch (err) {
    logger.error('[Company Route Quotas PUT]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * The dates a range covers, inclusive.
 *
 * A range is a convenience over the per-date model, so it is written out as
 * one row per date rather than changing what a row means.
 */
function datesInRange(from: string, to?: string | null): string[] {
  const start = new Date(`${from}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return []
  if (!to) return [from]
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(end.getTime()) || end < start) return [from]
  // A range longer than a year is a mistake, not an intention.
  const days = Math.min(366, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
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
    const dateTo = searchParams.get('dateTo')
    if (!routeKey || !travelDate) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // A range removes every day in it, the same way a range is written.
    const dates = datesInRange(travelDate, dateTo)
    await prisma.companyRouteQuota.deleteMany({
      where: { companyId, routeKey, travelDate: { in: dates } },
    })
    return NextResponse.json({ ok: true, removed: dates.length })
  } catch (err) {
    logger.error('[Company Route Quotas DELETE]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
