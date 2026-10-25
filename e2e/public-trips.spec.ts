import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { PrismaClient } from '@prisma/client';
import { seedScratchDatabase } from './fixtures/seed';

/**
 * Option B: a signed-out visitor may browse public trips and read a trip's
 * seat map, while booking and every mutation stay signed-in. These tests
 * guard both halves — the visitor's allowlisted payload (with a deep scan for
 * booking/passenger/payment data anywhere in the response) and the unchanged
 * gates for every signed-in role.
 */

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:../.scratch/e2e.db' } },
});

// Booking identity, passenger data, payment data, company data, and internal
// trip economics. None may appear in a public response at any depth.
const FORBIDDEN_KEYS = [
  'reference', 'bookingId', 'userId', 'user', 'tripId', 'companyId', 'company',
  'passengerName', 'passengerPhone', 'passengerHotel', 'notes', 'hotel', 'phone', 'email',
  'paymentMethod', 'paymentProofUrl', 'paymentNotes', 'paymentStatus',
  'paymentRejectReason', 'paidAt', 'walletBalance', 'total',
  'busPrice', 'busId', 'reservedByCompanyId', 'stopsJson', 'routeKey',
  'travelDate', 'seatHolds', 'expiresAt', 'createdAt', 'stations', 'lat', 'lng',
];

function scan(body: unknown): { keys: string[]; strings: string[] } {
  const keys: string[] = [];
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) { keys.push(k); walk(child); }
    }
  };
  walk(body);
  return { keys, strings };
}

/** The seed writes passenger names and a phone; those and anything
 *  payment-shaped must never surface as values in a public payload.
 *  Scanned over trip payloads — the pagination envelope carries its own
 *  `total` (a trip count), which is not a booking field. */
function expectNoPrivateData(label: string, body: unknown) {
  const { keys, strings } = scan(body);
  const leakedKeys = [...new Set(keys.filter((k) => FORBIDDEN_KEYS.includes(k)))];
  expect(leakedKeys, `${label} leaked forbidden keys`).toEqual([]);
  const suspicious = strings.filter((s) =>
    /^01\d{9}$/.test(s) ||
    /^(\+20|0020)\d{9,10}$/.test(s) ||
    s.includes('Passenger ') ||
    s.includes('/api/uploads/') ||
    /^SLDOUT-/.test(s) ||
    /^BK-/.test(s)
  );
  expect(suspicious, `${label} leaked private values`).toEqual([]);
}

