import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Deterministic demo IDs so the script is fully idempotent (re-runnable) ──
const DEMO = {
  trip: (k: string) => `demo-trip-${k}`,
  booking: (k: string) => `DEMO-BK-${k}`,
  companyBooking: (k: string) => `DEMO-CB-${k}`,
  invoice: (k: string) => `DEMO-INV-${k}`,
  walletTx: (k: string) => `demo-wt-${k}`,
  tripRequest: (k: string) => `demo-tr-${k}`,
  depositRequest: (k: string) => `demo-dr-${k}`,
  companyCustomer: (k: string) => `demo-cc-${k}`,
  destination: (k: string) => `demo-dest-${k}`,
}

function at(daysOffset: number, hour = 0, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  d.setHours(hour, minute, 0, 0)
  return d
}

async function main() {
  console.log('🌱 Seeding demo data (idempotent)...')

  // ── Resolve existing stations / buses / users / companies ──
  const stations = await prisma.station.findMany()
  const byName = (n: string) => stations.find((s) => s.name === n)!
  const cairo = byName('القاهرة')
  const alex = byName('الإسكندرية')
  const giza = byName('الجيزة')
  const luxor = byName('الأقصر')
  const aswan = byName('أسوان')
  const hurghada = byName('الغردقة')
  const sharm = byName('شرم الشيخ')
  const mansoura = byName('المنصورة')
  const portsaid = byName('بورسعيد')
  const minya = byName('المنيا')

  const buses = await prisma.bus.findMany()
  const coach = buses.find((b) => b.type === 'COACH_BUS' && b.companyId)!
  const vip = buses.find((b) => b.type === 'VIP_BUS')!
  const mini = buses.find((b) => b.type === 'MINI_BUS')!

  const users = await prisma.user.findMany()
  const customer = users.find((u) => u.email === 'user@example.com')!
  const fatma = users.find((u) => u.email === 'fatma@example.com')!
  const ali = users.find((u) => u.email === 'ali@example.com')!

  const companies = await prisma.company.findMany()
  const cairoExpress = companies.find((c) => c.subdomain === 'cairoexpress')!
  const monsters = companies.find((c) => c.subdomain === '-mpbt9tij')!

  // ── Helper: upsert a trip with stops ──
  async function upsertTrip(opts: {
    key: string
    busId: string
    stops: { station: any; priceFromOrigin: number; travelMinFromPrev: number }[]
    daysOffset: number
    departHour: number
    departMin?: number
    status: string
  }) {
    const departure = at(opts.daysOffset, opts.departHour, opts.departMin ?? 0)
    let cursor = departure
    const stops = opts.stops.map((s, i) => {
      if (i > 0) cursor = new Date(cursor.getTime() + s.travelMinFromPrev * 60000)
      return {
        stationId: s.station.id,
        stopOrder: i,
        priceFromOrigin: s.priceFromOrigin,
        arrivalTime: i === 0 ? null : cursor,
        departureTime: i === 0 ? departure : cursor,
      }
    })
    const arrival = cursor
    const origin = opts.stops[0].station.name
    const destination = opts.stops[opts.stops.length - 1].station.name
    const price = opts.stops[opts.stops.length - 1].priceFromOrigin

    const existing = await prisma.trip.findUnique({ where: { id: DEMO.trip(opts.key) } })
    if (existing) {
      await prisma.tripStop.deleteMany({ where: { tripId: existing.id } })
      await prisma.trip.update({
        where: { id: existing.id },
        data: { busId: opts.busId, origin, destination, departure, arrival, price, status: opts.status },
      })
      await prisma.tripStop.createMany({ data: stops.map((s) => ({ ...s, tripId: existing.id })) })
      return existing
    }
    return prisma.trip.create({
      data: {
        id: DEMO.trip(opts.key),
        busId: opts.busId,
        origin,
        destination,
        departure,
        arrival,
        price,
        status: opts.status,
        tripStops: { create: stops },
      },
    })
  }

  // ══════════════════════════════════════════════════════════════
  // FUTURE TRIPS (bookable) — round-trip pairs on same/adjacent days
  // ══════════════════════════════════════════════════════════════
  const futureTrips: Record<string, any> = {}

  // Cairo <-> Alexandria (round trip day 1)
  futureTrips.caiAlexOut = await upsertTrip({
    key: 'cai-alex-out-1', busId: coach.id, daysOffset: 1, departHour: 8, status: 'SCHEDULED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: giza, priceFromOrigin: 80, travelMinFromPrev: 45 },
      { station: alex, priceFromOrigin: 250, travelMinFromPrev: 180 },
    ],
  })
  futureTrips.caiAlexRet = await upsertTrip({
    key: 'alex-cai-ret-1', busId: coach.id, daysOffset: 1, departHour: 18, status: 'SCHEDULED',
    stops: [
      { station: alex, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: giza, priceFromOrigin: 170, travelMinFromPrev: 180 },
      { station: cairo, priceFromOrigin: 250, travelMinFromPrev: 45 },
    ],
  })

  // Cairo <-> Hurghada (round trip day 2)
  futureTrips.caiHurOut = await upsertTrip({
    key: 'cai-hur-out-2', busId: vip.id, daysOffset: 2, departHour: 7, status: 'SCHEDULED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: hurghada, priceFromOrigin: 450, travelMinFromPrev: 360 },
    ],
  })
  futureTrips.caiHurRet = await upsertTrip({
    key: 'hur-cai-ret-2', busId: vip.id, daysOffset: 3, departHour: 12, status: 'SCHEDULED',
    stops: [
      { station: hurghada, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: cairo, priceFromOrigin: 450, travelMinFromPrev: 360 },
    ],
  })

  // Cairo <-> Luxor (round trip day 3)
  futureTrips.caiLuxOut = await upsertTrip({
    key: 'cai-lux-out-3', busId: coach.id, daysOffset: 3, departHour: 6, status: 'SCHEDULED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: minya, priceFromOrigin: 200, travelMinFromPrev: 240 },
      { station: luxor, priceFromOrigin: 550, travelMinFromPrev: 300 },
    ],
  })
  futureTrips.caiLuxRet = await upsertTrip({
    key: 'lux-cai-ret-3', busId: coach.id, daysOffset: 4, departHour: 10, status: 'SCHEDULED',
    stops: [
      { station: luxor, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: minya, priceFromOrigin: 350, travelMinFromPrev: 300 },
      { station: cairo, priceFromOrigin: 550, travelMinFromPrev: 240 },
    ],
  })

  // Cairo <-> Sharm (one-way future)
  futureTrips.caiSharm = await upsertTrip({
    key: 'cai-sharm-4', busId: vip.id, daysOffset: 4, departHour: 5, status: 'SCHEDULED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: sharm, priceFromOrigin: 700, travelMinFromPrev: 420 },
    ],
  })

  // Alexandria <-> Port Said (future)
  futureTrips.alexPsaid = await upsertTrip({
    key: 'alex-psaid-5', busId: mini.id, daysOffset: 5, departHour: 9, status: 'SCHEDULED',
    stops: [
      { station: alex, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: portsaid, priceFromOrigin: 180, travelMinFromPrev: 210 },
    ],
  })

  // Cairo <-> Mansoura (future)
  futureTrips.caiMans = await upsertTrip({
    key: 'cai-mans-6', busId: coach.id, daysOffset: 6, departHour: 11, status: 'SCHEDULED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: mansoura, priceFromOrigin: 200, travelMinFromPrev: 180 },
    ],
  })

  // Giza <-> Aswan (future)
  futureTrips.gizaAswan = await upsertTrip({
    key: 'giza-aswan-7', busId: vip.id, daysOffset: 7, departHour: 6, status: 'SCHEDULED',
    stops: [
      { station: giza, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: aswan, priceFromOrigin: 600, travelMinFromPrev: 570 },
    ],
  })

  // ══════════════════════════════════════════════════════════════
  // PAST TRIPS (completed) — for booking history
  // ══════════════════════════════════════════════════════════════
  const pastTrips: Record<string, any> = {}

  pastTrips.pastCaiAlex = await upsertTrip({
    key: 'past-cai-alex', busId: coach.id, daysOffset: -10, departHour: 8, status: 'COMPLETED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: alex, priceFromOrigin: 250, travelMinFromPrev: 210 },
    ],
  })
  pastTrips.pastCaiLux = await upsertTrip({
    key: 'past-cai-lux', busId: coach.id, daysOffset: -14, departHour: 6, status: 'COMPLETED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: luxor, priceFromOrigin: 550, travelMinFromPrev: 540 },
    ],
  })
  pastTrips.pastCaiHur = await upsertTrip({
    key: 'past-cai-hur', busId: vip.id, daysOffset: -20, departHour: 7, status: 'COMPLETED',
    stops: [
      { station: cairo, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: hurghada, priceFromOrigin: 450, travelMinFromPrev: 360 },
    ],
  })
  pastTrips.pastAlexCai = await upsertTrip({
    key: 'past-alex-cai', busId: coach.id, daysOffset: -25, departHour: 16, status: 'COMPLETED',
    stops: [
      { station: alex, priceFromOrigin: 0, travelMinFromPrev: 0 },
      { station: cairo, priceFromOrigin: 250, travelMinFromPrev: 210 },
    ],
  })

  console.log(`✅ Trips: ${Object.keys(futureTrips).length} future + ${Object.keys(pastTrips).length} past`)

  // ══════════════════════════════════════════════════════════════
  // CUSTOMER BOOKINGS — past (history) + future + round-trip
  // ══════════════════════════════════════════════════════════════
  async function upsertBooking(opts: {
    key: string
    userId: string
    tripId: string
    seatLabel: string
    status: string
    fromStopOrder?: number
    toStopOrder?: number
    total: number
    passengerName?: string
    passengerPhone?: string
    paidAt?: Date | null
    boarded?: boolean
    boardedAt?: Date | null
    roundTripGroupId?: string | null
    returnForId?: string | null
    cancelledAt?: Date | null
    cancelledBy?: string | null
    cancellationReason?: string
    refundAmount?: number | null
    cancellationFee?: number | null
    refundProcessedAt?: Date | null
    refundProcessedBy?: string | null
    createdAt?: Date
  }) {
    const existing = await prisma.booking.findUnique({ where: { reference: DEMO.booking(opts.key) } })
    const data = {
      userId: opts.userId,
      tripId: opts.tripId,
      seatLabel: opts.seatLabel,
      status: opts.status,
      fromStopOrder: opts.fromStopOrder ?? 0,
      toStopOrder: opts.toStopOrder ?? 1,
      total: opts.total,
      passengerName: opts.passengerName ?? '',
      passengerPhone: opts.passengerPhone ?? '',
      paidAt: opts.paidAt ?? null,
      boarded: opts.boarded ?? false,
      boardedAt: opts.boardedAt ?? null,
      roundTripGroupId: opts.roundTripGroupId ?? null,
      returnForId: opts.returnForId ?? null,
      cancelledAt: opts.cancelledAt ?? null,
      cancelledBy: opts.cancelledBy ?? null,
      cancellationReason: opts.cancellationReason ?? '',
      refundAmount: opts.refundAmount ?? null,
      cancellationFee: opts.cancellationFee ?? null,
      refundProcessedAt: opts.refundProcessedAt ?? null,
      refundProcessedBy: opts.refundProcessedBy ?? null,
      createdAt: opts.createdAt ?? new Date(),
    }
    if (existing) {
      await prisma.booking.update({ where: { id: existing.id }, data })
      return existing
    }
    return prisma.booking.create({ data: { id: DEMO.booking(opts.key), reference: DEMO.booking(opts.key), ...data } })
  }

  // Past bookings (history) — PAID + BOARDED
  await upsertBooking({
    key: 'past-1', userId: customer.id, tripId: pastTrips.pastCaiAlex.id, seatLabel: 'A1',
    status: 'BOARDED', total: 250, passengerName: 'Mohamed Customer', passengerPhone: '01012345678',
    paidAt: at(-12, 10), boarded: true, boardedAt: at(-10, 7, 45), createdAt: at(-12, 10),
  })
  await upsertBooking({
    key: 'past-2', userId: customer.id, tripId: pastTrips.pastCaiLux.id, seatLabel: 'B2',
    status: 'BOARDED', total: 550, passengerName: 'Mohamed Customer', passengerPhone: '01012345678',
    paidAt: at(-16, 9), boarded: true, boardedAt: at(-14, 5, 50), createdAt: at(-16, 9),
  })
  await upsertBooking({
    key: 'past-3', userId: fatma.id, tripId: pastTrips.pastCaiHur.id, seatLabel: 'A1',
    status: 'BOARDED', total: 450, passengerName: 'Fatma Hassan', passengerPhone: '01123456789',
    paidAt: at(-22, 14), boarded: true, boardedAt: at(-20, 6, 50), createdAt: at(-22, 14),
  })
  // Past cancelled booking with refund
  await upsertBooking({
    key: 'past-cancel-1', userId: customer.id, tripId: pastTrips.pastAlexCai.id, seatLabel: 'C3',
    status: 'CANCELLED', total: 250, passengerName: 'Mohamed Customer',
    paidAt: at(-27, 11), cancelledAt: at(-26, 9), cancelledBy: 'customer',
    cancellationReason: 'Change of plans', refundAmount: 125, cancellationFee: 125,
    refundProcessedAt: at(-25, 10), refundProcessedBy: 'superadmin', createdAt: at(-27, 11),
  })

  // Future bookings — PENDING + PAID
  await upsertBooking({
    key: 'future-1', userId: customer.id, tripId: futureTrips.caiAlexOut.id, seatLabel: 'A1',
    status: 'PAID', total: 250, passengerName: 'Mohamed Customer', passengerPhone: '01012345678',
    paidAt: at(0, 9), createdAt: at(0, 8),
  })
  await upsertBooking({
    key: 'future-2', userId: fatma.id, tripId: futureTrips.caiHurOut.id, seatLabel: 'A2',
    status: 'PENDING', total: 450, passengerName: 'Fatma Hassan', passengerPhone: '01123456789',
    createdAt: at(0, 7),
  })

  // Round-trip group (outbound + return linked)
  const rtGroup = 'demo-rt-group-1'
  const outB = await upsertBooking({
    key: 'rt-out', userId: customer.id, tripId: futureTrips.caiAlexOut.id, seatLabel: 'B1',
    status: 'PAID', total: 250, passengerName: 'Mohamed Customer', passengerPhone: '01012345678',
    paidAt: at(0, 9), roundTripGroupId: rtGroup, createdAt: at(0, 8),
  })
  await upsertBooking({
    key: 'rt-ret', userId: customer.id, tripId: futureTrips.caiAlexRet.id, seatLabel: 'B1',
    status: 'PAID', total: 250, passengerName: 'Mohamed Customer', passengerPhone: '01012345678',
    paidAt: at(0, 9), roundTripGroupId: rtGroup, returnForId: outB.id, createdAt: at(0, 8),
  })

  console.log('✅ Customer bookings seeded')

  // ══════════════════════════════════════════════════════════════
  // COMPANY BOOKINGS (for company dashboard)
  // ══════════════════════════════════════════════════════════════
  async function upsertCompanyBooking(opts: {
    key: string
    companyId: string
    customerId?: string | null
    tripId: string
    seatLabel: string
    status: string
    total: number
    bookingType?: string
    paidFromWallet?: number
    paidOnCredit?: number
    passengerName?: string
    fromStopOrder?: number
    toStopOrder?: number
    paidAt?: Date | null
    createdAt?: Date
  }) {
    const existing = await prisma.companyBooking.findUnique({ where: { reference: DEMO.companyBooking(opts.key) } })
    const data = {
      companyId: opts.companyId,
      customerId: opts.customerId ?? null,
      tripId: opts.tripId,
      seatLabel: opts.seatLabel,
      status: opts.status,
      total: opts.total,
      bookingType: opts.bookingType ?? 'FOR_EMPLOYEE',
      paidFromWallet: opts.paidFromWallet ?? 0,
      paidOnCredit: opts.paidOnCredit ?? 0,
      passengerName: opts.passengerName ?? '',
      fromStopOrder: opts.fromStopOrder ?? 0,
      toStopOrder: opts.toStopOrder ?? 1,
      paidAt: opts.paidAt ?? null,
      createdAt: opts.createdAt ?? new Date(),
    }
    if (existing) {
      await prisma.companyBooking.update({ where: { id: existing.id }, data })
      return existing
    }
    return prisma.companyBooking.create({ data: { id: DEMO.companyBooking(opts.key), reference: DEMO.companyBooking(opts.key), ...data } })
  }

  await upsertCompanyBooking({
    key: 'cb-1', companyId: cairoExpress.id, tripId: futureTrips.caiAlexOut.id, seatLabel: 'A2',
    status: 'PAID', total: 250, bookingType: 'FOR_EMPLOYEE', paidFromWallet: 250,
    passengerName: 'Ahmed Admin', paidAt: at(0, 8), createdAt: at(0, 8),
  })
  await upsertCompanyBooking({
    key: 'cb-2', companyId: cairoExpress.id, tripId: futureTrips.caiLuxOut.id, seatLabel: 'A1',
    status: 'PENDING', total: 550, bookingType: 'FOR_CLIENT', paidOnCredit: 550,
    passengerName: 'Company Client', createdAt: at(0, 6),
  })
  await upsertCompanyBooking({
    key: 'cb-3', companyId: monsters.id, tripId: futureTrips.caiHurOut.id, seatLabel: 'A1',
    status: 'PAID', total: 450, bookingType: 'FOR_EMPLOYEE', paidFromWallet: 450,
    passengerName: 'Monster Employee', paidAt: at(-1, 15), createdAt: at(-1, 15),
  })
  await upsertCompanyBooking({
    key: 'cb-4', companyId: monsters.id, tripId: pastTrips.pastCaiAlex.id, seatLabel: 'B1',
    status: 'BOARDED', total: 250, bookingType: 'FOR_EMPLOYEE', paidFromWallet: 250,
    passengerName: 'Monster Employee 2', paidAt: at(-11, 10), createdAt: at(-11, 10),
  })

  console.log('✅ Company bookings seeded')

  // ══════════════════════════════════════════════════════════════
  // COMPANY CUSTOMERS
  // ══════════════════════════════════════════════════════════════
  async function upsertCompanyCustomer(opts: { key: string; companyId: string; name: string; email?: string; phone?: string; notes?: string }) {
    const existing = await prisma.companyCustomer.findUnique({ where: { id: DEMO.companyCustomer(opts.key) } })
    const data = { companyId: opts.companyId, name: opts.name, email: opts.email ?? null, phone: opts.phone ?? null, notes: opts.notes ?? '' }
    if (existing) {
      await prisma.companyCustomer.update({ where: { id: existing.id }, data })
      return existing
    }
    return prisma.companyCustomer.create({ data: { id: DEMO.companyCustomer(opts.key), ...data } })
  }

  const cc1 = await upsertCompanyCustomer({ key: 'cc-1', companyId: cairoExpress.id, name: 'Acme Corp', email: 'travel@acme.com', phone: '01000000001', notes: 'Monthly corporate contract' })
  const cc2 = await upsertCompanyCustomer({ key: 'cc-2', companyId: cairoExpress.id, name: 'TechStart Ltd', email: 'hr@techstart.com', phone: '01000000002' })
  const cc3 = await upsertCompanyCustomer({ key: 'cc-3', companyId: monsters.id, name: 'Monster Client A', email: 'a@monster.com', phone: '01000000003' })

  console.log('✅ Company customers seeded')

  // ══════════════════════════════════════════════════════════════
  // INVOICES
  // ══════════════════════════════════════════════════════════════
  async function upsertInvoice(opts: {
    key: string
    companyId: string
    periodStart: Date
    periodEnd: Date
    totalAmount: number
    paidAmount?: number
    status: string
    dueDate: Date
    paidAt?: Date | null
    notes?: string
  }) {
    const existing = await prisma.invoice.findUnique({ where: { id: DEMO.invoice(opts.key) } })
    const data = {
      companyId: opts.companyId, periodStart: opts.periodStart, periodEnd: opts.periodEnd,
      totalAmount: opts.totalAmount, paidAmount: opts.paidAmount ?? 0, status: opts.status,
      dueDate: opts.dueDate, paidAt: opts.paidAt ?? null, notes: opts.notes ?? '',
    }
    if (existing) {
      await prisma.invoice.update({ where: { id: existing.id }, data })
      return existing
    }
    return prisma.invoice.create({ data: { id: DEMO.invoice(opts.key), ...data } })
  }

  await upsertInvoice({
    key: 'inv-1', companyId: cairoExpress.id, periodStart: at(-30), periodEnd: at(-1),
    totalAmount: 1200, paidAmount: 1200, status: 'PAID', dueDate: at(-5), paidAt: at(-10),
  })
  await upsertInvoice({
    key: 'inv-2', companyId: cairoExpress.id, periodStart: at(-1), periodEnd: at(29),
    totalAmount: 800, paidAmount: 300, status: 'PARTIAL', dueDate: at(15),
  })
  await upsertInvoice({
    key: 'inv-3', companyId: monsters.id, periodStart: at(-45), periodEnd: at(-16),
    totalAmount: 2000, paidAmount: 0, status: 'OVERDUE', dueDate: at(-10),
  })
  await upsertInvoice({
    key: 'inv-4', companyId: monsters.id, periodStart: at(-1), periodEnd: at(29),
    totalAmount: 1500, paidAmount: 1500, status: 'PAID', dueDate: at(20), paidAt: at(5),
  })

  console.log('✅ Invoices seeded')

  // ══════════════════════════════════════════════════════════════
  // WALLET TRANSACTIONS
  // ══════════════════════════════════════════════════════════════
  async function upsertWalletTx(opts: { key: string; companyId: string; type: string; amount: number; description?: string; reference?: string; createdAt?: Date }) {
    const existing = await prisma.walletTransaction.findUnique({ where: { id: DEMO.walletTx(opts.key) } })
    const data = {
      companyId: opts.companyId, type: opts.type, amount: opts.amount,
      description: opts.description ?? '', reference: opts.reference ?? '',
      createdAt: opts.createdAt ?? new Date(),
    }
    if (existing) {
      await prisma.walletTransaction.update({ where: { id: existing.id }, data })
      return existing
    }
    return prisma.walletTransaction.create({ data: { id: DEMO.walletTx(opts.key), ...data } })
  }

  await upsertWalletTx({ key: 'wt-1', companyId: cairoExpress.id, type: 'DEPOSIT', amount: 5000, description: 'Bank transfer deposit', createdAt: at(-30) })
  await upsertWalletTx({ key: 'wt-2', companyId: cairoExpress.id, type: 'BOOKING_CHARGE', amount: -250, description: 'Booking charge', reference: DEMO.companyBooking('cb-1'), createdAt: at(0) })
  await upsertWalletTx({ key: 'wt-3', companyId: cairoExpress.id, type: 'REFUND', amount: 125, description: 'Cancellation refund', createdAt: at(-25) })
  await upsertWalletTx({ key: 'wt-4', companyId: monsters.id, type: 'DEPOSIT', amount: 10000, description: 'Initial deposit', createdAt: at(-40) })
  await upsertWalletTx({ key: 'wt-5', companyId: monsters.id, type: 'BOOKING_CHARGE', amount: -450, description: 'Booking charge', reference: DEMO.companyBooking('cb-3'), createdAt: at(-1) })
  await upsertWalletTx({ key: 'wt-6', companyId: monsters.id, type: 'ADJUSTMENT', amount: 500, description: 'Admin adjustment', createdAt: at(-5) })

  console.log('✅ Wallet transactions seeded')

  // ══════════════════════════════════════════════════════════════
  // TRIP REQUESTS
  // ══════════════════════════════════════════════════════════════
  async function upsertTripRequest(opts: {
    key: string; companyId: string; fromStationId: string; toStationId: string;
    passengerCount: number; date: Date; notes?: string; status?: string; adminNotes?: string;
  }) {
    const existing = await prisma.tripRequest.findUnique({ where: { id: DEMO.tripRequest(opts.key) } })
    const data = {
      companyId: opts.companyId, fromStationId: opts.fromStationId, toStationId: opts.toStationId,
      passengerCount: opts.passengerCount, date: opts.date, notes: opts.notes ?? '',
      status: opts.status ?? 'PENDING', adminNotes: opts.adminNotes ?? '',
    }
    if (existing) {
      await prisma.tripRequest.update({ where: { id: existing.id }, data })
      return existing
    }
    return prisma.tripRequest.create({ data: { id: DEMO.tripRequest(opts.key), ...data } })
  }

  await upsertTripRequest({ key: 'tr-1', companyId: cairoExpress.id, fromStationId: cairo.id, toStationId: alex.id, passengerCount: 15, date: at(10), notes: 'Group booking for event', status: 'PENDING' })
  await upsertTripRequest({ key: 'tr-2', companyId: cairoExpress.id, fromStationId: cairo.id, toStationId: hurghada.id, passengerCount: 8, date: at(15), status: 'APPROVED', adminNotes: 'Scheduled for next week' })
  await upsertTripRequest({ key: 'tr-3', companyId: monsters.id, fromStationId: giza.id, toStationId: aswan.id, passengerCount: 20, date: at(20), status: 'PENDING' })
  await upsertTripRequest({ key: 'tr-4', companyId: monsters.id, fromStationId: alex.id, toStationId: portsaid.id, passengerCount: 5, date: at(-5), status: 'REJECTED', adminNotes: 'No available buses' })

  console.log('✅ Trip requests seeded')

  // ══════════════════════════════════════════════════════════════
  // DEPOSIT REQUESTS
  // ══════════════════════════════════════════════════════════════
  async function upsertDepositRequest(opts: { key: string; companyId: string; amount: number; status?: string; adminNotes?: string }) {
    const existing = await prisma.depositRequest.findUnique({ where: { id: DEMO.depositRequest(opts.key) } })
    const data = { companyId: opts.companyId, amount: opts.amount, status: opts.status ?? 'PENDING', adminNotes: opts.adminNotes ?? '' }
    if (existing) {
      await prisma.depositRequest.update({ where: { id: existing.id }, data })
      return existing
    }
    return prisma.depositRequest.create({ data: { id: DEMO.depositRequest(opts.key), ...data } })
  }

  await upsertDepositRequest({ key: 'dr-1', companyId: cairoExpress.id, amount: 3000, status: 'PENDING' })
  await upsertDepositRequest({ key: 'dr-2', companyId: monsters.id, amount: 5000, status: 'APPROVED', adminNotes: 'Processed via bank transfer' })
  await upsertDepositRequest({ key: 'dr-3', companyId: cairoExpress.id, amount: 2000, status: 'REJECTED', adminNotes: 'Insufficient documentation' })

  console.log('✅ Deposit requests seeded')

  // ══════════════════════════════════════════════════════════════
  // FAQS (only if empty)
  // ══════════════════════════════════════════════════════════════
  const faqCount = await prisma.faq.count()
  if (faqCount === 0) {
    const defaultFaqs = [
      { questionAr: 'إزاي أحجز تذكرة؟', questionEn: 'How do I book a ticket?', answerAr: 'ادخل على صفحة الرحلات، اختار المحطة والتاريخ، اختار مقعدك، وادفع أونلاين. هيوصلك تأكيد على الإيميل فوراً.', answerEn: 'Go to the trips page, select your station and date, choose your seat, and pay online. You\'ll receive instant email confirmation.' },
      { questionAr: 'إيه هي سياسة الإلغاء والاسترجاع؟', questionEn: 'What is the cancellation and refund policy?', answerAr: 'أكثر من 24 ساعة قبل المغادرة: استرداد 100% مجاناً.\n12-24 ساعة: استرداد 50%.\n4-12 ساعة: استرداد 25%.\nأقل من 4 ساعات أو بعد المغادرة: لا يوجد استرداد.', answerEn: 'More than 24 hours before departure: 100% full refund.\n12-24 hours: 50% refund.\n4-12 hours: 25% refund.\nLess than 4 hours or after departure: No refund.' },
      { questionAr: 'إيه طرق الدفع المتاحة؟', questionEn: 'What payment methods are available?', answerAr: 'الدفع نقداً عند المحطة أو عن طريق التحويل البنكي. بعد الحجز هيتم تأكيد الحجز بعد ما الأدمن يستلم الدفع.', answerEn: 'Cash payment at the station or bank transfer. After booking, your reservation will be confirmed once admin receives payment.' },
      { questionAr: 'أقدر أغير مقعدي بعد الحجز؟', questionEn: 'Can I change my seat after booking?', answerAr: 'حالياً مش ممكن تغيير المقعد بعد تأكيد الحجز. لو محتاج تغيير، ممكن تلغي الحجز وتحجز تاني حسب سياسة الإلغاء.', answerEn: 'Currently, seat changes are not possible after confirmation. If needed, you can cancel and rebook according to our cancellation policy.' },
      { questionAr: 'إزاي أطبع تذكرتي؟', questionEn: 'How do I print my ticket?', answerAr: 'بعد الدفع، هتقدر تطبع التذكرة من صفحة حجوزاتك. كمان ممكن تعرضها من الموبايل عند الصعود.', answerEn: 'After payment, you can print your ticket from your bookings page. You can also show it on your mobile phone when boarding.' },
      { questionAr: 'هل ممكن أحجز لأكثر من شخص؟', questionEn: 'Can I book for multiple people?', answerAr: 'أيوا، تقدر تحجز أكثر من مقعد في نفس الرحلة. كل مقعد هيبقى له رقم حجز منفصل.', answerEn: 'Yes, you can book multiple seats on the same trip. Each seat will have its own booking reference.' },
      { questionAr: 'إمتى لازم أكون في المحطة؟', questionEn: 'When should I arrive at the station?', answerAr: 'ننصح بالوصول قبل موعد المغادرة بـ 30 دقيقة على الأقل عشان عملية الصعود تتم بهدوء.', answerEn: 'We recommend arriving at least 30 minutes before departure for a smooth boarding process.' },
      { questionAr: 'هل الباصات فيها WiFi وشواحن؟', questionEn: 'Do the buses have WiFi and chargers?', answerAr: 'معظم باصاتنا مجهزة بـ WiFi وشواحن USB. المميزات بتختلف حسب نوع الباص والرحلة.', answerEn: 'Most of our buses are equipped with WiFi and USB chargers. Amenities vary by bus type and trip.' },
    ]
    await prisma.faq.createMany({ data: defaultFaqs.map((f, i) => ({ ...f, order: i + 1 })) })
    console.log('✅ 8 FAQs seeded')
  } else {
    console.log(`ℹ️  FAQs already exist (${faqCount}), skipping`)
  }

  // ══════════════════════════════════════════════════════════════
  // DESTINATIONS (add a few more if room)
  // ══════════════════════════════════════════════════════════════
  const existingDests = await prisma.destination.findMany()
  const existingSlugs = new Set(existingDests.map((d) => d.slug))
  const newDests = [
    { slug: 'demo-dest-aswan', nameAr: 'أسوان', nameEn: 'Aswan', sortOrder: 5 },
    { slug: 'demo-dest-luxor', nameAr: 'الأقصر', nameEn: 'Luxor', sortOrder: 6 },
    { slug: 'demo-dest-sharm', nameAr: 'شرم الشيخ', nameEn: 'Sharm El Sheikh', sortOrder: 7 },
    { slug: 'demo-dest-hurghada', nameAr: 'الغردقة', nameEn: 'Hurghada', sortOrder: 8 },
  ]
  for (const d of newDests) {
    if (existingSlugs.has(d.slug)) continue
    await prisma.destination.create({ data: { ...d, imageUrl: null, isActive: true } })
  }
  console.log('✅ Destinations ensured')

  // ── Summary ──
  console.log('')
  console.log('📊 Final counts:')
  console.log(`   Trips: ${await prisma.trip.count()} (future scheduled: ${await prisma.trip.count({ where: { status: 'SCHEDULED', departure: { gt: new Date() } } })})`)
  console.log(`   Bookings: ${await prisma.booking.count()}`)
  console.log(`   CompanyBookings: ${await prisma.companyBooking.count()}`)
  console.log(`   CompanyCustomers: ${await prisma.companyCustomer.count()}`)
  console.log(`   Invoices: ${await prisma.invoice.count()}`)
  console.log(`   WalletTransactions: ${await prisma.walletTransaction.count()}`)
  console.log(`   TripRequests: ${await prisma.tripRequest.count()}`)
  console.log(`   DepositRequests: ${await prisma.depositRequest.count()}`)
  console.log(`   FAQs: ${await prisma.faq.count()}`)
  console.log(`   Destinations: ${await prisma.destination.count()}`)
  console.log('')
  console.log('✅ Demo seed completed! (idempotent — safe to re-run)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
