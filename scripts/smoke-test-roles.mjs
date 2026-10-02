import { PrismaClient } from '@prisma/client';
import { encode } from '@auth/core/jwt';

const BASE_URL = 'http://127.0.0.1:3002';
const AUTH_SECRET = 'M1fX/C7/V+C/C/AVeI5lmi5FQoJulgZ4bE942NH691I=';
const DB_URL = 'file:d:/saas/desing/d 2/.scratch/dev-v2-smoke.db';

const prisma = new PrismaClient({
  datasources: { db: { url: DB_URL } },
});

async function makeToken(user) {
  return await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId || undefined,
      sub: user.id,
    },
    secret: AUTH_SECRET,
    salt: 'next-auth.session-token',
  });
}

function reqHeaders(token, isJson = true) {
  const headers = {
    Cookie: `next-auth.session-token=${token}`,
  };
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function runSmokeTests() {
  console.log('Starting Smoke Tests against', BASE_URL, 'and DB', DB_URL);

  const results = [];

  // Helper to record
  function record(action, role, endpoint, method, expected, actual, dbVerified, details = '') {
    const passed = dbVerified && actual.includes(expected.split(' ')[0]);
    results.push({
      action,
      role,
      endpointMethod: `${method} ${endpoint}`,
      expected,
      actual,
      dbVerified: dbVerified ? 'Y' : 'N',
      details,
    });
    console.log(`${dbVerified ? '✓' : '✗'} [${role}] ${action}: ${method} ${endpoint} -> ${actual} (DB: ${dbVerified ? 'Y' : 'N'})`);
  }

  // 1. Get or create test users for each role
  let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: { name: 'Super Admin', email: 'superadmin_smoke@test.com', password: 'hashed', role: 'SUPER_ADMIN' }
    });
  }

  let company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: 'Test Smoke Co', subdomain: 'smokeco', isActive: true, walletBalance: 10000, creditLimit: 50000 }
    });
  }

  let companyAdmin = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: company.id } });
  if (!companyAdmin) {
    companyAdmin = await prisma.user.create({
      data: { name: 'Company Admin', email: 'companyadmin_smoke@test.com', password: 'hashed', role: 'COMPANY_ADMIN', companyId: company.id }
    });
  }

  let customer = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
  if (!customer) {
    customer = await prisma.user.create({
      data: { name: 'Customer Test', email: 'customer_smoke@test.com', password: 'hashed', role: 'CUSTOMER' }
    });
  }

  const superToken = await makeToken(superAdmin);
  const companyToken = await makeToken(companyAdmin);
  const customerToken = await makeToken(customer);

  // =========================================================================
  // SECTION 1: SUPER_ADMIN ACTIONS
  // =========================================================================
  console.log('\n--- SUPER_ADMIN TESTS ---');

  // 1.1 Bus Create
  let createdBusId = null;
  try {
    const res = await fetch(`${BASE_URL}/api/buses`, {
      method: 'POST',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ name: 'Smoke Express Bus', type: 'STANDARD', seatCount: 20 }),
    });
    const data = await res.json();
    createdBusId = data.id;
    const dbBus = createdBusId ? await prisma.bus.findUnique({ where: { id: createdBusId } }) : null;
    record('bus create', 'SUPER_ADMIN', '/api/buses', 'POST', '200 OK', `${res.status} ${res.ok ? 'OK' : 'ERR'}`, !!dbBus && dbBus.name === 'Smoke Express Bus');
  } catch (err) {
    record('bus create', 'SUPER_ADMIN', '/api/buses', 'POST', '200 OK', err.message, false);
  }

  // 1.2 Bus Edit
  if (createdBusId) {
    try {
      const res = await fetch(`${BASE_URL}/api/buses/${createdBusId}`, {
        method: 'PUT',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ name: 'Smoke Express Bus Updated', type: 'VIP', seatCount: 20 }),
      });
      const dbBus = await prisma.bus.findUnique({ where: { id: createdBusId } });
      record('bus edit', 'SUPER_ADMIN', `/api/buses/${createdBusId}`, 'PUT', '200 OK', `${res.status}`, dbBus?.name === 'Smoke Express Bus Updated');
    } catch (err) {
      record('bus edit', 'SUPER_ADMIN', `/api/buses/${createdBusId}`, 'PUT', '200 OK', err.message, false);
    }
  }

  // 1.3 Seat Layout Save
  if (createdBusId) {
    try {
      const seats = [
        { label: 'A1', row: 1, col: 1, type: 'SEAT', price: 150 },
        { label: 'A2', row: 1, col: 2, type: 'SEAT', price: 150 },
        { label: 'B1', row: 2, col: 1, type: 'SEAT', price: 180 },
        { label: 'B2', row: 2, col: 2, type: 'SEAT', price: 180 },
      ];
      const res = await fetch(`${BASE_URL}/api/buses/${createdBusId}/layout`, {
        method: 'PUT',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ rows: 2, cols: 2, aisleAfter: 1, colsPerRow: '2', seats }),
      });
      const dbLayout = await prisma.busLayout.findUnique({ where: { busId: createdBusId }, include: { seats: true } });
      record('seat layout save', 'SUPER_ADMIN', `/api/buses/${createdBusId}/layout`, 'PUT', '200 OK', `${res.status}`, dbLayout?.seats?.length === 4);
    } catch (err) {
      record('seat layout save', 'SUPER_ADMIN', `/api/buses/${createdBusId}/layout`, 'PUT', '200 OK', err.message, false);
    }
  }

  // Ensure stations exist
  let stCairo = await prisma.station.findFirst({ where: { name: 'Cairo Smoke St' } });
  if (!stCairo) {
    stCairo = await prisma.station.create({ data: { name: 'Cairo Smoke St', city: 'Cairo', lat: 30.0444, lng: 31.2357 } });
  }
  let stAlex = await prisma.station.findFirst({ where: { name: 'Alex Smoke St' } });
  if (!stAlex) {
    stAlex = await prisma.station.create({ data: { name: 'Alex Smoke St', city: 'Alexandria', lat: 31.2001, lng: 29.9187 } });
  }

  // 1.4 Trip Create
  let createdTripId = null;
  if (createdBusId) {
    try {
      const dep = new Date(Date.now() + 86400000 * 3).toISOString();
      const arr = new Date(Date.now() + 86400000 * 3 + 10800000).toISOString();
      const res = await fetch(`${BASE_URL}/api/trips`, {
        method: 'POST',
        headers: reqHeaders(superToken),
        body: JSON.stringify({
          busId: createdBusId,
          origin: stCairo.name,
          destination: stAlex.name,
          departure: dep,
          arrival: arr,
          price: 150,
          stops: [
            { stationId: stCairo.id, stopOrder: 1, arrivalOffsetMinutes: 0, departureOffsetMinutes: 0, priceFromOrigin: 0 },
            { stationId: stAlex.id, stopOrder: 2, arrivalOffsetMinutes: 180, departureOffsetMinutes: 180, priceFromOrigin: 150 },
          ],
        }),
      });
      const data = await res.json();
      createdTripId = data.id;
      const dbTrip = createdTripId ? await prisma.trip.findUnique({ where: { id: createdTripId }, include: { tripStops: true } }) : null;
      record('trip create', 'SUPER_ADMIN', '/api/trips', 'POST', '200 OK', `${res.status}`, !!dbTrip && dbTrip.tripStops.length === 2);
    } catch (err) {
      record('trip create', 'SUPER_ADMIN', '/api/trips', 'POST', '200 OK', err.message, false);
    }
  }

  // 1.5 Trip Bulk Create (UI loops over POST /api/trips)
  let bulkTripIds = [];
  if (createdBusId) {
    try {
      let bulkOk = true;
      for (let i = 1; i <= 2; i++) {
        const dep = new Date(Date.now() + 86400000 * (4 + i)).toISOString();
        const arr = new Date(Date.now() + 86400000 * (4 + i) + 10800000).toISOString();
        const res = await fetch(`${BASE_URL}/api/trips`, {
          method: 'POST',
          headers: reqHeaders(superToken),
          body: JSON.stringify({
            busId: createdBusId,
            origin: stCairo.name,
            destination: stAlex.name,
            departure: dep,
            arrival: arr,
            price: 150,
            stops: [
              { stationId: stCairo.id, stopOrder: 1, arrivalOffsetMinutes: 0, departureOffsetMinutes: 0, priceFromOrigin: 0 },
              { stationId: stAlex.id, stopOrder: 2, arrivalOffsetMinutes: 180, departureOffsetMinutes: 180, priceFromOrigin: 150 },
            ],
          }),
        });
        const data = await res.json();
        if (data.id) bulkTripIds.push(data.id);
        else bulkOk = false;
      }
      const dbTrips = await prisma.trip.findMany({ where: { id: { in: bulkTripIds } } });
      record('trip bulk create', 'SUPER_ADMIN', '/api/trips (x2)', 'POST', '200 OK', `${bulkTripIds.length} created`, dbTrips.length === 2);
    } catch (err) {
      record('trip bulk create', 'SUPER_ADMIN', '/api/trips', 'POST', '200 OK', err.message, false);
    }
  }

  // 1.6 Trip Edit
  if (createdTripId) {
    try {
      const res = await fetch(`${BASE_URL}/api/trips/${createdTripId}`, {
        method: 'PUT',
        headers: reqHeaders(superToken),
        body: JSON.stringify({
          price: 175,
          stops: [
            { stationId: stCairo.id, stopOrder: 1, arrivalOffsetMinutes: 0, departureOffsetMinutes: 0, priceFromOrigin: 0 },
            { stationId: stAlex.id, stopOrder: 2, arrivalOffsetMinutes: 180, departureOffsetMinutes: 180, priceFromOrigin: 175 },
          ],
        }),
      });
      const dbTrip = await prisma.trip.findUnique({ where: { id: createdTripId } });
      record('trip edit', 'SUPER_ADMIN', `/api/trips/${createdTripId}`, 'PUT', '200 OK', `${res.status}`, dbTrip?.price === 175);
    } catch (err) {
      record('trip edit', 'SUPER_ADMIN', `/api/trips/${createdTripId}`, 'PUT', '200 OK', err.message, false);
    }
  }

  // 1.7 Trip Cancel
  if (bulkTripIds.length > 0) {
    const cancelTripId = bulkTripIds[0];
    try {
      const res = await fetch(`${BASE_URL}/api/trips/${cancelTripId}`, {
        method: 'PUT',
        headers: reqHeaders(superToken),
        body: JSON.stringify({
          status: 'CANCELLED',
        }),
      });
      const dbTrip = await prisma.trip.findUnique({ where: { id: cancelTripId } });
      record('trip cancel', 'SUPER_ADMIN', `/api/trips/${cancelTripId}`, 'PUT', '200 OK', `${res.status}`, dbTrip?.status === 'CANCELLED');
    } catch (err) {
      record('trip cancel', 'SUPER_ADMIN', `/api/trips/${cancelTripId}`, 'PUT', '200 OK', err.message, false);
    }
  }

  // 1.8 Seat Operations (Hold / Lock)
  if (createdTripId) {
    try {
      const res = await fetch(`${BASE_URL}/api/seats/hold`, {
        method: 'POST',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ tripId: createdTripId, seatLabel: 'A1', fromStationId: stCairo.id, toStationId: stAlex.id }),
      });
      const data = await res.json();
      const dbHold = await prisma.seatHold.findFirst({ where: { tripId: createdTripId, seatLabel: 'A1' } });
      record('seat ops (hold/lock)', 'SUPER_ADMIN', '/api/seats/hold', 'POST', '200 OK', `${res.status}`, !!dbHold);
    } catch (err) {
      record('seat ops (hold/lock)', 'SUPER_ADMIN', '/api/seats/hold', 'POST', '200 OK', err.message, false);
    }
  }

  // 1.9 Create a test booking for Super Admin mutation tests (confirm-paid, edit booking, verify-to-board)
  let testBooking = null;
  if (createdTripId) {
    testBooking = await prisma.booking.create({
      data: {
        tripId: createdTripId,
        userId: customer.id,
        seatLabel: 'A2',
        fromStopOrder: 1,
        toStopOrder: 2,
        total: 150,
        status: 'PENDING',
        passengerName: 'Original Passenger',
        passengerPhone: '01012345678',
        reference: `SMK-${Date.now()}`,
      }
    });
  }

  // 1.10 Confirm-Paid
  if (testBooking) {
    try {
      const res = await fetch(`${BASE_URL}/api/bookings/${testBooking.id}`, {
        method: 'PATCH',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ status: 'PAID' }),
      });
      const dbB = await prisma.booking.findUnique({ where: { id: testBooking.id } });
      record('confirm-paid', 'SUPER_ADMIN', `/api/bookings/${testBooking.id}`, 'PATCH', '200 OK', `${res.status}`, dbB?.status === 'PAID');
    } catch (err) {
      record('confirm-paid', 'SUPER_ADMIN', `/api/bookings/${testBooking.id}`, 'PATCH', '200 OK', err.message, false);
    }
  }

  // 1.11 Edit Booking
  if (testBooking) {
    try {
      const res = await fetch(`${BASE_URL}/api/bookings/${testBooking.id}`, {
        method: 'PATCH',
        headers: reqHeaders(superToken),
        body: JSON.stringify({
          action: 'UPDATE',
          passengerName: 'Updated Passenger Name',
          passengerPhone: '01099998888',
          passengerHotel: 'Hilton Cairo',
        }),
      });
      const dbB = await prisma.booking.findUnique({ where: { id: testBooking.id } });
      record('edit booking', 'SUPER_ADMIN', `/api/bookings/${testBooking.id}`, 'PATCH', '200 OK', `${res.status}`, dbB?.passengerName === 'Updated Passenger Name');
    } catch (err) {
      record('edit booking', 'SUPER_ADMIN', `/api/bookings/${testBooking.id}`, 'PATCH', '200 OK', err.message, false);
    }
  }

  // 1.12 Verify-to-Board
  if (testBooking) {
    try {
      const res = await fetch(`${BASE_URL}/api/bookings/${testBooking.id}`, {
        method: 'PATCH',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ status: 'BOARDED' }),
      });
      const dbB = await prisma.booking.findUnique({ where: { id: testBooking.id } });
      record('verify-to-board', 'SUPER_ADMIN', `/api/bookings/${testBooking.id}`, 'PATCH', '200 OK', `${res.status}`, dbB?.boarded === true || dbB?.status === 'BOARDED');
    } catch (err) {
      record('verify-to-board', 'SUPER_ADMIN', `/api/bookings/${testBooking.id}`, 'PATCH', '200 OK', err.message, false);
    }
  }

  // 1.13 Approve / Reject Company
  let testCo = await prisma.company.create({
    data: { name: 'Approval Test Co', subdomain: `appr${Date.now()}`, isActive: false, creditLimit: 0 }
  });
  try {
    const res = await fetch(`${BASE_URL}/api/admin/companies/${testCo.id}/approve`, {
      method: 'PATCH',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ action: 'approve', creditLimit: 15000, paymentMode: 'PREPAID', billingCycle: 'MONTHLY' }),
    });
    const dbCo = await prisma.company.findUnique({ where: { id: testCo.id } });
    record('approve company', 'SUPER_ADMIN', `/api/admin/companies/${testCo.id}/approve`, 'PATCH', '200 OK', `${res.status}`, dbCo?.isActive === true && dbCo?.creditLimit === 15000);
  } catch (err) {
    record('approve company', 'SUPER_ADMIN', `/api/admin/companies/${testCo.id}/approve`, 'PATCH', '200 OK', err.message, false);
  }

  // Reject company
  let testCoReject = await prisma.company.create({
    data: { name: 'Reject Test Co', subdomain: `rej${Date.now()}`, isActive: false, creditLimit: 0 }
  });
  try {
    const res = await fetch(`${BASE_URL}/api/admin/companies/${testCoReject.id}/approve`, {
      method: 'PATCH',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ action: 'reject' }),
    });
    const dbCo = await prisma.company.findUnique({ where: { id: testCoReject.id } });
    record('reject company', 'SUPER_ADMIN', `/api/admin/companies/${testCoReject.id}/approve`, 'PATCH', '200 OK', `${res.status}`, !dbCo);
  } catch (err) {
    record('reject company', 'SUPER_ADMIN', `/api/admin/companies/${testCoReject.id}/approve`, 'PATCH', '200 OK', err.message, false);
  }

  // 1.14 Deposit Requests (Super Admin review)
  let depReq = await prisma.depositRequest.create({
    data: { companyId: company.id, amount: 2500, status: 'PENDING' }
  });
  try {
    const res = await fetch(`${BASE_URL}/api/admin/deposit-requests/${depReq.id}`, {
      method: 'PATCH',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ status: 'APPROVED', adminNotes: 'Approved in smoke test' }),
    });
    const dbDep = await prisma.depositRequest.findUnique({ where: { id: depReq.id } });
    record('deposit requests', 'SUPER_ADMIN', `/api/admin/deposit-requests/${depReq.id}`, 'PATCH', '200 OK', `${res.status}`, dbDep?.status === 'APPROVED');
  } catch (err) {
    record('deposit requests', 'SUPER_ADMIN', `/api/admin/deposit-requests/${depReq.id}`, 'PATCH', '200 OK', err.message, false);
  }

  // 1.15 Trip Requests (Super Admin review)
  let tripReq = await prisma.tripRequest.create({
    data: {
      companyId: company.id,
      fromStationId: stCairo.id,
      toStationId: stAlex.id,
      date: new Date(Date.now() + 86400000 * 5),
      passengerCount: 15,
      status: 'PENDING',
    }
  });
  try {
    const res = await fetch(`${BASE_URL}/api/admin/trip-requests/${tripReq.id}`, {
      method: 'PATCH',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ status: 'APPROVED', adminNotes: 'Confirmed by admin' }),
    });
    const dbTripReq = await prisma.tripRequest.findUnique({ where: { id: tripReq.id } });
    record('trip requests', 'SUPER_ADMIN', `/api/admin/trip-requests/${tripReq.id}`, 'PATCH', '200 OK', `${res.status}`, dbTripReq?.status === 'APPROVED');
  } catch (err) {
    record('trip requests', 'SUPER_ADMIN', `/api/admin/trip-requests/${tripReq.id}`, 'PATCH', '200 OK', err.message, false);
  }

  // 1.16 Cancellation Processing (Super Admin refund processing)
  let cancelBooking = await prisma.booking.create({
    data: {
      tripId: createdTripId,
      userId: customer.id,
      seatLabel: 'B1',
      fromStopOrder: 1,
      toStopOrder: 2,
      total: 180,
      status: 'CANCELLED',
      cancellationFee: 0,
      refundAmount: 180,
      cancelledAt: new Date(),
      reference: `CNL-${Date.now()}`,
    }
  });
  try {
    const res = await fetch(`${BASE_URL}/api/admin/cancellations/${cancelBooking.id}`, {
      method: 'PATCH',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ type: 'customer' }),
    });
    const dbB = await prisma.booking.findUnique({ where: { id: cancelBooking.id } });
    record('cancellation processing', 'SUPER_ADMIN', `/api/admin/cancellations/${cancelBooking.id}`, 'PATCH', '200 OK', `${res.status}`, !!dbB?.refundProcessedAt);
  } catch (err) {
    record('cancellation processing', 'SUPER_ADMIN', `/api/admin/cancellations/${cancelBooking.id}`, 'PATCH', '200 OK', err.message, false);
  }

  // 1.17 Users CRUD
  let createdUser = null;
  try {
    const testEmail = `user_${Date.now()}@test.com`;
    const res = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ name: 'Smoke User', email: testEmail, password: 'Password123!', role: 'CUSTOMER', phone: '01011112222' }),
    });
    const data = await res.json();
    createdUser = data.user || data;
    const dbUser = await prisma.user.findUnique({ where: { email: testEmail } });
    record('users CRUD (create)', 'SUPER_ADMIN', '/api/admin/users', 'POST', '200 OK', `${res.status}`, !!dbUser);
  } catch (err) {
    record('users CRUD (create)', 'SUPER_ADMIN', '/api/admin/users', 'POST', '200 OK', err.message, false);
  }

  // 1.18 Stations CRUD
  let createdStation = null;
  try {
    const res = await fetch(`${BASE_URL}/api/stations`, {
      method: 'POST',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ name: `Station ${Date.now()}`, city: 'Giza', lat: 30.0131, lng: 31.2089 }),
    });
    const data = await res.json();
    createdStation = data;
    const dbSt = await prisma.station.findUnique({ where: { id: data.id } });
    record('stations CRUD (create)', 'SUPER_ADMIN', '/api/stations', 'POST', '200 OK', `${res.status}`, !!dbSt);
  } catch (err) {
    record('stations CRUD (create)', 'SUPER_ADMIN', '/api/stations', 'POST', '200 OK', err.message, false);
  }

  if (createdStation?.id) {
    try {
      const res = await fetch(`${BASE_URL}/api/stations/${createdStation.id}`, {
        method: 'PATCH',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ name: `${createdStation.name} Updated`, city: 'Giza' }),
      });
      const dbSt = await prisma.station.findUnique({ where: { id: createdStation.id } });
      record('stations CRUD (edit)', 'SUPER_ADMIN', `/api/stations/${createdStation.id}`, 'PATCH', '200 OK', `${res.status}`, dbSt?.name.includes('Updated'));
    } catch (err) {
      record('stations CRUD (edit)', 'SUPER_ADMIN', `/api/stations/${createdStation.id}`, 'PATCH', '200 OK', err.message, false);
    }

    try {
      const res = await fetch(`${BASE_URL}/api/stations/${createdStation.id}`, {
        method: 'DELETE',
        headers: reqHeaders(superToken),
      });
      const dbSt = await prisma.station.findUnique({ where: { id: createdStation.id } });
      record('stations CRUD (delete)', 'SUPER_ADMIN', `/api/stations/${createdStation.id}`, 'DELETE', '200 OK', `${res.status}`, !dbSt);
    } catch (err) {
      record('stations CRUD (delete)', 'SUPER_ADMIN', `/api/stations/${createdStation.id}`, 'DELETE', '200 OK', err.message, false);
    }
  }

  // 1.19 FAQ CRUD and Reorder
  let faq1 = null;
  let faq2 = null;
  try {
    const res1 = await fetch(`${BASE_URL}/api/faqs`, {
      method: 'POST',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ questionAr: 'سؤال 1', questionEn: 'Question 1', answerAr: 'جواب 1', answerEn: 'Answer 1' }),
    });
    faq1 = await res1.json();
    const res2 = await fetch(`${BASE_URL}/api/faqs`, {
      method: 'POST',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ questionAr: 'سؤال 2', questionEn: 'Question 2', answerAr: 'جواب 2', answerEn: 'Answer 2' }),
    });
    faq2 = await res2.json();
    const dbFaq = await prisma.faq.findUnique({ where: { id: faq1.id } });
    record('FAQ CRUD (create)', 'SUPER_ADMIN', '/api/faqs', 'POST', '200 OK', `${res1.status}`, !!dbFaq);
  } catch (err) {
    record('FAQ CRUD (create)', 'SUPER_ADMIN', '/api/faqs', 'POST', '200 OK', err.message, false);
  }

  if (faq1?.id) {
    try {
      const res = await fetch(`${BASE_URL}/api/faqs/${faq1.id}`, {
        method: 'PATCH',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ questionAr: 'سؤال 1 معدل', questionEn: 'Question 1 Edited', answerAr: 'جواب 1', answerEn: 'Answer 1' }),
      });
      const dbFaq = await prisma.faq.findUnique({ where: { id: faq1.id } });
      record('FAQ CRUD (edit)', 'SUPER_ADMIN', `/api/faqs/${faq1.id}`, 'PATCH', '200 OK', `${res.status}`, dbFaq?.questionAr === 'سؤال 1 معدل');
    } catch (err) {
      record('FAQ CRUD (edit)', 'SUPER_ADMIN', `/api/faqs/${faq1.id}`, 'PATCH', '200 OK', err.message, false);
    }

    try {
      const res = await fetch(`${BASE_URL}/api/faqs/${faq1.id}/reorder`, {
        method: 'PATCH',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ direction: 'down' }),
      });
      record('FAQ reorder', 'SUPER_ADMIN', `/api/faqs/${faq1.id}/reorder`, 'PATCH', '200 OK', `${res.status}`, res.ok);
    } catch (err) {
      record('FAQ reorder', 'SUPER_ADMIN', `/api/faqs/${faq1.id}/reorder`, 'PATCH', '200 OK', err.message, false);
    }

    try {
      const res = await fetch(`${BASE_URL}/api/faqs/${faq1.id}`, {
        method: 'DELETE',
        headers: reqHeaders(superToken),
      });
      const dbFaq = await prisma.faq.findUnique({ where: { id: faq1.id } });
      record('FAQ CRUD (delete)', 'SUPER_ADMIN', `/api/faqs/${faq1.id}`, 'DELETE', '200 OK', `${res.status}`, !dbFaq);
    } catch (err) {
      record('FAQ CRUD (delete)', 'SUPER_ADMIN', `/api/faqs/${faq1.id}`, 'DELETE', '200 OK', err.message, false);
    }
  }

  // 1.20 Destinations CRUD and Upload
  let createdDest = null;
  const destSlug = `smoke-dest-${Date.now()}`;
  try {
    const res = await fetch(`${BASE_URL}/api/admin/destinations`, {
      method: 'POST',
      headers: reqHeaders(superToken),
      body: JSON.stringify({ slug: destSlug, nameAr: 'وجهة اختبار', nameEn: 'Test Destination', imageUrl: '/placeholder.jpg', sortOrder: 99 }),
    });
    createdDest = await res.json();
    const dbDest = await prisma.destination.findUnique({ where: { slug: destSlug } });
    record('destinations CRUD (create)', 'SUPER_ADMIN', '/api/admin/destinations', 'POST', '201 Created', `${res.status}`, !!dbDest);
  } catch (err) {
    record('destinations CRUD (create)', 'SUPER_ADMIN', '/api/admin/destinations', 'POST', '201 Created', err.message, false);
  }

  if (createdDest?.id) {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/destinations/${createdDest.id}`, {
        method: 'PATCH',
        headers: reqHeaders(superToken),
        body: JSON.stringify({ nameAr: 'وجهة اختبار معدلة' }),
      });
      const dbDest = await prisma.destination.findUnique({ where: { id: createdDest.id } });
      record('destinations CRUD (edit)', 'SUPER_ADMIN', `/api/admin/destinations/${createdDest.id}`, 'PATCH', '200 OK', `${res.status}`, dbDest?.nameAr === 'وجهة اختبار معدلة');
    } catch (err) {
      record('destinations CRUD (edit)', 'SUPER_ADMIN', `/api/admin/destinations/${createdDest.id}`, 'PATCH', '200 OK', err.message, false);
    }

    try {
      const res = await fetch(`${BASE_URL}/api/admin/destinations/${createdDest.id}`, {
        method: 'DELETE',
        headers: reqHeaders(superToken),
      });
      const dbDest = await prisma.destination.findUnique({ where: { id: createdDest.id } });
      record('destinations CRUD (delete)', 'SUPER_ADMIN', `/api/admin/destinations/${createdDest.id}`, 'DELETE', '200 OK', `${res.status}`, !dbDest);
    } catch (err) {
      record('destinations CRUD (delete)', 'SUPER_ADMIN', `/api/admin/destinations/${createdDest.id}`, 'DELETE', '200 OK', err.message, false);
    }
  }

  // Destination upload
  try {
    const formData = new FormData();
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBuf = Buffer.from(pngBase64, 'base64');
    const blob = new Blob([pngBuf], { type: 'image/png' });
    formData.append('image', blob, 'test.png');
    const res = await fetch(`${BASE_URL}/api/admin/destinations/upload`, {
      method: 'POST',
      headers: {
        Cookie: `next-auth.session-token=${superToken}`,
      },
      body: formData,
    });
    record('destinations upload', 'SUPER_ADMIN', '/api/admin/destinations/upload', 'POST', '200 OK', `${res.status}`, res.ok);
  } catch (err) {
    record('destinations upload', 'SUPER_ADMIN', '/api/admin/destinations/upload', 'POST', '200 OK', err.message, false);
  }

  // 1.21 Reports CSV export
  try {
    const res = await fetch(`${BASE_URL}/api/reports?format=csv`, {
      headers: reqHeaders(superToken, false),
    });
    const text = await res.text();
    record('reports CSV export', 'SUPER_ADMIN', '/api/reports?format=csv', 'GET', '200 CSV', `${res.status}`, res.ok && text.length > 0);
  } catch (err) {
    record('reports CSV export', 'SUPER_ADMIN', '/api/reports?format=csv', 'GET', '200 CSV', err.message, false);
  }

  // =========================================================================
  // SECTION 2: COMPANY_ADMIN ACTIONS
  // =========================================================================
  console.log('\n--- COMPANY_ADMIN TESTS ---');

  // 2.1 Company New Booking (Individual)
  let coBookingId = null;
  if (createdTripId) {
    try {
      const res = await fetch(`${BASE_URL}/api/company/bookings`, {
        method: 'POST',
        headers: reqHeaders(companyToken),
        body: JSON.stringify({
          tripId: createdTripId,
          bookingType: 'SEAT',
          fromStationId: stCairo.id,
          toStationId: stAlex.id,
          passengers: [{ seatLabel: 'B2', passengerName: 'Company Passenger', passengerPhone: '01055554444' }],
        }),
      });
      const data = await res.json();
      coBookingId = data.bookings?.[0]?.id;
      const dbB = coBookingId ? await prisma.companyBooking.findUnique({ where: { id: coBookingId } }) : null;
      record('new booking (individual)', 'COMPANY_ADMIN', '/api/company/bookings', 'POST', '200 OK', `${res.status}`, !!dbB && dbB.seatLabel === 'B2');
    } catch (err) {
      record('new booking (individual)', 'COMPANY_ADMIN', '/api/company/bookings', 'POST', '200 OK', err.message, false);
    }
  }

  // 2.2 Company New Booking (Full Trip)
  // Create a separate trip for full-trip booking test
  let charterBus = await prisma.bus.create({
    data: { name: 'Full Trip Bus', type: 'STANDARD', seatCount: 4 }
  });
  await prisma.busLayout.create({
    data: {
      busId: charterBus.id,
      rows: 2, cols: 2, aisleAfter: 1, colsPerRow: '2',
      seats: {
        create: [
          { label: 'S1', row: 1, col: 1, type: 'SEAT', price: 200 },
          { label: 'S2', row: 1, col: 2, type: 'SEAT', price: 200 },
          { label: 'S3', row: 2, col: 1, type: 'SEAT', price: 200 },
          { label: 'S4', row: 2, col: 2, type: 'SEAT', price: 200 },
        ]
      }
    }
  });
  let charterTrip = await prisma.trip.create({
    data: {
      busId: charterBus.id,
      origin: stCairo.name,
      destination: stAlex.name,
      departure: new Date(Date.now() + 86400000 * 6),
      arrival: new Date(Date.now() + 86400000 * 6 + 10800000),
      price: 200,
      tripStops: {
        create: [
          { stationId: stCairo.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stAlex.id, stopOrder: 2, priceFromOrigin: 200 },
        ]
      }
    }
  });

  try {
    const passengers = ['S1', 'S2', 'S3', 'S4'].map(s => ({
      seatLabel: s,
      passengerName: `FullTrip Passenger ${s}`,
      passengerPhone: '01000000000'
    }));
    const res = await fetch(`${BASE_URL}/api/company/bookings`, {
      method: 'POST',
      headers: reqHeaders(companyToken),
      body: JSON.stringify({
        tripId: charterTrip.id,
        bookingType: 'CHARTER',
        fromStationId: stCairo.id,
        toStationId: stAlex.id,
        passengers,
      }),
    });
    const data = await res.json();
    const dbBookings = await prisma.companyBooking.findMany({ where: { tripId: charterTrip.id } });
    record('new booking (full trip)', 'COMPANY_ADMIN', '/api/company/bookings', 'POST', '200 OK', `${res.status} (${data.bookings?.length || 0} seats)`, dbBookings.length === 4);
  } catch (err) {
    record('new booking (full trip)', 'COMPANY_ADMIN', '/api/company/bookings', 'POST', '200 OK', err.message, false);
  }

  // 2.3 Company Cancel Booking
  if (coBookingId) {
    try {
      const res = await fetch(`${BASE_URL}/api/company/bookings/${coBookingId}`, {
        method: 'PATCH',
        headers: reqHeaders(companyToken),
        body: JSON.stringify({ status: 'CANCELLED', reason: 'Company client cancelled' }),
      });
      const dbB = await prisma.companyBooking.findUnique({ where: { id: coBookingId } });
      record('cancel booking', 'COMPANY_ADMIN', `/api/company/bookings/${coBookingId}`, 'PATCH', '200 OK', `${res.status}`, dbB?.status === 'CANCELLED');
    } catch (err) {
      record('cancel booking', 'COMPANY_ADMIN', `/api/company/bookings/${coBookingId}`, 'PATCH', '200 OK', err.message, false);
    }
  }

  // 2.4 Company Customers CRUD
  let coCustomer = null;
  try {
    const res = await fetch(`${BASE_URL}/api/company/customers`, {
      method: 'POST',
      headers: reqHeaders(companyToken),
      body: JSON.stringify({ name: 'Co VIP Client', email: `client_${Date.now()}@test.com`, phone: '01077778888', notes: 'VIP client' }),
    });
    const data = await res.json();
    coCustomer = data.data || data;
    const dbCust = await prisma.companyCustomer.findUnique({ where: { id: coCustomer.id } });
    record('customers CRUD (create)', 'COMPANY_ADMIN', '/api/company/customers', 'POST', '200 OK', `${res.status}`, !!dbCust);
  } catch (err) {
    record('customers CRUD (create)', 'COMPANY_ADMIN', '/api/company/customers', 'POST', '200 OK', err.message, false);
  }

  if (coCustomer?.id) {
    try {
      const res = await fetch(`${BASE_URL}/api/company/customers/${coCustomer.id}`, {
        method: 'PATCH',
        headers: reqHeaders(companyToken),
        body: JSON.stringify({ name: 'Co VIP Client Updated', phone: '01077779999' }),
      });
      const dbCust = await prisma.companyCustomer.findUnique({ where: { id: coCustomer.id } });
      record('customers CRUD (edit)', 'COMPANY_ADMIN', `/api/company/customers/${coCustomer.id}`, 'PATCH', '200 OK', `${res.status}`, dbCust?.name === 'Co VIP Client Updated');
    } catch (err) {
      record('customers CRUD (edit)', 'COMPANY_ADMIN', `/api/company/customers/${coCustomer.id}`, 'PATCH', '200 OK', err.message, false);
    }

    try {
      const res = await fetch(`${BASE_URL}/api/company/customers/${coCustomer.id}`, {
        method: 'DELETE',
        headers: reqHeaders(companyToken),
      });
      const dbCust = await prisma.companyCustomer.findUnique({ where: { id: coCustomer.id } });
      record('customers CRUD (delete)', 'COMPANY_ADMIN', `/api/company/customers/${coCustomer.id}`, 'DELETE', '200 OK', `${res.status}`, !dbCust);
    } catch (err) {
      record('customers CRUD (delete)', 'COMPANY_ADMIN', `/api/company/customers/${coCustomer.id}`, 'DELETE', '200 OK', err.message, false);
    }
  }

  // 2.5 Credit and Invoice Actions
  // Create an invoice to pay
  let testInvoice = await prisma.invoice.create({
    data: {
      companyId: company.id,
      totalAmount: 500,
      paidAmount: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
      dueDate: new Date(Date.now() + 86400000 * 7),
      status: 'PENDING',
    }
  });

  try {
    const res = await fetch(`${BASE_URL}/api/company/invoices/${testInvoice.id}`, {
      method: 'PATCH',
      headers: reqHeaders(companyToken),
      body: JSON.stringify({ status: 'PAID', paidAmount: 500 }),
    });
    const dbInv = await prisma.invoice.findUnique({ where: { id: testInvoice.id } });
    record('invoice pay action', 'COMPANY_ADMIN', `/api/company/invoices/${testInvoice.id}`, 'PATCH', '200 OK', `${res.status}`, dbInv?.status === 'PAID');
  } catch (err) {
    record('invoice pay action', 'COMPANY_ADMIN', `/api/company/invoices/${testInvoice.id}`, 'PATCH', '200 OK', err.message, false);
  }

  // Deposit request from Company
  try {
    const res = await fetch(`${BASE_URL}/api/company/deposit-requests`, {
      method: 'POST',
      headers: reqHeaders(companyToken),
      body: JSON.stringify({ amount: 5000 }),
    });
    const data = await res.json();
    const dbDep = await prisma.depositRequest.findFirst({ where: { companyId: company.id, amount: 5000 } });
    record('deposit request create', 'COMPANY_ADMIN', '/api/company/deposit-requests', 'POST', '200 OK', `${res.status}`, !!dbDep);
  } catch (err) {
    record('deposit request create', 'COMPANY_ADMIN', '/api/company/deposit-requests', 'POST', '200 OK', err.message, false);
  }

  // 2.6 Company Trip Request
  try {
    const res = await fetch(`${BASE_URL}/api/company/trip-requests`, {
      method: 'POST',
      headers: reqHeaders(companyToken),
      body: JSON.stringify({
        fromStationId: stCairo.id,
        toStationId: stAlex.id,
        date: new Date(Date.now() + 86400000 * 10).toISOString().split('T')[0],
        passengerCount: 25,
        notes: 'Corporate event travel',
      }),
    });
    const data = await res.json();
    const dbReq = await prisma.tripRequest.findFirst({ where: { companyId: company.id, passengerCount: 25 } });
    record('trip request submit', 'COMPANY_ADMIN', '/api/company/trip-requests', 'POST', '200 OK', `${res.status}`, !!dbReq);
  } catch (err) {
    record('trip request submit', 'COMPANY_ADMIN', '/api/company/trip-requests', 'POST', '200 OK', err.message, false);
  }

  // =========================================================================
  // SECTION 3: CUSTOMER ACTIONS
  // =========================================================================
  console.log('\n--- CUSTOMER TESTS ---');

  // 3.1 Search Trips
  try {
    const res = await fetch(`${BASE_URL}/api/trips?fromStationId=${stCairo.id}&toStationId=${stAlex.id}`, {
      headers: reqHeaders(customerToken, false),
    });
    const data = await res.json();
    record('search trips', 'CUSTOMER', '/api/trips', 'GET', '200 OK', `${res.status} (${data.data?.length || 0} trips)`, res.ok && Array.isArray(data.data));
  } catch (err) {
    record('search trips', 'CUSTOMER', '/api/trips', 'GET', '200 OK', err.message, false);
  }

  // 3.2 One-Way Booking
  let custBookingId = null;
  // Create a trip with available seats for customer
  let custTrip = await prisma.trip.create({
    data: {
      busId: charterBus.id,
      origin: stCairo.name,
      destination: stAlex.name,
      departure: new Date(Date.now() + 86400000 * 7),
      arrival: new Date(Date.now() + 86400000 * 7 + 10800000),
      price: 200,
      tripStops: {
        create: [
          { stationId: stCairo.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stAlex.id, stopOrder: 2, priceFromOrigin: 200 },
        ]
      }
    }
  });

  try {
    const res = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: reqHeaders(customerToken),
      body: JSON.stringify({
        tripId: custTrip.id,
        seatLabel: 'S1',
        passengerName: 'Customer One',
        passengerPhone: '01011223344',
        fromStationId: stCairo.id,
        toStationId: stAlex.id,
      }),
    });
    const data = await res.json();
    custBookingId = data.booking?.id || data.id;
    const dbB = custBookingId ? await prisma.booking.findUnique({ where: { id: custBookingId } }) : null;
    record('one-way booking', 'CUSTOMER', '/api/bookings', 'POST', '200 OK', `${res.status}`, !!dbB && dbB.seatLabel === 'S1');
  } catch (err) {
    record('one-way booking', 'CUSTOMER', '/api/bookings', 'POST', '200 OK', err.message, false);
  }

  // 3.3 Round-Trip Booking
  let returnTrip = await prisma.trip.create({
    data: {
      busId: charterBus.id,
      origin: stAlex.name,
      destination: stCairo.name,
      departure: new Date(Date.now() + 86400000 * 8),
      arrival: new Date(Date.now() + 86400000 * 8 + 10800000),
      price: 200,
      tripStops: {
        create: [
          { stationId: stAlex.id, stopOrder: 1, priceFromOrigin: 0 },
          { stationId: stCairo.id, stopOrder: 2, priceFromOrigin: 200 },
        ]
      }
    }
  });

  try {
    const roundGroupId = `RT-${Date.now()}`;
    const resOut = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: reqHeaders(customerToken),
      body: JSON.stringify({
        tripId: custTrip.id,
        seatLabel: 'S2',
        passengerName: 'Customer Round',
        passengerPhone: '01099887766',
        fromStationId: stCairo.id,
        toStationId: stAlex.id,
      }),
    });
    const dataOut = await resOut.json();
    const resRet = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: reqHeaders(customerToken),
      body: JSON.stringify({
        tripId: returnTrip.id,
        seatLabel: 'S2',
        passengerName: 'Customer Round',
        passengerPhone: '01099887766',
        fromStationId: stAlex.id,
        toStationId: stCairo.id,
      }),
    });
    const dataRet = await resRet.json();
    const bOut = await prisma.booking.findUnique({ where: { id: dataOut.booking?.id || dataOut.id } });
    const bRet = await prisma.booking.findUnique({ where: { id: dataRet.booking?.id || dataRet.id } });
    record('round-trip booking', 'CUSTOMER', '/api/bookings (out+return)', 'POST', '200 OK', `${resOut.status} & ${resRet.status}`, !!bOut && !!bRet);
  } catch (err) {
    record('round-trip booking', 'CUSTOMER', '/api/bookings', 'POST', '200 OK', err.message, false);
  }

  // 3.4 Print Ticket
  if (custBookingId) {
    try {
      const res = await fetch(`${BASE_URL}/api/bookings/${custBookingId}/ticket`, {
        headers: reqHeaders(customerToken, false),
      });
      const data = await res.json();
      record('print ticket', 'CUSTOMER', `/api/bookings/${custBookingId}/ticket`, 'GET', '200 OK', `${res.status}`, res.ok && (!!data.id || !!data.booking));
    } catch (err) {
      record('print ticket', 'CUSTOMER', `/api/bookings/${custBookingId}/ticket`, 'GET', '200 OK', err.message, false);
    }
  }

  // 3.5 Customer Cancel Booking
  if (custBookingId) {
    try {
      const res = await fetch(`${BASE_URL}/api/bookings/${custBookingId}`, {
        method: 'PATCH',
        headers: reqHeaders(customerToken),
        body: JSON.stringify({ status: 'CANCELLED', reason: 'Customer changed plans' }),
      });
      const dbB = await prisma.booking.findUnique({ where: { id: custBookingId } });
      record('cancel booking', 'CUSTOMER', `/api/bookings/${custBookingId}`, 'PATCH', '200 OK', `${res.status}`, dbB?.status === 'CANCELLED');
    } catch (err) {
      record('cancel booking', 'CUSTOMER', `/api/bookings/${custBookingId}`, 'PATCH', '200 OK', err.message, false);
    }
  }

  // 3.6 Profile Update
  try {
    const res = await fetch(`${BASE_URL}/api/profile`, {
      method: 'PUT',
      headers: reqHeaders(customerToken),
      body: JSON.stringify({ name: 'Customer Smoke Updated', phone: '01033334444' }),
    });
    const dbU = await prisma.user.findUnique({ where: { id: customer.id } });
    record('profile update', 'CUSTOMER', '/api/profile', 'PUT', '200 OK', `${res.status}`, dbU?.name === 'Customer Smoke Updated');
  } catch (err) {
    record('profile update', 'CUSTOMER', '/api/profile', 'PUT', '200 OK', err.message, false);
  }

  // Bus Delete test
  try {
    const busToDelete = await prisma.bus.create({
      data: { name: 'Bus To Delete', type: 'STANDARD', seatCount: 10 }
    });
    const res = await fetch(`${BASE_URL}/api/buses/${busToDelete.id}`, {
      method: 'DELETE',
      headers: reqHeaders(superToken),
    });
    const dbBus = await prisma.bus.findUnique({ where: { id: busToDelete.id } });
    record('bus delete', 'SUPER_ADMIN', `/api/buses/${busToDelete.id}`, 'DELETE', '200 OK', `${res.status}`, !dbBus);
  } catch (err) {
    record('bus delete', 'SUPER_ADMIN', '/api/buses/[id]', 'DELETE', '200 OK', err.message, false);
  }

  console.log('\n=================== SMOKE TEST RESULTS SUMMARY ===================\n');
  console.log(`| Action | Role | Endpoint & Method | Expected | Actual | DB Verified |`);
  console.log(`| :--- | :--- | :--- | :--- | :--- | :---: |`);
  for (const r of results) {
    console.log(`| ${r.action} | \`${r.role}\` | \`${r.endpointMethod}\` | ${r.expected} | ${r.actual} | **${r.dbVerified}** |`);
  }

  await prisma.$disconnect();
  return results;
}

if (process.argv[1] === import.meta.filename) {
  runSmokeTests().catch(console.error);
}