test.describe.serial('Public trips: signed-out browse, signed-in booking', () => {

  test.beforeAll(async () => {
    // Self-contained: whatever the other spec files left behind, the fixture
    // trips these tests pin must exist.
    const trip = await prisma.trip.findUnique({ where: { id: 'trip-normal-40' } });
    if (!trip) await seedScratchDatabase('file:../.scratch/e2e.db');
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── V1–V6: the public API ─────────────────────────────────────────

  test('V1: a visitor can list trips, and only public trips come back', async ({ page }) => {
    const res = await page.request.get('/api/trips?all=true&take=50');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const ids = body.data.map((t: any) => t.id);
    expect(ids).toContain('trip-normal-40');
    expect(ids).toContain('trip-sold-out');
    expect(ids, 'charter trips stay hidden').not.toContain('trip-charter-full');
    expect(ids, 'trip history stays hidden').not.toContain('trip-past');

    const now = Date.now();
    for (const trip of body.data) {
      expect(trip.status).toBe('SCHEDULED');
      expect(new Date(trip.departure).getTime()).toBeGreaterThan(now);
      // The booked count is computed by the server; no rows to count.
      expect(typeof trip.bookedSeats).toBe('number');
    }
    expectNoPrivateData('visitor list', { trips: body.data, returnTrips: body.returnTrips ?? [] });
  });

  test('V2: the admin view knobs are ignored for a visitor', async ({ page }) => {
    const res = await page.request.get('/api/trips?all=true&take=50&status=ALL&bookingMode=BUS');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const ids = body.data.map((t: any) => t.id);
    expect(ids, 'status=ALL must not dump history').not.toContain('trip-past');
    expect(ids, 'bookingMode=BUS must not open the charter list').not.toContain('trip-charter-full');
    expect(body.data.every((t: any) => t.status === 'SCHEDULED')).toBe(true);
    expectNoPrivateData('visitor list with admin knobs', { trips: body.data });
  });

  test('V3: a visitor can run a dated search', async ({ page }) => {
    // Derive the Cairo travel day from the trip itself, so the test does not
    // depend on when the fixture was seeded.
    const detailRes = await page.request.get('/api/trips/trip-normal-40');
    expect(detailRes.status()).toBe(200);
    const detail = await detailRes.json();
    const cairoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' })
      .format(new Date(detail.departure));

    const res = await page.request.get(
      `/api/trips?fromStationId=st-cairo&toStationId=st-hurghada&date=${cairoDate}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.map((t: any) => t.id)).toContain('trip-normal-40');
    expectNoPrivateData('visitor dated search', {
      trips: body.data,
      returnTrips: body.returnTrips ?? [],
    });
  });

  test('V4: the visitor detail is allowlisted, with occupancy but no booking rows', async ({ page }) => {
    // trip-sold-out carries 14 bookings with passenger names — the richest
    // PII fixture in the seed.
    const res = await page.request.get('/api/trips/trip-sold-out');
    expect(res.status()).toBe(200);
    const trip = await res.json();

    expect(trip.id).toBe('trip-sold-out');
    expect(trip.bookedSeats).toBe(14);
    expect(trip.bookings.length).toBe(14);
    for (const row of [...trip.bookings, ...trip.companyBookings]) {
      expect(Object.keys(row).sort()).toEqual(['fromStopOrder', 'seatLabel', 'toStopOrder']);
    }
    expect(trip.bus.layout.seats.length).toBeGreaterThan(0);
    expect(trip.tripStops[0].station.name).toBeTruthy();
    expectNoPrivateData('visitor detail', trip);

    // Fields that ride along on the signed-in payload must not exist here.
    expect(trip.bus.companyId).toBeUndefined();
    expect(trip.busPrice).toBeUndefined();
    expect(trip.reservedByCompanyId).toBeUndefined();
    expect(trip.seatHolds).toBeUndefined();
    expect(trip.companyQuota).toBeNull();
  });

  test('V5: non-public trip ids answer 404 for a visitor', async ({ page }) => {
    for (const id of ['trip-charter-full', 'trip-past', 'trip-does-not-exist']) {
      const res = await page.request.get(`/api/trips/${id}`);
      expect(res.status(), `visitor GET ${id}`).toBe(404);
    }
  });

  test('V6: a company-reserved trip is invisible to visitors, even by direct id', async ({ page, context }) => {
    await loginAs(context, 'superAdmin');
    const createRes = await page.request.post('/api/trips', {
      data: {
        busId: 'bus-coach-40',
        origin: 'القاهرة',
        destination: 'أسوان',
        departure: new Date(Date.now() + 9 * 86400000).toISOString(),
        arrival: new Date(Date.now() + 9 * 86400000 + 6 * 3600000).toISOString(),
        price: 300,
        stops: [
          { stationId: 'st-cairo', stopOrder: 1, priceFromOrigin: 0 },
          { stationId: 'st-aswan', stopOrder: 2, priceFromOrigin: 300 },
        ],
      },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();

    const reserveRes = await page.request.put(`/api/trips/${created.id}`, {
      data: { reservedByCompanyId: 'comp-cairo-express' },
    });
    expect(reserveRes.status()).toBe(200);

    await context.clearCookies();
    const detail = await page.request.get(`/api/trips/${created.id}`);
    expect(detail.status(), 'reserved trip by direct id').toBe(404);
    const list = await (await page.request.get('/api/trips?all=true&take=50')).json();
    expect(list.data.map((t: any) => t.id)).not.toContain(created.id);

    await loginAs(context, 'superAdmin');
    const del = await page.request.delete(`/api/trips/${created.id}`);
    expect(del.status()).toBe(200);
  });

  // ── V7–V8: nothing changed for anyone signed in ───────────────────

  test('V7: a visitor cannot book, hold, list bookings, or modify anything', async ({ page }) => {
    const booking = await page.request.post('/api/bookings', {
      data: {
        tripId: 'trip-normal-40',
        seats: [{ seatLabel: 'B1', fromStopOrder: 1, toStopOrder: 2 }],
        passenger: { name: 'Visitor', phone: '01000000000' },
      },
    });
    expect(booking.status(), 'visitor booking').toBe(401);

    const hold = await page.request.post('/api/seats/hold', {
      data: { tripId: 'trip-normal-40', seatLabel: 'B1', fromStopOrder: 1, toStopOrder: 2 },
    });
    expect(hold.status(), 'visitor seat hold').toBe(401);

    expect((await page.request.get('/api/bookings')).status(), 'visitor booking list').toBe(401);
    expect((await page.request.post('/api/trips', { data: {} })).status(), 'visitor trip create').toBe(401);
    expect((await page.request.put('/api/trips/trip-normal-40', { data: { price: 1 } })).status(), 'visitor trip edit').toBe(401);
    expect((await page.request.delete('/api/trips/trip-normal-40')).status(), 'visitor trip delete').toBe(401);
  });

  test('V8: signed-in roles keep their existing payloads and limits', async ({ page, context }) => {
    await loginAs(context, 'customer');
    const list = await page.request.get('/api/trips?all=true&take=50');
    expect(list.status()).toBe(200);
    expect((await list.json()).data.map((t: any) => t.id)).toContain('trip-normal-40');

    // The customer detail keeps the seat-only occupancy their booking screen
    // has always read — unchanged by the visitor work.
    const soldOut = await page.request.get('/api/trips/trip-sold-out');
    expect(soldOut.status()).toBe(200);
    const trip = await soldOut.json();
    for (const row of trip.bookings) {
      expect(Object.keys(row).sort()).toEqual(['fromStopOrder', 'seatLabel', 'toStopOrder']);
    }
    // A charter trip is still closed to a customer, and a customer still
    // cannot create or delete trips.
    expect((await page.request.get('/api/trips/trip-charter-full')).status()).toBe(404);
    expect((await page.request.post('/api/trips', { data: {} })).status()).toBe(403);
    expect((await page.request.delete('/api/trips/trip-normal-40')).status()).toBe(403);

    // The super admin still sees the charter trip.
    await loginAs(context, 'superAdmin');
    expect((await page.request.get('/api/trips/trip-charter-full')).status()).toBe(200);
  });

  // ── V9–V12: the visitor's screens ─────────────────────────────────

  test('V9: the /trips page lets a visitor search without a login wall', async ({ page }) => {
    await page.goto('/trips?fromStationId=st-cairo&toStationId=st-hurghada');
    // The forced-login card must be gone...
    await expect(page.getByText('سجّل الدخول للبحث')).toHaveCount(0);
    // ...and a real result renders with its trip link.
    const tripLink = page.locator('a[href*="/trips/trip-"]').first();
    await expect(tripLink).toBeVisible({ timeout: 30000 });
  });

  test('V10: a real validation error still shows as itself to a visitor', async ({ page }) => {
    const past = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' })
      .format(new Date(Date.now() - 3 * 86400000));
    await page.goto(`/trips?fromStationId=st-cairo&toStationId=st-hurghada&date=${past}`);
    await expect(page.getByText('هذا التاريخ قد فات، اختر تاريخاً قادماً')).toBeVisible({ timeout: 30000 });
  });

  test('V11: an empty result shows the no-trips state to a visitor', async ({ page }) => {
    // No fixture trip runs Luxor → Aswan, so this is a genuine empty search.
    await page.goto('/trips?fromStationId=st-luxor&toStationId=st-aswan');
    await expect(page.getByText('لا توجد رحلات مطابقة')).toBeVisible({ timeout: 30000 });
  });

  test('V12: a visitor can open a trip detail and is sent to login to book', async ({ page }) => {
    await page.goto('/trips/trip-normal-40');
    const seatBtn = page.locator('button[aria-label*="Seat"]:not([disabled])').first();
    await expect(seatBtn).toBeVisible({ timeout: 30000 });
    await seatBtn.click();

    const bookBtn = page.locator('button:has-text("تأكيد الحجز")').first();
    await expect(bookBtn).toBeVisible({ timeout: 15000 });
    await Promise.all([
      page.waitForURL('**/login'),
      bookBtn.click(),
    ]);
  });
});
