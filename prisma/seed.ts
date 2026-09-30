import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ── Create stations first ──────────────────────────────
  const [cairo, alex, giza, portsaid, luxor, aswan, mansoura, hurghada, sharm, minya, beniSuef, fayoum, ismailia, zagazig, damietta] = await Promise.all([
    prisma.station.create({ data: { name: 'القاهرة', city: 'القاهرة' } }),
    prisma.station.create({ data: { name: 'الإسكندرية', city: 'الإسكندرية' } }),
    prisma.station.create({ data: { name: 'الجيزة', city: 'الجيزة' } }),
    prisma.station.create({ data: { name: 'بورسعيد', city: 'بورسعيد' } }),
    prisma.station.create({ data: { name: 'الأقصر', city: 'الأقصر' } }),
    prisma.station.create({ data: { name: 'أسوان', city: 'أسوان' } }),
    prisma.station.create({ data: { name: 'المنصورة', city: 'المنصورة' } }),
    prisma.station.create({ data: { name: 'الغردقة', city: 'البحر الأحمر' } }),
    prisma.station.create({ data: { name: 'شرم الشيخ', city: 'جنوب سيناء' } }),
    prisma.station.create({ data: { name: 'المنيا', city: 'المنيا' } }),
    prisma.station.create({ data: { name: 'بني سويف', city: 'بني سويف' } }),
    prisma.station.create({ data: { name: 'الفيوم', city: 'الفيوم' } }),
    prisma.station.create({ data: { name: 'الإسماعيلية', city: 'الإسماعيلية' } }),
    prisma.station.create({ data: { name: 'الزقازيق', city: 'الشرقية' } }),
    prisma.station.create({ data: { name: 'دمياط', city: 'دمياط' } }),
  ])

  console.log(`✅ Created ${15} stations`)

  // ── Create company ──────────────────────────────
  const company = await prisma.company.create({
    data: {
      name: 'Cairo Express',
      subdomain: 'cairoexpress',
      plan: 'PRO',
    },
  })

  // ── Create users ──────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 12)
  const userPassword = await bcrypt.hash('user123', 12)
  const superAdminPassword = await bcrypt.hash('super123', 12)

  const [superAdmin, admin, customer1, customer2, customer3] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'superadmin@crushcar.com',
        password: superAdminPassword,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        email: 'admin@cairoexpress.com',
        password: adminPassword,
        name: 'Ahmed Admin',
        role: 'COMPANY_ADMIN',
        companyId: company.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'user@example.com',
        password: userPassword,
        name: 'Mohamed Customer',
        phone: '01012345678',
        role: 'CUSTOMER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'fatma@example.com',
        password: userPassword,
        name: 'Fatma Hassan',
        phone: '01123456789',
        role: 'CUSTOMER',
      },
    }),
    prisma.user.create({
      data: {
        email: 'ali@example.com',
        password: userPassword,
        name: 'Ali Mahmoud',
        phone: '01234567890',
        role: 'CUSTOMER',
      },
    }),
  ])

  console.log('✅ Created users')

  // ── Create buses ──────────────────────────────
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

  // ── Create layouts ──────────────────────────────
  const COACH_COLS = { A: 4, B: 4, C: 4, D: 4, E: 4, F: 4, G: 4, H: 4, I: 4, J: 4 }
  const VIP_COLS = { A: 3, B: 3, C: 3, D: 4, E: 4, F: 4, G: 4, H: 2 }
  const MINI_COLS = { A: 2, B: 3, C: 3 }

  async function createLayout(bus: any, colsPerRow: Record<string, number>, aisleAfter = 2) {
    const rowLabels = Object.keys(colsPerRow)
    const seatsData: any[] = []

    rowLabels.forEach((rowLabel, rowIdx) => {
      const seatsInRow = colsPerRow[rowLabel]
      for (let col = 1; col <= seatsInRow; col++) {
        const isVip = rowIdx === 0 && seatsInRow <= 3
        const isDisabled = rowIdx === rowLabels.length - 1 && col > seatsInRow - 2
        seatsData.push({
          label: `${rowLabel}${col}`,
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
        rows: rowLabels.length,
        cols: Math.max(...Object.values(colsPerRow)),
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

  await createLayout(coachBus, COACH_COLS, 2)
  await createLayout(vipBus, VIP_COLS, 2)
  await createLayout(miniBus, MINI_COLS, 1)

  console.log('✅ Created buses with layouts')

  // ── Helper function ──────────────────────────────
  function makeDate(daysOffset: number, hour: number, minute = 0) {
    const d = new Date()
    d.setDate(d.getDate() + daysOffset)
    d.setHours(hour, minute, 0, 0)
    return d
  }

  // ── Create trips with proper TripStops ──────────────────────────────
  type TripDef = {
    bus: any
    from: any
    to: any
    price: number
    daysOffset: number
    departHour: number
    departMin: number
    travelHours: number
    travelMin: number
    status: string
  }

  const tripDefs: TripDef[] = [
    // Future trips
    { bus: coachBus, from: cairo, to: alex, price: 250, daysOffset: 1, departHour: 8, departMin: 0, travelHours: 3, travelMin: 30, status: 'SCHEDULED' },
    { bus: vipBus, from: cairo, to: giza, price: 400, daysOffset: 1, departHour: 10, departMin: 0, travelHours: 1, travelMin: 0, status: 'SCHEDULED' },
    { bus: miniBus, from: alex, to: portsaid, price: 180, daysOffset: 2, departHour: 7, departMin: 0, travelHours: 3, travelMin: 30, status: 'SCHEDULED' },
    { bus: coachBus, from: cairo, to: luxor, price: 550, daysOffset: 3, departHour: 6, departMin: 0, travelHours: 8, travelMin: 0, status: 'SCHEDULED' },
    { bus: vipBus, from: giza, to: aswan, price: 600, daysOffset: 4, departHour: 5, departMin: 30, travelHours: 9, travelMin: 30, status: 'SCHEDULED' },
    { bus: coachBus, from: cairo, to: mansoura, price: 200, daysOffset: 5, departHour: 9, departMin: 0, travelHours: 3, travelMin: 0, status: 'SCHEDULED' },
    { bus: coachBus, from: cairo, to: hurghada, price: 450, daysOffset: 2, departHour: 7, departMin: 0, travelHours: 6, travelMin: 0, status: 'SCHEDULED' },
    { bus: vipBus, from: cairo, to: sharm, price: 700, daysOffset: 3, departHour: 6, departMin: 0, travelHours: 7, travelMin: 0, status: 'SCHEDULED' },
    // Past trips (completed)
    { bus: coachBus, from: cairo, to: alex, price: 250, daysOffset: -7, departHour: 8, departMin: 0, travelHours: 3, travelMin: 30, status: 'COMPLETED' },
    { bus: vipBus, from: cairo, to: giza, price: 400, daysOffset: -5, departHour: 9, departMin: 0, travelHours: 1, travelMin: 0, status: 'COMPLETED' },
  ]

  const trips = await Promise.all(
    tripDefs.map(async (def) => {
      const departure = makeDate(def.daysOffset, def.departHour, def.departMin)
      const arrival = new Date(departure.getTime() + def.travelHours * 60 * 60 * 1000 + def.travelMin * 60 * 1000)

      return prisma.trip.create({
        data: {
          busId: def.bus.id,
          origin: def.from.name,
          destination: def.to.name,
          departure,
          arrival,
          price: def.price,
          status: def.status,
          tripStops: {
            create: [
              {
                stationId: def.from.id,
                stopOrder: 0,
                priceFromOrigin: 0,
                departureTime: departure,
              },
              {
                stationId: def.to.id,
                stopOrder: 1,
                priceFromOrigin: def.price,
                arrivalTime: arrival,
              },
            ],
          },
        },
        include: { tripStops: true },
      })
    })
  )

  console.log(`✅ Created ${trips.length} trips with stops`)

  // ── Create some bookings ──────────────────────────────
  function genRef() {
    return `CC${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  }

  const customers = [customer1, customer2, customer3]
  const futureTrips = trips.filter(t => t.status === 'SCHEDULED')

  const bookings = [
    { tripIdx: 0, seat: 'A1', customer: 0 },
    { tripIdx: 0, seat: 'A2', customer: 1 },
    { tripIdx: 1, seat: 'A1', customer: 2 },
    { tripIdx: 2, seat: 'A1', customer: 0 },
    { tripIdx: 3, seat: 'A1', customer: 1 },
    { tripIdx: 3, seat: 'A2', customer: 2 },
  ]

  await Promise.all(
    bookings.map(b =>
      prisma.booking.create({
        data: {
          reference: genRef(),
          userId: customers[b.customer].id,
          tripId: futureTrips[b.tripIdx].id,
          seatLabel: b.seat,
          status: 'PAID',
          paidAt: new Date(),
          total: futureTrips[b.tripIdx].price,
        },
      })
    )
  )

  console.log(`✅ Created ${bookings.length} bookings`)

  // ─ Summary ──────────────────────────────
  console.log('')
  console.log('📊 Summary:')
  console.log(`   Stations: ${await prisma.station.count()}`)
  console.log(`   Companies: ${await prisma.company.count()}`)
  console.log(`   Users: ${await prisma.user.count()}`)
  console.log(`   Buses: ${await prisma.bus.count()}`)
  console.log(`   Trips: ${await prisma.trip.count()}`)
  console.log(`   TripStops: ${await prisma.tripStop.count()}`)
  console.log(`   Bookings: ${await prisma.booking.count()}`)
  console.log('')
  console.log('Demo accounts:')
  console.log('  Super Admin:  superadmin@crushcar.com / super123')
  console.log('  Company Admin: admin@cairoexpress.com / admin123')
  console.log('  Customer:     user@example.com / user123')
  console.log('')
  console.log('✅ Seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
