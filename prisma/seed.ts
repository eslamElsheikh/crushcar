import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Delete in dependency order: bookings → trips → buses → users → companies
  // (cascade handles seats/layouts automatically via schema relations)
  await prisma.booking.deleteMany()
  await prisma.trip.deleteMany()
  await prisma.busLayout.deleteMany()
  await prisma.bus.deleteMany()
  await prisma.user.deleteMany()
  await prisma.company.deleteMany()

  // Create company
  const company = await prisma.company.create({
    data: {
      name: 'Cairo Express',
      subdomain: 'cairoexpress',
      plan: 'PRO',
    },
  })

  // Create users
  const adminPassword = await bcrypt.hash('admin123', 12)
  const userPassword = await bcrypt.hash('user123', 12)

  const admin = await prisma.user.create({
    data: {
      email: 'admin@cairoexpress.com',
      password: adminPassword,
      name: 'Ahmed Admin',
      role: 'COMPANY_ADMIN',
      companyId: company.id,
    },
  })

  const customer1 = await prisma.user.create({
    data: {
      email: 'user@example.com',
      password: userPassword,
      name: 'Mohamed Customer',
      phone: '01012345678',
      role: 'CUSTOMER',
    },
  })

  const customer2 = await prisma.user.create({
    data: {
      email: 'fatma@example.com',
      password: userPassword,
      name: 'Fatma Hassan',
      phone: '01123456789',
      role: 'CUSTOMER',
    },
  })

  const customer3 = await prisma.user.create({
    data: {
      email: 'ali@example.com',
      password: userPassword,
      name: 'Ali Mahmoud',
      phone: '01234567890',
      role: 'CUSTOMER',
    },
  })

  const customers = [customer1, customer2, customer3]

  // Create buses
  const coachBus = await prisma.bus.create({
    data: {
      name: 'Coach 01',
      type: 'COACH_BUS',
      seatCount: 40,
      companyId: company.id,
    },
  })

  const vipBus = await prisma.bus.create({
    data: {
      name: 'VIP 01',
      type: 'VIP_BUS',
      seatCount: 24,
      companyId: company.id,
    },
  })

  const miniBus = await prisma.bus.create({
    data: {
      name: 'Mini 01',
      type: 'MINI_BUS',
      seatCount: 12,
      companyId: company.id,
    },
  })

  // Create layouts with seats — using dynamic per-row counts
  const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
  const COACH_COLS_PER_ROW = { A: 4, B: 4, C: 4, D: 4, E: 4, F: 4, G: 4, H: 4, I: 4, J: 4 }
  const VIP_COLS_PER_ROW = { A: 3, B: 3, C: 3, D: 4, E: 4, F: 4, G: 4, H: 2 }
  const MINI_COLS_PER_ROW = { A: 2, B: 3, C: 3 }

  async function createLayout(bus: any, colsPerRow: Record<string, number>, aisleAfter = 2) {
    const rows = Object.keys(colsPerRow).length
    const maxCols = Math.max(...Object.values(colsPerRow))

    const seatsData: { label: string; row: number; col: number; type: string; price: number }[] = []
    const rowLabels = Object.keys(colsPerRow)

    rowLabels.forEach((rowLabel, rowIdx) => {
      const seatsInRow = colsPerRow[rowLabel]
      for (let col = 1; col <= seatsInRow; col++) {
        const isVip = rowIdx === 0 && seatsInRow <= 3
        const isDisabled = rowIdx === rowLabels.length - 1 && col > seatsInRow - 2
        const label = `${rowLabel}${col}`
        seatsData.push({
          label,
          row: rowIdx,
          col,
          type: isVip ? 'VIP' : isDisabled ? 'DISABLED' : 'NORMAL',
          price: isVip ? 350 : 0,
        })
      }
    })

    const layout = await prisma.busLayout.create({
      data: {
        busId: bus.id,
        rows,
        cols: maxCols,
        aisleAfter,
        colsPerRow: JSON.stringify(colsPerRow),
        seats: { create: seatsData },
      },
    })

    await prisma.bus.update({
      where: { id: bus.id },
      data: { seatCount: seatsData.length },
    })

    return layout
  }

  await createLayout(coachBus, COACH_COLS_PER_ROW, 2)
  await createLayout(vipBus, VIP_COLS_PER_ROW, 2)
  await createLayout(miniBus, MINI_COLS_PER_ROW, 1)

  // Create trips — past completed + future scheduled
  function makeDate(daysOffset: number, hour: number, minute = 0) {
    const d = new Date()
    d.setDate(d.getDate() + daysOffset)
    d.setHours(hour, minute, 0, 0)
    return d
  }

  // Past completed trips
  const pastTrips = await Promise.all([
    prisma.trip.create({
      data: {
        busId: coachBus.id, origin: 'القاهرة', destination: 'الإسكندرية',
        departure: makeDate(-7, 8, 0), arrival: makeDate(-7, 11, 30),
        price: 250, status: 'COMPLETED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: vipBus.id, origin: 'القاهرة', destination: 'الجيزة',
        departure: makeDate(-5, 9, 0), arrival: makeDate(-5, 10, 0),
        price: 400, status: 'COMPLETED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: miniBus.id, origin: 'الإسكندرية', destination: 'بورسعيد',
        departure: makeDate(-3, 6, 30), arrival: makeDate(-3, 10, 0),
        price: 180, status: 'COMPLETED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: coachBus.id, origin: 'القاهرة', destination: 'الأقصر',
        departure: makeDate(-2, 7, 0), arrival: makeDate(-2, 16, 0),
        price: 550, status: 'COMPLETED',
      },
    }),
  ])

  // Future scheduled trips
  const futureTrips = await Promise.all([
    prisma.trip.create({
      data: {
        busId: coachBus.id, origin: 'القاهرة', destination: 'الإسكندرية',
        departure: makeDate(1, 8, 0), arrival: makeDate(1, 11, 30),
        price: 250, status: 'SCHEDULED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: vipBus.id, origin: 'القاهرة', destination: 'الجيزة',
        departure: makeDate(1, 10, 0), arrival: makeDate(1, 11, 0),
        price: 400, status: 'SCHEDULED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: miniBus.id, origin: 'الإسكندرية', destination: 'بورسعيد',
        departure: makeDate(2, 7, 0), arrival: makeDate(2, 10, 30),
        price: 180, status: 'SCHEDULED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: coachBus.id, origin: 'القاهرة', destination: 'الأقصر',
        departure: makeDate(3, 6, 0), arrival: makeDate(3, 14, 0),
        price: 550, status: 'SCHEDULED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: vipBus.id, origin: 'الجيزة', destination: 'أسوان',
        departure: makeDate(4, 5, 30), arrival: makeDate(4, 15, 0),
        price: 600, status: 'SCHEDULED',
      },
    }),
    prisma.trip.create({
      data: {
        busId: coachBus.id, origin: 'القاهرة', destination: 'المنصورة',
        departure: makeDate(5, 9, 0), arrival: makeDate(5, 12, 0),
        price: 200, status: 'SCHEDULED',
      },
    }),
  ])

  const allTrips = [...pastTrips, ...futureTrips]

  // Create bookings for past trips with PAID status + paidAt
  function genRef() {
    return `CC${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  }

  const pastBookings = [
    { tripIdx: 0, seatLabel: 'A1', total: 250, daysAgo: 7 },
    { tripIdx: 0, seatLabel: 'A2', total: 250, daysAgo: 7 },
    { tripIdx: 0, seatLabel: 'B1', total: 250, daysAgo: 7 },
    { tripIdx: 0, seatLabel: 'B2', total: 250, daysAgo: 7 },
    { tripIdx: 0, seatLabel: 'C1', total: 250, daysAgo: 7 },
    { tripIdx: 1, seatLabel: 'A1', total: 400, daysAgo: 5 },
    { tripIdx: 1, seatLabel: 'A2', total: 350, daysAgo: 5 },
    { tripIdx: 1, seatLabel: 'B1', total: 350, daysAgo: 5 },
    { tripIdx: 2, seatLabel: 'A1', total: 180, daysAgo: 3 },
    { tripIdx: 2, seatLabel: 'A2', total: 180, daysAgo: 3 },
    { tripIdx: 2, seatLabel: 'B1', total: 180, daysAgo: 3 },
    { tripIdx: 3, seatLabel: 'A1', total: 550, daysAgo: 2 },
    { tripIdx: 3, seatLabel: 'A2', total: 550, daysAgo: 2 },
    { tripIdx: 3, seatLabel: 'B1', total: 550, daysAgo: 2 },
    { tripIdx: 3, seatLabel: 'C1', total: 550, daysAgo: 2 },
    { tripIdx: 3, seatLabel: 'C2', total: 550, daysAgo: 2 },
  ]

  const pastBookingRecords = []
  for (let i = 0; i < pastBookings.length; i++) {
    const b = pastBookings[i]
    const custIdx = i % customers.length
    const createdAt = new Date(Date.now() - b.daysAgo * 24 * 60 * 60 * 1000)
    pastBookingRecords.push({
      reference: genRef(),
      userId: customers[custIdx].id,
      tripId: allTrips[b.tripIdx].id,
      seatLabel: b.seatLabel,
      status: 'PAID',
      paidAt: new Date(createdAt.getTime() + 5 * 60 * 1000),
      total: b.total,
      createdAt,
    })
  }

  // Future bookings
  const futureBookings = [
    { tripIdx: 5, seatLabel: 'A1', total: 250, daysAhead: 1 },
    { tripIdx: 5, seatLabel: 'A2', total: 250, daysAhead: 1 },
    { tripIdx: 6, seatLabel: 'A1', total: 400, daysAhead: 1 },
    { tripIdx: 7, seatLabel: 'A1', total: 180, daysAhead: 2 },
    { tripIdx: 7, seatLabel: 'A2', total: 180, daysAhead: 2 },
  ]

  const futureBookingRecords = []
  for (const b of futureBookings) {
    const custIdx = Math.floor(Math.random() * customers.length)
    futureBookingRecords.push({
      reference: genRef(),
      userId: customers[custIdx].id,
      tripId: allTrips[b.tripIdx].id,
      seatLabel: b.seatLabel,
      status: 'PAID',
      paidAt: new Date(),
      total: b.total,
      createdAt: new Date(),
    })
  }

  await prisma.booking.createMany({ data: [...pastBookingRecords, ...futureBookingRecords] })

  console.log('✅ Seed completed!')
  console.log('')
  console.log('Demo accounts:')
  console.log('  Admin:    admin@cairoexpress.com / admin123')
  console.log('  Customer: user@example.com / user123')
  console.log('')
  console.log('Buses created: 3 (Coach, VIP, Mini) with dynamic layouts')
  console.log('Trips created: 4 past (COMPLETED) + 6 future (SCHEDULED)')
  console.log('Bookings: ~20 total across all trips')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })