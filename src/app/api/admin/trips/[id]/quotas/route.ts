import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * How many seats each company may hold on one trip.
 *
 * A company with no row here has no limit on that trip. A row with a null
 * maxSeats also means no limit; the difference is only in where the fact is
 * written down.
 *
 * The count itself is made live from the bookings, so there is no counter
 * column here to drift away from reality and no reconciliation to run when a
 * booking is cancelled.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const tripId = id

    const [quotas, companies, held] = await Promise.all([
      prisma.companyTripQuota.findMany({ where: { tripId }, orderBy: { company: { name: 'asc' } } }),
      prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.companyBooking.groupBy({
        by: ['companyId'],
        where: { tripId, status: { in: ['PENDING', 'PAID', 'BOARDED'] } },
        _count: { _all: true },
      }),
    ])

    const heldByCompany = new Map(held.map((h) => [h.companyId, h._count._all]))

    return NextResponse.json({
      quotas: quotas.map((q) => ({
        companyId: q.companyId,
        companyName: companies.find((c) => c.id === q.companyId)?.name || q.companyId,
        maxSeats: q.maxSeats,
        held: heldByCompany.get(q.companyId) ?? 0,
      })),
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        maxSeats: quotas.find((q) => q.companyId === c.id)?.maxSeats ?? null,
        held: heldByCompany.get(c.id) ?? 0,
      })),
    })
  } catch (err) {
    logger.error('[Trip Quotas GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * Sets the quotas for a trip.
 *
 * The whole set is replaced, so a company removed from the list loses its
 * limit. A company listed with a null maxSeats has no limit, which is the
 * same as not being listed.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const tripId = id

    const body = await req.json()
    const quotas: { companyId: string; maxSeats: number | null }[] = Array.isArray(body?.quotas)
      ? body.quotas
      : []

    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    // Validate before writing anything, so a bad value cannot leave the list
    // half applied.
    const cleaned: { companyId: string; maxSeats: number | null }[] = []
    for (const q of quotas) {
      if (!q?.companyId) continue
      const company = await prisma.company.findUnique({
        where: { id: q.companyId },
        select: { id: true },
      })
      if (!company) continue
      let maxSeats: number | null = null
      if (q.maxSeats !== null && q.maxSeats !== undefined && q.maxSeats !== ('' as any)) {
        const parsed = parseInt(String(q.maxSeats), 10)
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
          return NextResponse.json(
            { error: 'Seat cap must be between 1 and 500' },
            { status: 400 },
          )
        }
        maxSeats = parsed
      }
      cleaned.push({ companyId: q.companyId, maxSeats })
    }

    await prisma.$transaction(async (tx) => {
      // Everything not in the new set loses its limit.
      await tx.companyTripQuota.deleteMany({
        where: { tripId, companyId: { notIn: cleaned.map((q) => q.companyId) } },
      })
      for (const q of cleaned) {
        await tx.companyTripQuota.upsert({
          where: { companyId_tripId: { companyId: q.companyId, tripId } },
          create: { companyId: q.companyId, tripId, maxSeats: q.maxSeats },
          update: { maxSeats: q.maxSeats },
        })
      }
    })

    const saved = await prisma.companyTripQuota.findMany({ where: { tripId } })
    return NextResponse.json({ ok: true, quotas: saved })
  } catch (err) {
    logger.error('[Trip Quotas PUT]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
