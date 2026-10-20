import type { Prisma, PrismaClient } from '@prisma/client'

export const BUSINESS_TZ = 'Africa/Cairo'

export const PAID_BOOKING_STATUSES = ['PAID', 'BOARDED'] as const

export type PaidBookingStatus = (typeof PAID_BOOKING_STATUSES)[number]

export type Db = PrismaClient | Prisma.TransactionClient

const REVENUE_STATUS_FILTER = { in: [...PAID_BOOKING_STATUSES] }

export { REVENUE_STATUS_FILTER }

/**
 * Who paid for a booking.
 *
 * 'CUSTOMER' is the default and covers every booking a customer made by
 * transfer. 'PLATFORM' is a seat the platform covered from its own wallet —
 * money it spent, not money it collected, so it is not customer revenue and
 * not a company collection.
 */
export const BOOKING_FUNDING_SOURCES = ['CUSTOMER', 'PLATFORM'] as const

/** Bookings that a customer paid for. */
export const CUSTOMER_FUNDED = { fundingSource: 'CUSTOMER' } as const

/** Bookings the platform paid for from its own wallet. */
export const PLATFORM_FUNDED = { fundingSource: 'PLATFORM' } as const

/** Start of the day N days ago, in business time (Africa/Cairo). */
export function rangeStart(days: number, now = new Date()): Date {
  const d = Number(businessDay(now).slice(8, 10))
  const start = new Date(now)
  start.setUTCDate(d - days)
  start.setUTCHours(0, 0, 0, 0)
  return start
}

/** "YYYY-MM-DD" for a Date, in business time. */
export function businessDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** "YYYY-MM" for a Date, in business time. */
export function businessMonth(date: Date): string {
  return businessDay(date).slice(0, 7)
}

/** Every "YYYY-MM-DD" from start to today inclusive. */
export function businessDayRange(days: number, now = new Date()): string[] {
  const out: string[] = []
  const cursor = new Date(rangeStart(days, now))
  const today = businessDay(now)
  while (businessDay(cursor) <= today && out.length <= days + 2) {
    out.push(businessDay(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

export function tripCompanyScope(companyId?: string | null): Prisma.BookingWhereInput {
  return companyId ? { trip: { bus: { companyId } } } : {}
}

export type RevenueBreakdown = {
  customer: number
  company: number
  charter: number
  total: number
}

export type DashboardTotals = RevenueBreakdown & {
  bookings: {
    customer: number
    company: number
    platform: number
    total: number
  }
  /**
   * Seats the platform covered from its own wallet and has not given back.
   *
   * This is money the platform owes for seats it provided, not money it
   * collected, so it is deliberately outside `total`. A company-funded booking
   * — including one a super admin made on the company's behalf — is never
   * counted here: those are company collections, and they belong in the
   * company bucket.
   */
  platformUnsettledEntitlements: number
}

/**
 * Revenue + booking counts for the dashboard, scoped to one company or the whole
 * platform. Counts customer bookings AND company bookings AND confirmed charter
 * bookings, and treats BOARDED as paid (boarding does not refund money).
 *
 * Customer revenue counts only bookings a customer actually paid for. A seat
 * the platform covered from its own wallet is money the platform spent, so it
 * is reported on its own line rather than inflating what was collected.
 */
export async function getRevenueBreakdown(
  db: Db,
  opts: { companyId?: string | null; since?: Date },
): Promise<DashboardTotals> {
  const companyId = opts.companyId ?? null
  const since = opts.since
  const customerScope = tripCompanyScope(companyId)

  const createdInRange = (extra: Record<string, unknown> = {}) =>
    since ? { ...extra, createdAt: { gte: since } } : extra

  const [
    customerRevenue,
    companyRevenue,
    charterRevenue,
    customerCount,
    companyCount,
    platformCount,
    platformUnsettled,
  ] =
    await Promise.all([
      db.booking.aggregate({
        where: createdInRange({ ...customerScope, ...CUSTOMER_FUNDED, status: REVENUE_STATUS_FILTER }),
        _sum: { total: true },
      }),
      db.companyBooking.aggregate({
        where: createdInRange({
          ...(companyId ? { companyId } : {}),
          status: REVENUE_STATUS_FILTER,
        }),
        _sum: { total: true },
      }),
      db.charterBooking.aggregate({
        where: createdInRange({ ...(companyId ? { companyId } : {}), status: 'confirmed' }),
        _sum: { price: true },
      }),
      db.booking.count({ where: createdInRange({ ...customerScope, ...CUSTOMER_FUNDED }) }),
      db.companyBooking.count({ where: createdInRange(companyId ? { companyId } : {}) }),
      db.booking.count({ where: createdInRange({ ...customerScope, ...PLATFORM_FUNDED }) }),
      db.booking.aggregate({
        where: createdInRange({ ...customerScope, ...PLATFORM_FUNDED, status: REVENUE_STATUS_FILTER }),
        _sum: { total: true },
      }),
    ])


  const customer = customerRevenue._sum.total ?? 0
  const company = companyRevenue._sum.total ?? 0
  // The charter aggregate sums `price`, not `total`. Reading `_sum.total` here
  // meant charter revenue was undefined and always reported as zero.
  const charter = charterRevenue._sum.price ?? 0

  return {
    customer,
    company,
    charter,
    // The platform's own spending is not revenue, so it is not in the total.
    total: customer + company + charter,
    bookings: {
      customer: customerCount,
      company: companyCount,
      platform: platformCount,
      total: customerCount + companyCount + platformCount,
    },
    platformUnsettledEntitlements: platformUnsettled._sum.total ?? 0,
  }
}

/**
 * Revenue per calendar day in business time, zero-filled so charts never
 * collapse gaps into a straight line.
 */
export async function getRevenueByDay(
  db: Db,
  opts: { companyId?: string | null; since: Date },
): Promise<{ day: string; revenue: number }[]> {
  const companyId = opts.companyId ?? null
  const customerScope = tripCompanyScope(companyId)
  const inRange = { gte: opts.since }

  const [customerRows, companyRows, charterRows] = await Promise.all([
    db.booking.findMany({
      where: { ...customerScope, ...CUSTOMER_FUNDED, status: REVENUE_STATUS_FILTER, createdAt: inRange },
      select: { createdAt: true, total: true },
    }),
    db.companyBooking.findMany({
      where: { ...(companyId ? { companyId } : {}), status: REVENUE_STATUS_FILTER, createdAt: inRange },
      select: { createdAt: true, total: true },
    }),
    db.charterBooking.findMany({
      where: { ...(companyId ? { companyId } : {}), status: 'confirmed', createdAt: inRange },
      select: { createdAt: true, price: true },
    }),
  ])

  const byDay = new Map<string, number>()
  const add = (createdAt: Date, amount: number | null) => {
    const day = businessDay(createdAt)
    byDay.set(day, (byDay.get(day) ?? 0) + (amount ?? 0))
  }
  for (const row of customerRows) add(row.createdAt, row.total)
  for (const row of companyRows) add(row.createdAt, row.total)
  for (const row of charterRows) add(row.createdAt, row.price)

  const days = businessDayRange(daysBetween(opts.since, new Date()))
  return days.map((day) => ({ day, revenue: round2(byDay.get(day) ?? 0) }))
}

/** Trips that can still be boarded: scheduled and not yet departed. */
export function activeTripWhere(companyId?: string | null, now = new Date()): Prisma.TripWhereInput {
  return {
    status: 'SCHEDULED',
    departure: { gte: now },
    ...(companyId ? { bus: { companyId } } : {}),
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000))
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}