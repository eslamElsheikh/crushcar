// Full flow integration test: create trip -> search -> hold -> checkout -> verify
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

let passed = 0
let failed = 0

function assert(label, condition, details = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.log(`  ✗ ${label} ${details}`)
  }
}

async function main() {
  console.log('\n========== FULL FLOW INTEGRATION TEST ==========\n')

  // ── 1. DATA SETUP ────────────────────────────────────────
  console.log('── 1. Data Setup ──')

  // Find existing trip with stops
  const trip = await prisma.trip.findFirst({
    where: { tripStops: { some: {} } },
    include: {
      tripStops: { orderBy: { stopOrder: 'asc' }, include: { station: true } },
      bus: { include: { layout: { include: { seats: true } } } },
    },
  })

  assert('Trip with stops exists', !!trip, `Found ${trip?.id}`)
  if (!trip) { console.log('No trip with stops found — create one first'); return }

  assert('Trip has at least 2 stops', trip.tripStops.length >= 2, `Has ${trip.tripStops.length} stops`)
  assert('Trip bus has layout seats', (trip.bus?.layout?.seats?.length || 0) > 0, `Has ${trip.bus?.layout?.seats?.length} seats`)

  const [fromStop, toStop] = [trip.tripStops[0], trip.tripStops[trip.tripStops.length - 1]]
  console.log(`  Trip: ${fromStop.station.name} -> ${toStop.station.name}`)

  // Find a user for FK
  const testUser = await prisma.user.findFirst()
  if (!testUser) { console.log('No users found — create one first'); return }
  console.log(`  Test user: ${testUser.name} (${testUser.id})`)
  console.log(`  Route: ${trip.tripStops.map(s => s.station.name).join(' → ')}`)
  console.log(`  Expected price: ${toStop.priceFromOrigin - fromStop.priceFromOrigin}`)

  // ── 2. SEARCH FLOW ───────────────────────────────────────
  console.log('\n── 2. Search (Raw Query) ──')

  const today = new Date().toISOString().split('T')[0]
  const tripDate = trip.departure instanceof Date ? trip.departure.toISOString().split('T')[0] : String(trip.departure).split('T')[0]
  console.log(`  Trip departure date: ${tripDate}, Today: ${today}`)

  // Try without date filter first to see if the basic join works
  const rawQuery = `
    SELECT t.id, t.origin, t.destination, t.departure, t.price,
           fs."stationId" as fromStationId, ts."stationId" as toStationId,
           fs."stopOrder" as fromStopOrder, ts."stopOrder" as toStopOrder,
           fs."priceFromOrigin" as fromPrice, ts."priceFromOrigin" as toPrice,
           (ts."priceFromOrigin" - fs."priceFromOrigin") as calculatedPrice
    FROM "Trip" t
    JOIN "TripStop" fs ON fs."tripId" = t.id
    JOIN "TripStop" ts ON ts."tripId" = t.id
    WHERE fs."stationId" = ? AND ts."stationId" = ?
      AND fs."stopOrder" < ts."stopOrder"
    ORDER BY t.departure ASC
  `

  const rawResults = await prisma.$queryRawUnsafe(rawQuery, fromStop.stationId, toStop.stationId)
  console.log(`  Query returned ${rawResults?.length} result(s)`)
  if (!rawResults?.length) {
    // Debug: check individual parts
    const allStops = await prisma.tripStop.findMany({ where: { tripId: trip.id } })
    console.log(`  Trip stops for this trip:`)
    for (const s of allStops) {
      console.log(`    stopOrder:${s.stopOrder} stationId:${s.stationId} priceFromOrigin:${s.priceFromOrigin}`)
    }
    console.log(`  Searching from:${fromStop.stationId} (stopOrder:${fromStop.stopOrder}) to:${toStop.stationId} (stopOrder:${toStop.stopOrder})`)
    console.log(`  Condition check: fromStop.stopOrder(${fromStop.stopOrder}) < toStop.stopOrder(${toStop.stopOrder}) = ${fromStop.stopOrder < toStop.stopOrder}`)
  }

  assert('Search found the trip', Array.isArray(rawResults) && rawResults.length > 0, `Found ${rawResults?.length} trips`)

  if (rawResults?.length > 0) {
    const r = rawResults[0]
    const expectedPrice = toStop.priceFromOrigin - fromStop.priceFromOrigin
    assert('Calculated price matches', Number(r.calculatedPrice) === expectedPrice,
      `Expected ${expectedPrice}, got ${Number(r.calculatedPrice)}`)
    console.log(`  From: ${r.fromStopOrder} (priceFromOrigin: ${r.fromPrice})`)
    console.log(`  To: ${r.toStopOrder} (priceFromOrigin: ${r.toPrice})`)
    console.log(`  Calculated price: ${Number(r.calculatedPrice)}`)
  }

  // ── 3. HOLD FLOW ─────────────────────────────────────────
  console.log('\n── 3. Seat Hold Flow ──')

  const seatLabel = trip.bus.layout.seats[0].label
  console.log(`  Testing with seat: ${seatLabel}`)

  // Verify no existing hold/booking for this seat+segment
  const existingBooking = await prisma.booking.findFirst({
    where: {
      tripId: trip.id,
      seatLabel,
      status: { in: ['PENDING', 'PAID', 'BOARDED'] },
      fromStopOrder: { lt: toStop.stopOrder },
      toStopOrder: { gt: fromStop.stopOrder },
    },
  })
  assert('Seat is not already booked for this segment', !existingBooking)

  // Create a hold
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000)
  const hold = await prisma.seatHold.create({
    data: {
      tripId: trip.id,
      seatLabel,
      fromStopOrder: fromStop.stopOrder,
      toStopOrder: toStop.stopOrder,
      userId: testUser.id,
      expiresAt,
    },
  })
  assert('Hold created with id', !!hold.id)
  assert('Hold expiry is 2 min in future', hold.expiresAt.getTime() > Date.now())
  console.log(`  Hold ID: ${hold.id}`)
  console.log(`  Expires: ${hold.expiresAt.toISOString()}`)

  // Verify overlap detection (same seat/segment should conflict)
  const holdConflict = await prisma.seatHold.findFirst({
    where: {
      tripId: trip.id,
      seatLabel,
      expiresAt: { gt: new Date() },
      fromStopOrder: { lt: toStop.stopOrder },
      toStopOrder: { gt: fromStop.stopOrder },
    },
  })
  assert('Overlap detection works — hold found', !!holdConflict, 'Should detect existing hold')

  // Verify non-conflicting segment (adjacent) doesn't trigger overlap
  // Test with a seat hold on a different segment
  const midStop = trip.tripStops[Math.floor(trip.tripStops.length / 2)]
  if (midStop && midStop.stopOrder !== fromStop.stopOrder && midStop.stopOrder !== toStop.stopOrder) {
    const adjFrom = fromStop
    const adjTo = midStop
    // Check that our original hold (from->to) doesn't conflict with adjFrom->adjTo
    // This is correct overlap logic: [1,4] doesn't overlap with [1,2] (it contains it)
    // Actually it DOES overlap: [1,4] and [1,2] have fromStopOrder(1) < toStopOrder(2) AND toStopOrder(4) > fromStopOrder(1)
    // So they DO overlap since the seat is held for the entire range 1-4
    // Non-overlapping example: hold [1,2] and another [3,4] - 1<4 and 2>3 -> 1<4 AND 2>3 = true -> OVERLAP
    // Actually: [1,2] vs [3,4]: existingFrom(1) < newTo(4) = true, existingTo(2) > newFrom(3) = false -> NO OVERLAP
    
    // Test a non-overlapping segment
    const nonOverlapStop = trip.tripStops.find(s => s.stopOrder > adjTo.stopOrder)
    if (nonOverlapStop) {
      // SeatHold overlap check for hold [adjTo.stopOrder+1, nonOverlapStop.stopOrder]
      // vs existing hold [fromStop.stopOrder, toStop.stopOrder]
      const testFrom = adjTo.stopOrder + 1
      const testTo = nonOverlapStop.stopOrder
      const wouldOverlap = fromStop.stopOrder < testTo && toStop.stopOrder > testFrom
      console.log(`  Non-overlap test: existing[${fromStop.stopOrder},${toStop.stopOrder}] vs new[${testFrom},${testTo}] → overlap=${wouldOverlap}`)
      assert('Non-adjacent segments do not overlap', !wouldOverlap)
    }
  }

  // Cleanup hold
  await prisma.seatHold.delete({ where: { id: hold.id } })
  assert('Hold cleaned up', true)

  // ── 4. BOOKING FLOW ──────────────────────────────────────
  console.log('\n── 4. Booking Flow ──')

  const ref = `TEST-${Date.now().toString(36).toUpperCase()}`
  const expectedPrice = toStop.priceFromOrigin - fromStop.priceFromOrigin

  // Create a booking
  const booking = await prisma.booking.create({
    data: {
      reference: ref,
      tripId: trip.id,
      seatLabel,
      total: expectedPrice,
      fromStopOrder: fromStop.stopOrder,
      toStopOrder: toStop.stopOrder,
      status: 'PAID',
      userId: testUser.id,
      passengerName: 'Test Passenger',
      paidAt: new Date(),
    },
    include: { trip: { include: { tripStops: { include: { station: true }, orderBy: { stopOrder: 'asc' } } } } },
  })

  assert('Booking created with reference', booking.reference === ref)
  assert('Booking price matches calculated price', booking.total === expectedPrice,
    `Expected ${expectedPrice}, got ${booking.total}`)
  assert('Booking has fromStopOrder', booking.fromStopOrder === fromStop.stopOrder)
  assert('Booking has toStopOrder', booking.toStopOrder === toStop.stopOrder)
  console.log(`  Booking ID: ${booking.id}`)
  console.log(`  Reference: ${booking.reference}`)
  console.log(`  Price: ${booking.total}`)
  console.log(`  Segment: stop ${booking.fromStopOrder} → stop ${booking.toStopOrder}`)

  // Verify trip stops are included
  assert('Booking includes trip stops', booking.trip?.tripStops?.length > 0,
    `Has ${booking.trip?.tripStops?.length} stops`)

  // ── 5. SEGMENT OVERLAP VALIDATION ────────────────────────
  console.log('\n── 5. Segment Overlap Validation ──')

  // Test overlap: same seat, overlapping segment should be detected
  const overlapCheck = await prisma.booking.findFirst({
    where: {
      tripId: trip.id,
      seatLabel,
      status: { in: ['PAID'] },
      fromStopOrder: { lt: toStop.stopOrder },
      toStopOrder: { gt: fromStop.stopOrder },
    },
  })
  assert('Overlap detection finds existing booking', !!overlapCheck)

  // Test non-overlap: different seat should be fine
  const diffSeat = trip.bus.layout.seats.find(s => s.label !== seatLabel)
  if (diffSeat) {
    const diffCheck = await prisma.booking.findFirst({
      where: {
        tripId: trip.id,
        seatLabel: diffSeat.label,
        status: { in: ['PAID'] },
        fromStopOrder: { lt: toStop.stopOrder },
        toStopOrder: { gt: fromStop.stopOrder },
      },
    })
    assert('Different seat has no conflict', !diffCheck)
  }

  // ── 6. PRICE CALCULATION ─────────────────────────────────
  console.log('\n── 6. Price Calculation ──')

  // Test calcPrice equivalent
  function calcPrice(tripStops, fromStationId, toStationId) {
    const fromStop = tripStops.find(s => s.stationId === fromStationId)
    const toStop = tripStops.find(s => s.stationId === toStationId)
    if (fromStop && toStop && fromStop.stopOrder < toStop.stopOrder) {
      return {
        price: toStop.priceFromOrigin - fromStop.priceFromOrigin,
        fromStopOrder: fromStop.stopOrder,
        toStopOrder: toStop.stopOrder,
      }
    }
    return { price: trip.price, fromStopOrder: 1, toStopOrder: tripStops.length }
  }

  const stops = trip.tripStops
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const result = calcPrice(stops, stops[i].stationId, stops[j].stationId)
      const expected = stops[j].priceFromOrigin - stops[i].priceFromOrigin
      assert(`Price ${stops[i].station.name}→${stops[j].station.name}: ${result.price}`,
        result.price === expected, `Expected ${expected}, got ${result.price}`)
    }
  }

  // ── 7. CLEANUP ───────────────────────────────────────────
  console.log('\n── 7. Cleanup ──')
  await prisma.booking.delete({ where: { id: booking.id } })
  assert('Test booking cleaned up', true)

  // ── SUMMARY ──────────────────────────────────────────────
  console.log(`\n========== RESULTS: ${passed} passed, ${failed} failed ==========\n`)

  await prisma.$disconnect()
  if (failed > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
