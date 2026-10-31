import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getClientIp } from '@/lib/clientIp'
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * Normalizes an Egyptian phone number across common variants:
 * - Arabic-Indic numerals (٠-٩)
 * - Leading international codes (+20, 0020, 20)
 * - Punctuation, dashes, spaces
 * - Missing leading zero (10xxxxxxxx -> 010xxxxxxxx)
 */
export function normalizeEgyptianPhone(input: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  let cleaned = input.trim()
  for (let i = 0; i < 10; i++) {
    cleaned = cleaned.replaceAll(arabicDigits[i], String(i))
  }
  cleaned = cleaned.replace(/[\s\-\(\)\.]/g, '')

  if (cleaned.startsWith('+20')) cleaned = cleaned.slice(3)
  else if (cleaned.startsWith('0020')) cleaned = cleaned.slice(4)
  else if (cleaned.startsWith('20') && cleaned.length > 10) cleaned = cleaned.slice(2)

  if (cleaned.length === 10 && cleaned.startsWith('1')) {
    cleaned = '0' + cleaned
  }
  return cleaned
}

export function maskPhone(phone: string): string {
  const norm = normalizeEgyptianPhone(phone)
  if (norm.length >= 7) {
    return `${norm.slice(0, 3)}****${norm.slice(-4)}`
  }
  return '***'
}

/**
 * Boarding verification by phone lookup.
 *
 * Rules:
 * - Staff only (SUPER_ADMIN sees all; COMPANY_ADMIN sees only their own company's bookings).
 * - Anonymous / CUSTOMER denied (401 / 403).
 * - Minimal fields returned: passenger name, route, date/time, seat, status, reference, masked phone.
 * - Zero payment fields returned.
 * - Rate limited per user and IP.
 * - Audited per lookup.
 * - Categorized: upcoming / today first, older separated.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = session.user.role
    if (role !== 'SUPER_ADMIN' && role !== 'COMPANY_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ip = getClientIp(req)
    const rl = rateLimit(`verify-phone:${session.user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: 'تم تجاوز عدد الاستعلامات المسموح به. يرجى المحاولة بعد دقيقة' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      )
    }

    const { searchParams } = new URL(req.url)
    const phoneQuery = searchParams.get('phone') || searchParams.get('q') || ''
    if (!phoneQuery.trim()) {
      return NextResponse.json({ error: 'PHONE_REQUIRED', message: 'يرجى إدخال رقم الهاتف' }, { status: 400 })
    }

    const norm = normalizeEgyptianPhone(phoneQuery)
    const variants = Array.from(new Set([
      norm,
      `+20${norm.startsWith('0') ? norm.slice(1) : norm}`,
      `0020${norm.startsWith('0') ? norm.slice(1) : norm}`,
      norm.startsWith('0') ? norm.slice(1) : norm,
      phoneQuery.trim(),
    ])).filter(Boolean)

    let customerBookings: any[] = []
    let companyBookings: any[] = []

    if (role === 'SUPER_ADMIN') {
      // Super admin searches customer bookings and all company bookings
      customerBookings = await prisma.booking.findMany({
        where: {
          OR: [
            { passengerPhone: { in: variants } },
            { user: { phone: { in: variants } } },
          ],
        },
        select: {
          id: true,
          reference: true,
          passengerName: true,
          passengerPhone: true,
          seatLabel: true,
          status: true,
          boarded: true,
          boardedAt: true,
          trip: {
            select: {
              origin: true,
              destination: true,
              departure: true,
            },
          },
        },
      })

      companyBookings = await prisma.companyBooking.findMany({
        where: {
          OR: [
            { passengerPhone: { in: variants } },
            { customer: { phone: { in: variants } } },
          ],
        },
        select: {
          id: true,
          reference: true,
          passengerName: true,
          passengerPhone: true,
          seatLabel: true,
          status: true,
          boardedAt: true,
          companyId: true,
          trip: {
            select: {
              origin: true,
              destination: true,
              departure: true,
            },
          },
        },
      })
    } else if (role === 'COMPANY_ADMIN') {
      const companyId = session.user.companyId
      if (!companyId) {
        return NextResponse.json({ error: 'Forbidden', message: 'لا توجد شركة مرتبطة بهذا الحساب' }, { status: 403 })
      }

      // Company admin searches ONLY their company's bookings
      companyBookings = await prisma.companyBooking.findMany({
        where: {
          companyId,
          OR: [
            { passengerPhone: { in: variants } },
            { customer: { phone: { in: variants } } },
          ],
        },
        select: {
          id: true,
          reference: true,
          passengerName: true,
          passengerPhone: true,
          seatLabel: true,
          status: true,
          boardedAt: true,
          companyId: true,
          trip: {
            select: {
              origin: true,
              destination: true,
              departure: true,
            },
          },
        },
      })
    }

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const formattedCustomer = customerBookings.map((b) => ({
      id: b.id,
      reference: b.reference,
      type: 'customer' as const,
      passengerName: b.passengerName,
      maskedPhone: maskPhone(b.passengerPhone || ''),
      seatLabel: b.seatLabel,
      status: b.status,
      boarded: b.status === 'BOARDED' || !!b.boarded || !!b.boardedAt,
      boardedAt: b.boardedAt?.toISOString() || null,
      route: {
        origin: b.trip.origin,
        destination: b.trip.destination,
        departure: b.trip.departure.toISOString(),
      },
      isUpcoming: new Date(b.trip.departure).getTime() >= startOfToday.getTime(),
    }))

    const formattedCompany = companyBookings.map((b) => ({
      id: b.id,
      reference: b.reference,
      type: 'company' as const,
      passengerName: b.passengerName,
      maskedPhone: maskPhone(b.passengerPhone || ''),
      seatLabel: b.seatLabel,
      status: b.status,
      boarded: b.status === 'BOARDED' || !!b.boardedAt,
      boardedAt: b.boardedAt?.toISOString() || null,
      route: {
        origin: b.trip.origin,
        destination: b.trip.destination,
        departure: b.trip.departure.toISOString(),
      },
      isUpcoming: new Date(b.trip.departure).getTime() >= startOfToday.getTime(),
    }))

    const all = [...formattedCustomer, ...formattedCompany]

    const upcoming = all
      .filter((b) => b.isUpcoming)
      .sort((a, b) => new Date(a.route.departure).getTime() - new Date(b.route.departure).getTime())

    const older = all
      .filter((b) => !b.isUpcoming)
      .sort((a, b) => new Date(b.route.departure).getTime() - new Date(a.route.departure).getTime())

    // Audit the lookup
    await audit({
      action: 'LOOKUP' as any,
      entity: 'Booking',
      session,
      metadata: {
        phoneQuery: maskPhone(phoneQuery),
        resultsCount: all.length,
      },
      ip,
    })

    return NextResponse.json(
      {
        total: all.length,
        upcoming,
        older,
      },
      { headers: getRateLimitHeaders(rl) }
    )
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error', message: err?.message }, { status: 500 })
  }
}
