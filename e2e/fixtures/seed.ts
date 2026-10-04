import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

export async function seedScratchDatabase(databaseUrl?: string) {
  let url = databaseUrl || 'file:../.scratch/e2e.db'
  if (url.includes('dev.db')) {
    url = 'file:../.scratch/e2e.db'
  }
  if (url.includes('dev.db')) {
    throw new Error('SAFETY VIOLATION: seedScratchDatabase attempted to run against dev.db!')
  }
  console.log(`[E2E Seed] Connecting to database: ${url}`)

  const prisma = new PrismaClient({
    datasources: {
      db: { url },
    },
  })

  try {
    // Clean existing tables in correct dependency order
    const cleanQueries = [
      (prisma as any).reminder?.deleteMany?.(),
      (prisma as any).seatBlock?.deleteMany?.(),
      (prisma as any).seatHold?.deleteMany?.(),
      prisma.booking.deleteMany(),
      prisma.companyBooking.deleteMany(),
      (prisma as any).charterBooking?.deleteMany?.(),
      prisma.walletTransaction.deleteMany(),
      prisma.depositRequest.deleteMany(),
      prisma.tripRequest.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.companyCustomer.deleteMany(),
      (prisma as any).creditLog?.deleteMany?.(),
      prisma.tripStop.deleteMany(),
      prisma.trip.deleteMany(),
      prisma.seat.deleteMany(),
      prisma.busLayout.deleteMany(),
      prisma.busStation.deleteMany(),
      prisma.bus.deleteMany(),
      prisma.station.deleteMany(),
      (prisma as any).destination?.deleteMany?.(),
      prisma.faq.deleteMany(),
      (prisma as any).auditLog?.deleteMany?.(),
      (prisma as any).siteSetting?.deleteMany?.(),
      prisma.user.deleteMany(),
      prisma.company.deleteMany(),
    ].filter(Boolean);

    await prisma.$transaction(cleanQueries);

    if ((prisma as any).siteSetting?.create) {
      await (prisma as any).siteSetting.create({
        data: {
          key: 'individualRegistrationEnabled',
          value: 'true',
        },
      });
    }

    console.log('[E2E Seed] Cleaned previous records and enabled registration')

    // ── 1. Create Stations ──────────────────────────────────────────
    const stationData = [
      { id: 'st-cairo', name: 'القاهرة', city: 'القاهرة' },
      { id: 'st-alex', name: 'الإسكندرية', city: 'الإسكندرية' },
      { id: 'st-giza', name: 'الجيزة', city: 'الجيزة' },
      { id: 'st-hurghada', name: 'الغردقة', city: 'البحر الأحمر' },
      { id: 'st-sharm', name: 'شرم الشيخ', city: 'جنوب سيناء' },
      { id: 'st-dahab', name: 'دهب', city: 'جنوب سيناء' },
      { id: 'st-luxor', name: 'الأقصر', city: 'الأقصر' },
      { id: 'st-aswan', name: 'أسوان', city: 'أسوان' },
      { id: 'st-portsaid', name: 'بورسعيد', city: 'بورسعيد' },
      { id: 'st-mansoura', name: 'المنصورة', city: 'المنصورة' },
    ]

    for (const s of stationData) {
      await prisma.station.create({ data: s })
    }

    // ── 2. Create Companies ─────────────────────────────────────────
    // Company 1: Active company with wallet and credit
    const cairoExpress = await prisma.company.create({
      data: {
        id: 'comp-cairo-express',
        name: 'Cairo Express',
        subdomain: 'cairoexpress',
        plan: 'PRO',
        creditLimit: 10000,
        walletBalance: 5000,
        outstandingBalance: 0,
        paymentMode: 'BOTH',
        billingCycle: 'MONTHLY',
        isActive: true,
      },
    })

    // Company 2: Active company with zero credit
    const zeroCreditCo = await prisma.company.create({
      data: {
        id: 'comp-zero-credit',
        name: 'Zero Credit Co',
        subdomain: 'zerocredit',
        plan: 'STARTER',
        creditLimit: 0,
        walletBalance: 0,
        outstandingBalance: 0,
        paymentMode: 'PREPAID',
        billingCycle: 'MONTHLY',
        isActive: true,
      },
    })

    // Company 3: Active company without buses
    const noBusCo = await prisma.company.create({
      data: {
        id: 'comp-no-bus',
        name: 'No Bus Co',
        subdomain: 'nobus',
        plan: 'STARTER',
        creditLimit: 5000,
        walletBalance: 1000,
        outstandingBalance: 0,
        paymentMode: 'PREPAID',
        billingCycle: 'MONTHLY',
        isActive: true,
      },
    })

    // Company 4: Company pending approval
    const pendingCo = await prisma.company.create({
      data: {
        id: 'comp-pending',
        name: 'Pending Co',
        subdomain: 'pendingco',
        plan: 'STARTER',
        creditLimit: 0,
        walletBalance: 0,
        outstandingBalance: 0,
        paymentMode: 'PREPAID',
        billingCycle: 'MONTHLY',
        isActive: false,
      },
    })

    // ── 3. Create Users ─────────────────────────────────────────────
    const superAdminPw = await bcrypt.hash('super123', 10)
    const adminPw = await bcrypt.hash('admin123', 10)
    const userPw = await bcrypt.hash('user123', 10)

    const superAdmin = await prisma.user.create({
      data: {
        id: 'user-superadmin',
        email: 'superadmin@crushcar.com',
        password: superAdminPw,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    })

    const customer = await prisma.user.create({
      data: {
        id: 'user-customer',
        email: 'user@example.com',
        password: userPw,
        name: 'Mohamed Customer',
        phone: '01012345678',
        role: 'CUSTOMER',
        isActive: true,
      },
    })

    const companyAdminCairo = await prisma.user.create({
      data: {
        id: 'user-company-admin',
        email: 'admin@cairoexpress.com',
        password: adminPw,
        name: 'Ahmed Cairo',
        role: 'COMPANY_ADMIN',
        companyId: cairoExpress.id,
        isActive: true,
      },
    })

    const companyAdminZero = await prisma.user.create({
      data: {
        id: 'user-company-zero',
        email: 'admin@zerocredit.com',
        password: adminPw,
        name: 'Zero Admin',
        role: 'COMPANY_ADMIN',
        companyId: zeroCreditCo.id,
        isActive: true,
      },
    })

    const companyAdminNoBus = await prisma.user.create({
      data: {
        id: 'user-company-nobus',
        email: 'admin@nobus.com',
        password: adminPw,
        name: 'NoBus Admin',
        role: 'COMPANY_ADMIN',
        companyId: noBusCo.id,
        isActive: true,
      },
    })

    const companyAdminPending = await prisma.user.create({
      data: {
        id: 'user-company-pending',
        email: 'admin@pendingco.com',
        password: adminPw,
        name: 'Pending Admin',
        role: 'COMPANY_ADMIN',
        companyId: pendingCo.id,
        isActive: true,
      },
    })

    const disabledUser = await prisma.user.create({
      data: {
        id: 'user-disabled',
        email: 'disabled@example.com',
        password: userPw,
        name: 'Disabled User',
        phone: '01000000000',
        role: 'CUSTOMER',
        isActive: false,
      },
    })

    // ── 4. Create Buses & Layouts ───────────────────────────────────
    // Bus 1: 40 seats Coach bus
    const coachBus = await prisma.bus.create({
      data: {
        id: 'bus-coach-40',
        name: 'Coach 01',
        type: 'COACH_BUS',
        seatCount: 40,
        companyId: cairoExpress.id,
      },
    })

    const coachLayout = await prisma.busLayout.create({
      data: {
        id: 'layout-coach-40',
        busId: coachBus.id,
        rows: 10,
        cols: 4,
        aisleAfter: 2,
        colsPerRow: JSON.stringify(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String.fromCharCode(65 + i), 4]))),
      },
    })

    const coachSeats = []
    const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    for (let r = 0; r < 10; r++) {
      for (let c = 1; c <= 4; c++) {
        coachSeats.push({
          id: `seat-coach-${r}-${c}`,
          layoutId: coachLayout.id,
          label: `${rowLetters[r]}${c}`,
          row: r,
          col: c,
          type: 'NORMAL',
          price: 0,
        })
      }
    }
    await prisma.seat.createMany({ data: coachSeats })

    await prisma.busStation.createMany({
      data: [
        { busId: coachBus.id, name: 'القاهرة', order: 1 },
        { busId: coachBus.id, name: 'الغردقة', order: 2 },
      ],
    })

    // Bus 2: 20 seats VIP bus with tiered seat prices
    const vipBus = await prisma.bus.create({
      data: {
        id: 'bus-vip-tiered',
        name: 'VIP Tiered 01',
        type: 'VIP_BUS',
        seatCount: 20,
        companyId: cairoExpress.id,
      },
    })

    const vipLayout = await prisma.busLayout.create({
      data: {
        id: 'layout-vip-tiered',
        busId: vipBus.id,
        rows: 5,
        cols: 4,
        aisleAfter: 2,
        colsPerRow: JSON.stringify({ A: 4, B: 4, C: 4, D: 4, E: 4 }),
      },
    })

    const vipSeats = []
    const tieredRowLetters = ['A', 'B', 'C', 'D', 'E']
    const tierPriceMap = [100, 60, 40, 20, 0] // Extra seat price tier
    for (let r = 0; r < 5; r++) {
      for (let c = 1; c <= 4; c++) {
        vipSeats.push({
          id: `seat-vip-${r}-${c}`,
          layoutId: vipLayout.id,
          label: `${tieredRowLetters[r]}${c}`,
          row: r,
          col: c,
          type: r === 0 ? 'VIP' : 'NORMAL',
          price: tierPriceMap[r],
        })
      }
    }
    await prisma.seat.createMany({ data: vipSeats })

    // Bus 3: 14 seats Mini bus
    const miniBus = await prisma.bus.create({
      data: {
        id: 'bus-mini-14',
        name: 'Minibus 01',
        type: 'MINI_BUS',
        seatCount: 14,
        companyId: cairoExpress.id,
      },
    })

    const miniLayout = await prisma.busLayout.create({
      data: {
        id: 'layout-mini-14',
        busId: miniBus.id,
        rows: 4,
        cols: 4,
        aisleAfter: 2,
        colsPerRow: JSON.stringify({ A: 3, B: 3, C: 4, D: 4 }),
      },
    })

    const miniSeats = []
    const miniRowLetters = ['A', 'B', 'C', 'D']
    const miniColsPerRow = [3, 3, 4, 4]
    for (let r = 0; r < 4; r++) {
      for (let c = 1; c <= miniColsPerRow[r]; c++) {
        miniSeats.push({
          id: `seat-mini-${r}-${c}`,
          layoutId: miniLayout.id,
          label: `${miniRowLetters[r]}${c}`,
          row: r,
          col: c,
          type: 'NORMAL',
          price: 0,
        })
      }
    }
    await prisma.seat.createMany({ data: miniSeats })

    // ── 5. Create Trips ─────────────────────────────────────────────
    const now = new Date()

    // Helper date functions
    const addHours = (h: number) => new Date(now.getTime() + h * 3600 * 1000)
    const addDays = (d: number, hour = 8) => {
      const target = new Date(now.getTime() + d * 24 * 3600 * 1000)
      target.setHours(hour, 0, 0, 0)
      return target
    }

    // 1. Trip with Tiered Seat Prices
    const tripTiered = await prisma.trip.create({
      data: {
        id: 'trip-tiered-prices',
        busId: vipBus.id,
        origin: 'القاهرة',
        destination: 'شرم الشيخ',
        departure: addDays(3, 8),
        arrival: addDays(3, 14),
        price: 200,
        bookingMode: 'SEAT',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-sharm', stopOrder: 2, priceFromOrigin: 200 },
          ],
        },
      },
    })

    // 2. Trip departing within refund-tier window (in 8 hours: 50% refund window)
    const tripRefundWindow = await prisma.trip.create({
      data: {
        id: 'trip-refund-window',
        busId: coachBus.id,
        origin: 'القاهرة',
        destination: 'الإسكندرية',
        departure: addHours(8),
        arrival: addHours(11),
        price: 150,
        bookingMode: 'SEAT',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-alex', stopOrder: 2, priceFromOrigin: 150 },
          ],
        },
      },
    })

    // Pre-create a booking on tripRefundWindow (> 1h old so free cancellation is over, testing 50% tier)
    const refundBookingTime = new Date(now.getTime() - 2 * 3600 * 1000) // 2 hours ago
    await prisma.booking.create({
      data: {
        id: 'bk-refund-tier-test',
        reference: 'REFUND50TEST',
        userId: customer.id,
        tripId: tripRefundWindow.id,
        seatLabel: 'A1',
        passengerName: 'Mohamed Customer',
        passengerPhone: '01012345678',
        status: 'PAID',
        paidAt: refundBookingTime,
        total: 150,
        createdAt: refundBookingTime,
      },
    })

    // 3. Past Trip
    const tripPast = await prisma.trip.create({
      data: {
        id: 'trip-past',
        busId: coachBus.id,
        origin: 'القاهرة',
        destination: 'الإسكندرية',
        departure: addDays(-2, 10),
        arrival: addDays(-2, 13),
        price: 150,
        bookingMode: 'SEAT',
        status: 'COMPLETED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-alex', stopOrder: 2, priceFromOrigin: 150 },
          ],
        },
      },
    })

    // 4. Sold-out Trip (Minibus 14 seats)
    const tripSoldOut = await prisma.trip.create({
      data: {
        id: 'trip-sold-out',
        busId: miniBus.id,
        origin: 'القاهرة',
        destination: 'الغردقة',
        departure: addDays(4, 9),
        arrival: addDays(4, 15),
        price: 250,
        bookingMode: 'SEAT',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-hurghada', stopOrder: 2, priceFromOrigin: 250 },
          ],
        },
      },
    })

    // Book all 14 seats on tripSoldOut
    for (let i = 0; i < miniSeats.length; i++) {
      const s = miniSeats[i]
      await prisma.booking.create({
        data: {
          id: `bk-soldout-${i + 1}`,
          reference: `SLDOUT-${(i + 1).toString().padStart(2, '0')}`,
          userId: customer.id,
          tripId: tripSoldOut.id,
          seatLabel: s.label,
          passengerName: `Passenger ${i + 1}`,
          status: 'PAID',
          paidAt: now,
          total: 250,
        },
      })
    }

    // 5. Trip with Held Seats
    const tripHeld = await prisma.trip.create({
      data: {
        id: 'trip-held-seats',
        busId: coachBus.id,
        origin: 'القاهرة',
        destination: 'دهب',
        departure: addDays(5, 7),
        arrival: addDays(5, 16),
        price: 300,
        bookingMode: 'SEAT',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-dahab', stopOrder: 2, priceFromOrigin: 300 },
          ],
        },
      },
    })

    await prisma.seatHold.createMany({
      data: [
        {
          id: 'hold-1',
          tripId: tripHeld.id,
          seatLabel: 'A1',
          fromStopOrder: 1,
          toStopOrder: 2,
          userId: 'user-held-1',
          expiresAt: addHours(2),
        },
        {
          id: 'hold-2',
          tripId: tripHeld.id,
          seatLabel: 'A2',
          fromStopOrder: 1,
          toStopOrder: 2,
          userId: 'user-held-2',
          expiresAt: addHours(2),
        },
      ],
    })

    // 6. Round-trip pair A to B and B to A on future dates
    const tripRoundOutbound = await prisma.trip.create({
      data: {
        id: 'trip-round-outbound',
        busId: coachBus.id,
        origin: 'القاهرة',
        destination: 'الإسكندرية',
        departure: addDays(2, 9),
        arrival: addDays(2, 12),
        price: 160,
        bookingMode: 'SEAT',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-alex', stopOrder: 2, priceFromOrigin: 160 },
          ],
        },
      },
    })

    const tripRoundReturn = await prisma.trip.create({
      data: {
        id: 'trip-round-return',
        busId: coachBus.id,
        origin: 'الإسكندرية',
        destination: 'القاهرة',
        departure: addDays(4, 18),
        arrival: addDays(4, 21),
        price: 160,
        bookingMode: 'SEAT',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-alex', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-cairo', stopOrder: 2, priceFromOrigin: 160 },
          ],
        },
      },
    })

    // 7. Normal trip with 40 seats (available for customer & company golden flow)
    const tripNormal40 = await prisma.trip.create({
      data: {
        id: 'trip-normal-40',
        busId: coachBus.id,
        origin: 'القاهرة',
        destination: 'الغردقة',
        departure: addDays(6, 6),
        arrival: addDays(6, 12),
        price: 220,
        busPrice: 8000,
        bookingMode: 'BOTH',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-hurghada', stopOrder: 2, priceFromOrigin: 220 },
          ],
        },
      },
    })

    // 8. Charter Trip (Full bus reservation)
    await prisma.trip.create({
      data: {
        id: 'trip-charter-full',
        busId: coachBus.id,
        origin: 'القاهرة',
        destination: 'الغردقة',
        departure: addDays(7, 8),
        arrival: addDays(7, 14),
        price: 220,
        busPrice: 7500,
        bookingMode: 'BUS',
        status: 'SCHEDULED',
        tripStops: {
          create: [
            { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
            { stationId: 'st-hurghada', stopOrder: 2, priceFromOrigin: 220 },
          ],
        },
      },
    })

    // ── 6. Create Destinations ───────────────────────────────────────
    const destinations = [
      { slug: 'alexandria', nameAr: 'الإسكندرية', nameEn: 'Alexandria', imageUrl: '/destinations/alexandria.jpg', sortOrder: 1, isActive: true },
      { slug: 'hurghada', nameAr: 'الغردقة', nameEn: 'Hurghada', imageUrl: '/destinations/hurghada.jpg', sortOrder: 2, isActive: true },
      { slug: 'sharm', nameAr: 'شرم الشيخ', nameEn: 'Sharm El Sheikh', imageUrl: '/destinations/sharm-el-sheikh.jpg', sortOrder: 3, isActive: true },
      { slug: 'dahab', nameAr: 'دهب', nameEn: 'Dahab', imageUrl: '/destinations/dahab.jpg', sortOrder: 4, isActive: true },
      { slug: 'luxor', nameAr: 'الأقصر', nameEn: 'Luxor', imageUrl: '/destinations/luxor.jpg', sortOrder: 5, isActive: true },
      { slug: 'aswan', nameAr: 'أسوان', nameEn: 'Aswan', imageUrl: '/destinations/aswan.jpg', sortOrder: 6, isActive: true },
    ]

    for (const d of destinations) {
      await prisma.destination.create({ data: d })
    }

    // ── 7. Create FAQs ───────────────────────────────────────────────
    const faqs = [
      {
        questionAr: 'كيف يمكنني حجز تذكرة؟',
        questionEn: 'How can I book a ticket?',
        answerAr: 'يمكنك اختيار وجهتك وتاريخ الرحلة ثم اختيار المقعد وتأكيد الحجز.',
        answerEn: 'You can choose your destination, date, pick seats, and confirm your booking.',
        order: 1,
        isActive: true,
      },
      {
        questionAr: 'ما هي سياسة الإلغاء والاسترداد؟',
        questionEn: 'What is the cancellation and refund policy?',
        answerAr: 'يمكنك الإلغاء مجاناً خلال ساعة من الحجز أو قبل 24 ساعة من موعد الرحلة.',
        answerEn: 'Free cancellation within 1 hour of booking or 24+ hours before departure.',
        order: 2,
        isActive: true,
      },
    ]

    for (const f of faqs) {
      await prisma.faq.create({ data: f })
    }

    // ── 8. Create Company Customers, Invoices, Deposit Request ───────
    const compCustomer1 = await prisma.companyCustomer.create({
      data: {
        id: 'comp-cust-1',
        companyId: cairoExpress.id,
        name: 'شركة النيل للخدمات',
        phone: '01011112222',
        email: 'nile@company.com',
      },
    })

    await prisma.invoice.create({
      data: {
        id: 'inv-e2e-1',
        companyId: cairoExpress.id,
        periodStart: addDays(-30),
        periodEnd: now,
        totalAmount: 2000,
        paidAmount: 0,
        status: 'PENDING',
        dueDate: addDays(15),
      },
    })

    const pendingDeposit = await prisma.depositRequest.create({
      data: {
        id: 'dep-e2e-1',
        companyId: cairoExpress.id,
        amount: 3000,
        status: 'PENDING',
      },
    })

    // Create a company booking for cancellation flow
    const compBooking = await prisma.companyBooking.create({
      data: {
        id: 'cb-e2e-cancel-test',
        reference: 'CB-CANCEL-TEST',
        companyId: cairoExpress.id,
        tripId: tripNormal40.id,
        seatLabel: 'B1',
        passengerName: 'Employee Test',
        status: 'PAID',
        total: 220,
        paidFromWallet: 220,
        paidOnCredit: 0,
        bookingType: 'FOR_EMPLOYEE',
      },
    })

    console.log('[E2E Seed] Successfully populated fixtures for all roles and scenarios!')
  } finally {
    await prisma.$disconnect()
  }
}

