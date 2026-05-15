import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format')

    const companyId = session.user.role === 'SUPER_ADMIN'
      ? undefined
      : session.user.companyId

    const where = companyId ? { trip: { bus: { companyId } } } : {}

    // Revenue by route
    const revenueByRoute = await prisma.booking.groupBy({
      by: ['tripId'],
      where: { status: 'PAID', ...where },
      _sum: { total: true },
    })

    const trips = await prisma.trip.findMany({
      where: { id: { in: revenueByRoute.map(r => r.tripId) }, ...(companyId ? { bus: { companyId } } : {}) },
      include: {
        bus: { include: { layout: true } },
        bookings: { where: { status: { in: ['PENDING', 'PAID', 'BOARDED'] } } },
      },
    })

    const routeData = trips.map(trip => {
      const revenue = revenueByRoute.find(r => r.tripId === trip.id)?._sum.total || 0
      const layout = trip.bus.layout as any
      const totalSeats = layout?.seats?.length || trip.bus.seatCount
      const bookedSeats = trip.bookings.length
      const occupancy = totalSeats > 0 ? Math.round((bookedSeats / totalSeats) * 100) : 0

      return {
        tripId: trip.id,
        origin: trip.origin,
        destination: trip.destination,
        departure: trip.departure.toISOString(),
        status: trip.status,
        revenue: Math.round(revenue * 100) / 100,
        bookedSeats,
        totalSeats,
        occupancy,
      }
    })

    // Revenue by month
    const bookingsByMonth = await prisma.booking.groupBy({
      by: ['createdAt'],
      where: { status: 'PAID', ...where },
      _sum: { total: true },
    })

    const monthlyMap = new Map<string, number>()
    for (const entry of bookingsByMonth) {
      const month = `${entry.createdAt.getFullYear()}-${String(entry.createdAt.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + (entry._sum.total || 0))
    }

    const monthlyData = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, revenue]) => ({ month, revenue: Math.round(revenue * 100) / 100 }))

    // Top customers by revenue
    const topCustomers = await prisma.booking.groupBy({
      by: ['userId'],
      where: { status: 'PAID', ...where },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    })

    const customerIds = topCustomers.map(c => c.userId)
    const customers = await prisma.user.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, email: true },
    })

    const topCustomersData = topCustomers.map(tc => {
      const customer = customers.find(c => c.id === tc.userId)
      return {
        userId: tc.userId,
        name: customer?.name || 'Unknown',
        email: customer?.email || '',
        totalRevenue: Math.round((tc._sum.total || 0) * 100) / 100,
      }
    })

    // Summary stats
    const totalBookings = await prisma.booking.count({ where: { ...where } })
    const cancelledBookings = await prisma.booking.count({ where: { status: 'CANCELLED', ...where } })

    // CSV export
    if (format === 'csv') {
      const rows = [
        ['Route', 'Origin', 'Destination', 'Departure', 'Status', 'Revenue (EGP)', 'Booked Seats', 'Total Seats', 'Occupancy (%)'],
        ...routeData.map(r => [
          `${r.origin} → ${r.destination}`,
          r.origin,
          r.destination,
          new Date(r.departure).toLocaleDateString('en-EG'),
          r.status,
          r.revenue,
          r.bookedSeats,
          r.totalSeats,
          r.occupancy,
        ]),
      ]
      const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="crushcar-reports-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    return NextResponse.json({
      routeData,
      monthlyData,
      topCustomers: topCustomersData,
      summary: { totalBookings, cancelledBookings },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}