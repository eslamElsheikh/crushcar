import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { neutralizeCsvCell } from '@/lib/csv'
import {
  BUSINESS_TZ,
  CUSTOMER_FUNDED,
  REVENUE_STATUS_FILTER,
  businessMonth,
  getRevenueBreakdown,
  round2,
  tripCompanyScope,
} from '@/lib/analytics'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format')

    const companyId =
      session.user.role === 'SUPER_ADMIN' ? null : session.user.companyId ?? null
    const customerScope = tripCompanyScope(companyId)
    const companyScope = companyId ? { companyId } : {}

    const [revenueByRoute, companyRevenueByRoute, totals, activeTrips, recentTrips] = await Promise.all([
      prisma.booking.groupBy({
        by: ['tripId'],
        // Platform-funded seats are not revenue and not a customer's payment,
        // so they are left out of the revenue a route is reported to have made.
        where: { ...customerScope, ...CUSTOMER_FUNDED, status: REVENUE_STATUS_FILTER },
        _sum: { total: true },
      }),
      prisma.companyBooking.groupBy({
        by: ['tripId'],
        where: { ...companyScope, status: REVENUE_STATUS_FILTER },
        _sum: { total: true },
      }),
      getRevenueBreakdown(prisma, { companyId }),
      prisma.trip.count({ where: { ...(companyId ? { bus: { companyId } } : {}), departure: { gte: new Date() } } }),
      prisma.trip.findMany({
        where: { ...(companyId ? { bus: { companyId } } : {}), departure: { gte: new Date() } },
        select: { id: true },
      }),
    ])

    const revenueByTripId = new Map<string, number>()
    for (const row of revenueByRoute) {
      revenueByTripId.set(row.tripId, (revenueByTripId.get(row.tripId) ?? 0) + (row._sum.total ?? 0))
    }
    for (const row of companyRevenueByRoute) {
      revenueByTripId.set(row.tripId, (revenueByTripId.get(row.tripId) ?? 0) + (row._sum.total ?? 0))
    }

    // Every trip in scope, not just the ones that happened to take money.
    const trips = await prisma.trip.findMany({
      where: { ...(companyId ? { bus: { companyId } } : {}) },
      include: {
        bus: { include: { layout: { include: { seats: { select: { id: true } } } } } },
        bookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } }, select: { id: true } },
        companyBookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } }, select: { id: true } },
      },
    })

    const routeData = trips.map((trip) => {
      const totalSeats = trip.bus.layout?.seats.length || trip.bus.seatCount
      const bookedSeats = trip.bookings.length + trip.companyBookings.length
      const occupancy = totalSeats > 0 ? Math.round((bookedSeats / totalSeats) * 100) : 0

      return {
        tripId: trip.id,
        origin: trip.origin,
        destination: trip.destination,
        departure: trip.departure.toISOString(),
        status: trip.status,
        revenue: round2(revenueByTripId.get(trip.id) ?? 0),
        bookedSeats,
        totalSeats,
        occupancy,
      }
    })

    const monthlyRows = await Promise.all([
      prisma.booking.findMany({
        where: { ...customerScope, ...CUSTOMER_FUNDED, status: REVENUE_STATUS_FILTER },
        select: { createdAt: true, total: true },
      }),
      prisma.companyBooking.findMany({
        where: { ...companyScope, status: REVENUE_STATUS_FILTER },
        select: { createdAt: true, total: true },
      }),
    ])

    const monthlyMap = new Map<string, number>()
    for (const row of [...monthlyRows[0], ...monthlyRows[1]]) {
      const month = businessMonth(row.createdAt)
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + (row.total ?? 0))
    }
    const monthlyData = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, revenue]) => ({ month, revenue: round2(revenue) }))

    const [topCustomerRows, topCompanyRows, totalBookingsCount, companyBookingsCount, cancelledBookings, cancelledCompanyBookings] =
      await Promise.all([
        prisma.booking.groupBy({
          by: ['userId'],
          // A platform-funded booking has the super admin as its user, and
          // without this filter the admin would be reported as a top customer
          // for money the platform spent on itself.
          where: { ...customerScope, ...CUSTOMER_FUNDED, status: REVENUE_STATUS_FILTER },
          _sum: { total: true },
          orderBy: { _sum: { total: 'desc' } },
          take: 10,
        }),
        prisma.companyBooking.groupBy({
          by: ['companyId'],
          where: { ...companyScope, status: REVENUE_STATUS_FILTER },
          _sum: { total: true },
          orderBy: { _sum: { total: 'desc' } },
          take: 10,
        }),
        prisma.booking.count({ where: customerScope }),
        prisma.companyBooking.count({ where: companyScope }),
        prisma.booking.count({ where: { ...customerScope, status: 'CANCELLED' } }),
        prisma.companyBooking.count({ where: { ...companyScope, status: 'CANCELLED' } }),
      ])

    const users = await prisma.user.findMany({
      where: { id: { in: topCustomerRows.map((r) => r.userId) } },
      select: { id: true, name: true, email: true },
    })
    const companies = await prisma.company.findMany({
      where: { id: { in: topCompanyRows.map((r) => r.companyId) } },
      select: { id: true, name: true },
    })

    const topCustomersData = [
      ...topCustomerRows.map((row) => {
        const user = users.find((u) => u.id === row.userId)
        return {
          key: `u:${row.userId}`,
          name: user?.name || 'Unknown',
          email: user?.email || '',
          totalRevenue: round2(row._sum.total ?? 0),
        }
      }),
      ...topCompanyRows.map((row) => {
        const company = companies.find((c) => c.id === row.companyId)
        return {
          key: `c:${row.companyId}`,
          name: company?.name || 'Unknown',
          email: '',
          totalRevenue: round2(row._sum.total ?? 0),
        }
      }),
    ]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)

    const totalBookings = totalBookingsCount + companyBookingsCount
    const cancelledBookingsTotal = cancelledBookings + cancelledCompanyBookings

    if (format === 'csv') {
      const rows = [
        [
          'Route',
          'Origin',
          'Destination',
          'Departure',
          'Status',
          'Revenue',
          'Booked Seats',
          'Total Seats',
          'Occupancy (%)',
        ],
        ...routeData.map((r) => [
          `${r.origin} → ${r.destination}`,
          r.origin,
          r.destination,
          new Date(r.departure).toLocaleString('en-EG', { timeZone: BUSINESS_TZ }),
          r.status,
          r.revenue,
          r.bookedSeats,
          r.totalSeats,
          r.occupancy,
        ]),
      ]
      // Every cell is neutralised before it is quoted: the quotes are consumed
      // by the parser, so an =… inside them is still a formula afterwards.
      // Origin and destination are admin-entered text, which is enough to make
      // this the same problem as a passenger name — see src/lib/csv.ts.
      const csv = rows
        .map((row) =>
          row
            .map((cell) => `"${neutralizeCsvCell(cell).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="safrotravel-reports-${businessMonth(new Date())}.csv"`,
        },
      })
    }

    return NextResponse.json({
      routeData,
      monthlyData,
      topCustomers: topCustomersData,
      summary: {
        totalBookings,
        cancelledBookings: cancelledBookingsTotal,
        totalRoutes: routeData.length,
        activeTrips,
        upcomingTrips: recentTrips.length,
        revenue: totals,
      },
    })
  } catch (err) {
    console.error('[reports]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}