export async function seedEmptyDatabase(databaseUrl?: string) {
  let url = databaseUrl || process.env.DATABASE_URL || 'file:../.scratch/empty.db'
  if (url.includes('dev.db')) {
    url = 'file:../.scratch/empty.db'
  }
  console.log(`[E2E Seed Empty] Initializing empty state DB: ${url}`)

  const fs = await import('fs')
  const path = await import('path')
  const e2eDbPath = path.resolve(process.cwd(), '.scratch/e2e.db')
  const targetDbPath = path.resolve(process.cwd(), '.scratch/empty.db')

  if (fs.existsSync(e2eDbPath)) {
    fs.copyFileSync(e2eDbPath, targetDbPath)
    console.log('[E2E Seed Empty] Copied schema from e2e.db')
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } })
  try {
    // Clear all trips, bookings, customers, destinations, invoices, requests
    const emptyQueries = [
      (prisma as any).reminder?.deleteMany?.(),
      (prisma as any).seatBlock?.deleteMany?.(),
      (prisma as any).seatHold?.deleteMany?.(),
      prisma.booking.deleteMany(),
      prisma.companyBooking.deleteMany(),
      (prisma as any).charterBooking?.deleteMany?.(),
      prisma.walletTransaction.deleteMany(),
      prisma.depositRequest.deleteMany(),
      prisma.tripRequest.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.companyCustomer.deleteMany(),
      prisma.tripStop.deleteMany(),
      prisma.trip.deleteMany(),
      (prisma as any).destination?.deleteMany?.(),
    ].filter(Boolean);
    await prisma.$transaction(emptyQueries);
    console.log('[E2E Seed Empty] Cleared all trips, bookings, customers, destinations!')
  } finally {
    await prisma.$disconnect()
  }
}

