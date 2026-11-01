import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { SEAT_HOLDING_STATUSES } from '@/lib/booking-limits'
import {
  getQuotaRouteKey,
  tripEndpoints,
  parseQuotaRouteKey,
  travelDateOf,
  routeDayKey,
} from '@/lib/route-key'

export const dynamic = 'force-dynamic'

/**
 * Route Quotas Backend API for Company Seat Quotas.
 * Quota identity: CompanyID + OriginStationID + DestinationStationID + TravelDate.
 * Direction-sensitive: od:A:B !== od:B:A.
 * Independent of intermediate stops, bus IDs, trip IDs, or departure times.
 */

type Ctx = { params: Promise<{ id: string }> }

/**
 * Dates covered by a range [from, to], inclusive.
 */
function datesInRange(from: string, to?: string | null): string[] {
  const start = new Date(`${from}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return []
  if (!to || to === from) return [from]
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(end.getTime()) || end < start) return []
  const days = Math.min(366, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

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

    // All active stations for dropdown selection
    const stations = await prisma.station.findMany({
      select: { id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    })
    const stationMap = new Map(stations.map((s) => [s.id, s]))

    // All CompanyRouteQuota records for this company
    const quotas = await prisma.companyRouteQuota.findMany({
      where: { companyId },
      orderBy: [{ travelDate: 'asc' }, { routeKey: 'asc' }],
    })

    // Calculate live seat usage across all matching trips
    const trips = await prisma.trip.findMany({
      select: {
        id: true,
        routeKey: true,
        travelDate: true,
        departure: true,
        tripStops: { select: { stationId: true, stopOrder: true } },
      },
    })

    const tripQuotaKeyMap = new Map<string, string>()
    const tripDateMap = new Map<string, string>()

    for (const t of trips) {
      const ep = tripEndpoints(t)
      const date = t.travelDate || travelDateOf(t.departure)
      if (!ep || !date) continue
      const qKey = getQuotaRouteKey(ep.originStationId, ep.destinationStationId)
      tripQuotaKeyMap.set(t.id, qKey)
      tripDateMap.set(t.id, date)
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
    const dailyUsedByDate = new Map<string, number>()

    for (const h of held) {
      const qKey = tripQuotaKeyMap.get(h.tripId)
      const date = tripDateMap.get(h.tripId)
      if (qKey && date) {
        const composite = routeDayKey(qKey, date)
        usedByRouteDay.set(composite, (usedByRouteDay.get(composite) ?? 0) + h._count._all)
      }
      if (date) {
        dailyUsedByDate.set(date, (dailyUsedByDate.get(date) ?? 0) + h._count._all)
      }
    }

    const todayDate = travelDateOf(new Date()) ?? ''
    const todayUsed = dailyUsedByDate.get(todayDate) ?? 0

    const distinctPairs = new Set<string>()

    const resolvedQuotas = quotas.map((q) => {
      const parsed = parseQuotaRouteKey(q.routeKey)
      const originStationId = q.originStationId || parsed?.originStationId || ''
      const destinationStationId = q.destinationStationId || parsed?.destinationStationId || ''

      if (originStationId && destinationStationId) {
        distinctPairs.add(`${originStationId}:${destinationStationId}`)
      }

      const canonicalRouteKey =
        originStationId && destinationStationId
          ? getQuotaRouteKey(originStationId, destinationStationId)
          : q.routeKey

      const composite = routeDayKey(canonicalRouteKey, q.travelDate)
      const used = usedByRouteDay.get(composite) ?? 0

      const origin = stationMap.get(originStationId)
      const destination = stationMap.get(destinationStationId)

      return {
        id: q.id,
        routeKey: q.routeKey,
        canonicalRouteKey,
        originStationId,
        destinationStationId,
        originName: origin?.name || originStationId,
        destinationName: destination?.name || destinationStationId,
        originCity: origin?.city || '',
        destinationCity: destination?.city || '',
        travelDate: q.travelDate,
        maxSeats: q.maxSeats,
        used,
        updatedAt: q.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({
      company,
      quotas: resolvedQuotas,
      stations,
      dailyCap: {
        limit: company.maxDailySeats ?? null,
        usedByDate: Object.fromEntries(dailyUsedByDate),
      },
      summary: {
        overallCap: company.maxDailySeats ?? null,
        distinctRoutesCount: distinctPairs.size,
        todayUsed,
      },
    })
  } catch (err) {
    logger.error('[Company Route Quotas GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

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

    const body = await req.json()
    let originStationId: string = (body.originStationId || '').trim()
    let destinationStationId: string = (body.destinationStationId || '').trim()
    const travelDate: string = (body.travelDate || '').trim()
    const dateTo: string | undefined = body.dateTo ? String(body.dateTo).trim() : undefined
    const maxSeatsRaw = body.maxSeats

    // Backward compatibility: parse routeKey if origin/dest omitted
    if ((!originStationId || !destinationStationId) && body.routeKey) {
      const parsed = parseQuotaRouteKey(String(body.routeKey))
      if (parsed) {
        originStationId = parsed.originStationId
        destinationStationId = parsed.destinationStationId
      }
    }

    if (!originStationId || !destinationStationId) {
      return NextResponse.json(
        { error: 'MISSING_STATIONS', message: 'يرجى تحديد محطة الانطلاق ومحطة الوصول' },
        { status: 400 },
      )
    }

    if (originStationId === destinationStationId) {
      return NextResponse.json(
        { error: 'ORIGIN_DESTINATION_IDENTICAL', message: 'لا يمكن أن تكون محطة الانطلاق ومحطة الوصول متطابقتين' },
        { status: 400 },
      )
    }

    // Validate station existence
    const [originStation, destStation] = await Promise.all([
      prisma.station.findUnique({ where: { id: originStationId } }),
      prisma.station.findUnique({ where: { id: destinationStationId } }),
    ])
    if (!originStation || !destStation) {
      return NextResponse.json(
        { error: 'STATION_NOT_FOUND', message: 'إحدى المحطات المحددة غير موجودة' },
        { status: 404 },
      )
    }

    if (!travelDate || !/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
      return NextResponse.json(
        { error: 'INVALID_DATE', message: 'تاريخ السفر غير صالح (yyyy-mm-dd)' },
        { status: 400 },
      )
    }

    if (dateTo && (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateTo < travelDate)) {
      return NextResponse.json(
        { error: 'INVALID_DATE_RANGE', message: 'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية' },
        { status: 400 },
      )
    }

    let limit: number | null = null
    if (maxSeatsRaw !== null && maxSeatsRaw !== undefined && maxSeatsRaw !== '') {
      const parsedCap = parseInt(String(maxSeatsRaw), 10)
      if (!Number.isFinite(parsedCap) || parsedCap < 1 || parsedCap > 500) {
        return NextResponse.json(
          {
            error: 'INVALID_SEAT_CAP',
            message: 'الحد الأقصى للمقاعد يجب أن يكون رقماً صحيحاً بين 1 و 500',
            min: 1,
            max: 500,
          },
          { status: 400 },
        )
      }
      limit = parsedCap
    }

    const dates = datesInRange(travelDate, dateTo)
    if (dates.length === 0) {
      return NextResponse.json(
        { error: 'INVALID_DATE_RANGE', message: 'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية' },
        { status: 400 },
      )
    }

    const canonicalRouteKey = getQuotaRouteKey(originStationId, destinationStationId)

    // Execute Safe Update Check & Upsert in a single Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Safe Quota Update Guard: check active bookings on all target dates
      const violatingDates: { date: string; used: number }[] = []

      for (const d of dates) {
        const startUtc = new Date(`${d}T00:00:00.000Z`)
        const windowStart = new Date(startUtc.getTime() - 24 * 3600000)
        const windowEnd = new Date(startUtc.getTime() + 48 * 3600000)

        const candidateTrips = await tx.trip.findMany({
          where: {
            OR: [
              { travelDate: d },
              { departure: { gte: windowStart, lte: windowEnd } },
            ],
          },
          select: {
            id: true,
            departure: true,
            travelDate: true,
            tripStops: { select: { stationId: true, stopOrder: true } },
          },
        })

        const matchingTripIds: string[] = []
        for (const trip of candidateTrips) {
          const tripDate = trip.travelDate || travelDateOf(trip.departure)
          if (tripDate !== d) continue
          const ep = tripEndpoints(trip)
          if (!ep) continue
          if (ep.originStationId === originStationId && ep.destinationStationId === destinationStationId) {
            matchingTripIds.push(trip.id)
          }
        }

        let activeUsed = 0
        if (matchingTripIds.length > 0) {
          activeUsed = await tx.companyBooking.count({
            where: {
              companyId,
              tripId: { in: matchingTripIds },
              status: { in: [...SEAT_HOLDING_STATUSES] },
            },
          })
        }

        if (limit !== null && activeUsed > limit) {
          violatingDates.push({ date: d, used: activeUsed })
        }
      }

      if (violatingDates.length > 0) {
        return {
          violation: true as const,
          violatingDates,
        }
      }

      // 2. Atomic Multi-Day Upsert
      const written: { travelDate: string; maxSeats: number | null }[] = []
      for (const d of dates) {
        const row = await tx.companyRouteQuota.upsert({
          where: {
            companyId_routeKey_travelDate: {
              companyId,
              routeKey: canonicalRouteKey,
              travelDate: d,
            },
          },
          create: {
            companyId,
            routeKey: canonicalRouteKey,
            travelDate: d,
            originStationId,
            destinationStationId,
            maxSeats: limit,
          },
          update: {
            originStationId,
            destinationStationId,
            maxSeats: limit,
          },
        })
        written.push({ travelDate: row.travelDate, maxSeats: row.maxSeats })
      }

      return { violation: false as const, written }
    })

    if (result.violation) {
      return NextResponse.json(
        {
          error: 'QUOTA_BELOW_USAGE',
          message: 'لا يمكن تقليل الحصة إلى أقل من المقاعد المحجوزة بالفعل',
          violatingDates: result.violatingDates,
          detail: `يوجد ${result.violatingDates.length} تاريخ/تواريخ تتجاوز فيها المقاعد المحجوزة الحد المقترح (${limit})`,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      quota: {
        routeKey: canonicalRouteKey,
        originStationId,
        destinationStationId,
        travelDate,
        maxSeats: limit,
      },
      written: result.written,
    })
  } catch (err) {
    logger.error('[Company Route Quotas PUT]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

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
    let originStationId = searchParams.get('originStationId') || ''
    let destinationStationId = searchParams.get('destinationStationId') || ''
    const routeKey = searchParams.get('routeKey') || ''
    const travelDate = searchParams.get('travelDate') || ''
    const dateTo = searchParams.get('dateTo')

    if (!originStationId && !destinationStationId && routeKey) {
      const parsed = parseQuotaRouteKey(routeKey)
      if (parsed) {
        originStationId = parsed.originStationId
        destinationStationId = parsed.destinationStationId
      }
    }

    if (!travelDate) {
      return NextResponse.json({ error: 'Missing travelDate' }, { status: 400 })
    }

    const dates = datesInRange(travelDate, dateTo)
    const canonicalKey =
      originStationId && destinationStationId
        ? getQuotaRouteKey(originStationId, destinationStationId)
        : routeKey

    const keysToDelete = Array.from(new Set([canonicalKey, routeKey].filter(Boolean)))
    if (keysToDelete.length === 0) {
      return NextResponse.json({ error: 'Missing route identification' }, { status: 400 })
    }

    const deleted = await prisma.companyRouteQuota.deleteMany({
      where: {
        companyId,
        routeKey: { in: keysToDelete },
        travelDate: { in: dates },
      },
    })

    return NextResponse.json({ ok: true, removed: deleted.count })
  } catch (err) {
    logger.error('[Company Route Quotas DELETE]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