export async function seedBigDatabase(databaseUrl?: string) {
  let url = databaseUrl || process.env.DATABASE_URL || 'file:../.scratch/big.db'
  if (url.includes('dev.db')) {
    url = 'file:../.scratch/big.db'
  }
  console.log(`[E2E Seed Big] Seeding 500 bookings, 200 trips, 100 customers into: ${url}`)

  const fs = await import('fs')
  const path = await import('path')
  const e2eDbPath = path.resolve(process.cwd(), '.scratch/e2e.db')
  const targetDbPath = path.resolve(process.cwd(), '.scratch/big.db')

  if (fs.existsSync(e2eDbPath)) {
    fs.copyFileSync(e2eDbPath, targetDbPath)
    console.log('[E2E Seed Big] Copied schema from e2e.db')
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } })

  try {
    // Start with base seed
    await seedScratchDatabase(url)

    const cairoExpress = await prisma.company.findUnique({ where: { subdomain: 'cairoexpress' } })
    if (!cairoExpress) throw new Error('cairoexpress not found')
    const customer = await prisma.user.findUnique({ where: { email: 'user@example.com' } })
    if (!customer) throw new Error('user@example.com not found')
    const coachBus = await prisma.bus.findFirst({ where: { type: 'COACH_BUS' } })
    if (!coachBus) throw new Error('coach bus not found')

    const stationPairs = [
      { from: 'القاهرة', to: 'الإسكندرية' },
      { from: 'القاهرة', to: 'شرم الشيخ' },
      { from: 'القاهرة', to: 'الغردقة' },
      { from: 'الإسكندرية', to: 'الأقصر' },
      { from: 'الجيزة', to: 'أسوان' },
    ]

    // 1. Create 100 Company Customers with long names, emoji, mixed RTL/LTR
    const sampleNames = [
      'الأستاذ عبد الرحمن محمد علي حسن السيد إبراهيم الشناوي 🚀 (VIP Corporate)',
      'سارة أحمد محمود — English Dept. & Logistics Coordinator 🌟',
      'مؤسسة النصر العامة للتجارة والنقل الدولي / El-Nasr Transport Co. 🇪🇬',
      'د. يوسف إبراهيم خليل سالم ✈️ Travel Manager #109',
    ]

    const compCustomers = []
    for (let i = 1; i <= 100; i++) {
      const base = sampleNames[i % sampleNames.length]
      compCustomers.push({
        id: `big-cust-${i}`,
        companyId: cairoExpress.id,
        name: `${base} [${i}]`,
        phone: `010${(10000000 + i).toString().slice(1)}`,
        email: `corp-client-${i}@enterprise-logistics.eg`,
        notes: `ملاحظات العميل رقم ${i}: عميل مميز ذو حجم تعاملات مرتفع ويحتاج باصات مكيفة 🚌✨`,
      })
    }
    await prisma.companyCustomer.createMany({ data: compCustomers })
    console.log('[E2E Seed Big] Created 100 company customers')

    // 2. Create 200 Trips
    const now = new Date()
    const tripCreates = []
    for (let i = 1; i <= 200; i++) {
      const pair = stationPairs[i % stationPairs.length]
      const dep = new Date(now.getTime() + (i * 3 - 50) * 3600 * 1000) // spread over days
      const arr = new Date(dep.getTime() + 4 * 3600 * 1000)
      tripCreates.push({
        id: `big-trip-${i}`,
        busId: coachBus.id,
        origin: pair.from,
        destination: pair.to,
        departure: dep,
        arrival: arr,
        price: 150 + (i % 10) * 10,
        bookingMode: 'BOTH',
        status: dep < now ? 'COMPLETED' : 'SCHEDULED',
      })
    }
    await prisma.trip.createMany({ data: tripCreates })
    console.log('[E2E Seed Big] Created 200 trips')

    // 3. Create 500 Bookings
    const bookingCreates = []
    const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    for (let i = 1; i <= 500; i++) {
      const tripId = `big-trip-${(i % 190) + 1}`
      const seat = `${rowLetters[i % 10]}${(i % 4) + 1}`
      bookingCreates.push({
        id: `big-bk-${i}`,
        reference: `BIG-BK-${i.toString().padStart(4, '0')}`,
        userId: customer.id,
        tripId,
        seatLabel: seat,
        passengerName: `مسافر رقم ${i} مع اسم عربي طويل جداً للتأكد من التفاف النص وعدم كسر التصميم 🎫`,
        passengerPhone: `011${(20000000 + i).toString().slice(1)}`,
        status: i % 5 === 0 ? 'CANCELLED' : i % 3 === 0 ? 'PENDING' : 'PAID',
        total: 180,
      })
    }
    await prisma.booking.createMany({ data: bookingCreates })
    console.log('[E2E Seed Big] Created 500 bookings')
  } finally {
    await prisma.$disconnect()
  }
}

// Allow direct execution: npx tsx e2e/fixtures/seed.ts
if (require.main === module) {
  const arg = process.argv[2]
  if (arg === '--empty') {
    seedEmptyDatabase()
      .then(() => process.exit(0))
      .catch((err) => { console.error(err); process.exit(1); })
  } else if (arg === '--big') {
    seedBigDatabase()
      .then(() => process.exit(0))
      .catch((err) => { console.error(err); process.exit(1); })
  } else {
    seedScratchDatabase()
      .then(() => process.exit(0))
      .catch((err) => { console.error(err); process.exit(1); })
  }
}

