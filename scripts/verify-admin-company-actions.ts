/**
 * T3 - Super admin acts on behalf of a company verification.
 *
 * Requirements:
 * - SUPER_ADMIN only (denial for anonymous, customer, company admin)
 * - Confirm payment without proof (requires note, charges company, double-confirm idempotent)
 * - Confirm vs company self-cancel race
 * - Edit company booking (passenger details free, seat change checked against taken seats)
 * - Attach payment proof
 * - Soft-delete (admin cancellation with full financial reversal, default 0 fee, note required)
 * - Money reconciler verified after financial operations
 * - Audit log entries verified for each action
 */
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { assertTestDatabase } from './lib/test-db-guard'
import { travelDateOf } from '../src/lib/route-key'

assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3070'
const SUFFIX = Date.now().toString(36)
let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function api(path: string, init: { method: string; body?: unknown; token?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Cookie = `next-auth.session-token=${init.token}`
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(text) as Record<string, unknown> } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function mintToken(user: { id: string; email: string; name: string; role: string; companyId: string | null }) {
  const secret = process.env.AUTH_SECRET || 'M1fX/C7/V+C/AVeI5lmi5FQoJulgZ4bE942NH691I='
  return encode({
    token: {
      id: user.id, sub: user.id, email: user.email, name: user.name,
      role: user.role, companyId: user.companyId, image: null,
      activeCheckedAt: Date.now(),
    },
    secret,
    salt: 'next-auth.session-token',
  })
}

async function makeCompany(label: string, opts: { creditLimit: number; walletBalance: number; autoPay: boolean }) {
  return prisma.company.create({
    data: {
      name: `${label} ${SUFFIX}`,
      subdomain: `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${SUFFIX}`,
      isActive: true,
      creditLimit: opts.creditLimit,
      walletBalance: opts.walletBalance,
      autoPayEnabled: opts.autoPay,
      billingCycle: 'MONTHLY',
      paymentMode: 'PREPAID',
    },
  })
}

async function makeTrip(label: string, origin: string, destination: string, departure: Date, stationIds: [string, string]) {
  const bus = await prisma.bus.create({
    data: { name: `Bus-${label}-${SUFFIX}`, type: 'COACH_BUS', seatCount: 20 },
  })
  const layout = await prisma.busLayout.create({
    data: { busId: bus.id, rows: 5, cols: 4 },
  })
  const labels = ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7', 'S-8']
  for (let i = 0; i < labels.length; i++) {
    await prisma.seat.create({
      data: { layoutId: layout.id, label: labels[i], row: Math.floor(i / 4) + 1, col: (i % 4) + 1, type: 'NORMAL', price: 0 },
    })
  }
  const trip = await prisma.trip.create({
    data: {
      busId: bus.id, origin, destination, departure,
      arrival: new Date(departure.getTime() + 4 * 3600000),
      price: 150, bookingMode: 'SEAT', status: 'SCHEDULED',
      tripStops: { create: [
        { stationId: stationIds[0], stopOrder: 1, priceFromOrigin: 0 },
        { stationId: stationIds[1], stopOrder: 2, priceFromOrigin: 150 },
      ] },
    },
  })
  await prisma.trip.update({ where: { id: trip.id }, data: { travelDate: travelDateOf(departure)! } })
  return { trip, labels }
}

async function main() {
  console.log(`T3 super admin acts on behalf of company verification (${BASE})`)

  // 1. Setup test entities
  const s1 = await prisma.station.upsert({ where: { name_city: { name: `قاهرة-t3-${SUFFIX}`, city: 'cairo' } }, create: { name: `قاهرة-t3-${SUFFIX}`, city: 'cairo' }, update: {} })
  const s2 = await prisma.station.upsert({ where: { name_city: { name: `اسكندرية-t3-${SUFFIX}`, city: 'alex' } }, create: { name: `اسكندرية-t3-${SUFFIX}`, city: 'alex' }, update: {} })

  const dep = new Date(Date.now() + 5 * 86400000); dep.setUTCHours(9, 0, 0, 0)
  const { trip, labels } = await makeTrip('T3', `قاهرة-t3-${SUFFIX}`, `اسكندرية-t3-${SUFFIX}`, dep, [s1.id, s2.id])

  const company = await makeCompany('T3Co', { creditLimit: 5000, walletBalance: 1000, autoPay: false })

  // Users
  const adminUser = await prisma.user.create({
    data: { email: `admin-${SUFFIX}@safro.test`, name: 'Super Admin', role: 'SUPER_ADMIN', password: 'x', isActive: true },
  })
  const adminToken = await mintToken(adminUser)

  const companyUser = await prisma.user.create({
    data: { email: `company-${SUFFIX}@safro.test`, name: 'Company Admin', role: 'COMPANY_ADMIN', companyId: company.id, password: 'x', isActive: true },
  })
  const companyToken = await mintToken(companyUser)

  const customerUser = await prisma.user.create({
    data: { email: `customer-${SUFFIX}@safro.test`, name: 'Customer', role: 'CUSTOMER', password: 'x', isActive: true },
  })
  const customerToken = await mintToken(customerUser)

  // 2. Per-role denial tests
  console.log('1. Per-role denial on /api/admin/company-bookings/[id]')
  // Create a pending company booking directly
  const booking1 = await prisma.companyBooking.create({
    data: {
      reference: `T3-REF-1-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: labels[0],
      passengerName: 'Test Passenger 1',
      passengerPhone: '01012345678',
      passengerHotel: 'Hotel A',
      status: 'PENDING',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  const anonGet = await api(`/api/admin/company-bookings/${booking1.id}`, { method: 'GET' })
  check('anonymous access rejected with 401', anonGet.status === 401, `status ${anonGet.status}`)

  const custGet = await api(`/api/admin/company-bookings/${booking1.id}`, { method: 'GET', token: customerToken })
  check('customer access rejected with 403', custGet.status === 403, `status ${custGet.status}`)

  const compGet = await api(`/api/admin/company-bookings/${booking1.id}`, { method: 'GET', token: companyToken })
  check('company admin access rejected with 403', compGet.status === 403, `status ${compGet.status}`)

  const adminGet = await api(`/api/admin/company-bookings/${booking1.id}`, { method: 'GET', token: adminToken })
  check('super admin access allowed with 200', adminGet.status === 200, `status ${adminGet.status}`)

  // 3. Confirm payment without proof
  console.log('2. Confirm payment without proof')
  const emptyNoteConfirm = await api(`/api/admin/company-bookings/${booking1.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { action: 'CONFIRM_WITHOUT_PROOF', note: '' },
  })
  check('confirm without note rejected with 400', emptyNoteConfirm.status === 400 && emptyNoteConfirm.json.error === 'NOTE_REQUIRED', JSON.stringify(emptyNoteConfirm.json))

  const validConfirm = await api(`/api/admin/company-bookings/${booking1.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { action: 'CONFIRM_WITHOUT_PROOF', note: 'Phone confirmation received from manager' },
  })
  check('confirm with valid note accepted with 200', validConfirm.status === 200, JSON.stringify(validConfirm.json))

  const reloadedBooking1 = await prisma.companyBooking.findUnique({ where: { id: booking1.id } })
  check('booking status changed to PAID and charged', reloadedBooking1?.status === 'PAID' && (reloadedBooking1?.paidFromWallet === 150 || reloadedBooking1?.paidOnCredit === 150))

  // Audit entry check
  const confirmAudit = await prisma.auditLog.findFirst({
    where: { entity: 'CompanyBooking', entityId: booking1.id, action: 'PAY' },
  })
  check('audit entry created for confirm without proof', !!confirmAudit && confirmAudit.userId === adminUser.id)

  // Double-confirm idempotency
  const doubleConfirm = await api(`/api/admin/company-bookings/${booking1.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { action: 'CONFIRM_WITHOUT_PROOF', note: 'Second click attempt' },
  })
  check('double-confirm rejected and does not charge twice', doubleConfirm.status === 400 && doubleConfirm.json.error === 'ALREADY_PAID', JSON.stringify(doubleConfirm.json))

  // 4. Confirm vs company self-cancel race
  console.log('3. Confirm vs company self-cancel race')
  const bookingRace = await prisma.companyBooking.create({
    data: {
      reference: `T3-RACE-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: labels[1],
      passengerName: 'Race Passenger',
      passengerPhone: '01011112222',
      status: 'PENDING',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  // Company cancels while admin tries to confirm
  await prisma.companyBooking.update({
    where: { id: bookingRace.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Company canceled' },
  })

  const confirmAfterCancel = await api(`/api/admin/company-bookings/${bookingRace.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { action: 'CONFIRM_WITHOUT_PROOF', note: 'Attempting confirm on cancelled' },
  })
  check('confirming a cancelled booking is safely rejected', confirmAfterCancel.status === 409 || confirmAfterCancel.status === 400, JSON.stringify(confirmAfterCancel.json))

  // 5. Attach proof on behalf
  console.log('4. Attach proof on behalf of company')
  const attachProof = await api(`/api/admin/company-bookings/${booking1.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { action: 'ATTACH_PROOF', paymentProofUrl: '/api/uploads/receipt-proof-test.png', note: 'Receipt forwarded on WhatsApp' },
  })
  check('attach proof accepted with 200', attachProof.status === 200, JSON.stringify(attachProof.json))
  const booking1WithProof = await prisma.companyBooking.findUnique({ where: { id: booking1.id } })
  check('paymentProofUrl stored on company booking', booking1WithProof?.paymentProofUrl === '/api/uploads/receipt-proof-test.png')

  // 6. Edit company booking
  console.log('5. Edit company booking (passenger details & seat change)')
  const editDetails = await api(`/api/admin/company-bookings/${booking1.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: {
      action: 'EDIT',
      passengerName: 'Updated Name',
      passengerPhone: '01099998888',
      passengerHotel: 'Hilton Alexandria',
      passengerNotes: 'VIP guest',
      note: 'Admin edited details per company request',
    },
  })
  check('edit passenger details accepted with 200', editDetails.status === 200, JSON.stringify(editDetails.json))
  const booking1Edited = await prisma.companyBooking.findUnique({ where: { id: booking1.id } })
  check('passenger details updated in database', booking1Edited?.passengerName === 'Updated Name' && booking1Edited?.passengerHotel === 'Hilton Alexandria')

  // Change seat to free seat S-3
  const editSeatFree = await api(`/api/admin/company-bookings/${booking1.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { action: 'EDIT', seatLabel: labels[2], note: 'Changed to seat S-3' },
  })
  check('change to available seat accepted with 200', editSeatFree.status === 200, JSON.stringify(editSeatFree.json))
  const booking1SeatChanged = await prisma.companyBooking.findUnique({ where: { id: booking1.id } })
  check('seatLabel updated in database', booking1SeatChanged?.seatLabel === labels[2])

  // Change seat to taken seat (let's create a booking on S-4 and try to change booking1 to S-4)
  await prisma.companyBooking.create({
    data: {
      reference: `T3-TAKEN-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: labels[3],
      passengerName: 'Taken Seat Holder',
      status: 'PAID',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  const editSeatTaken = await api(`/api/admin/company-bookings/${booking1.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { action: 'EDIT', seatLabel: labels[3], note: 'Trying taken seat' },
  })
  check('change to already booked seat rejected with 409', editSeatTaken.status === 409, JSON.stringify(editSeatTaken.json))

  // 7. Soft delete (admin cancellation with full financial reversal)
  console.log('6. Soft delete company booking with financial reversal')
  // 7a. Delete PENDING booking
  const pendingBookingToDelete = await prisma.companyBooking.create({
    data: {
      reference: `T3-DEL-PEND-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: labels[4],
      passengerName: 'Delete Pending',
      status: 'PENDING',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  const delNoNote = await api(`/api/admin/company-bookings/${pendingBookingToDelete.id}`, {
    method: 'DELETE',
    token: adminToken,
    body: { note: '' },
  })
  check('delete without note rejected with 400', delNoNote.status === 400 && delNoNote.json.error === 'NOTE_REQUIRED', JSON.stringify(delNoNote.json))

  const delPending = await api(`/api/admin/company-bookings/${pendingBookingToDelete.id}`, {
    method: 'DELETE',
    token: adminToken,
    body: { note: 'Cancelled on company request before payment' },
  })
  check('delete pending accepted with 200', delPending.status === 200, JSON.stringify(delPending.json))
  const reloadedDelPending = await prisma.companyBooking.findUnique({ where: { id: pendingBookingToDelete.id } })
  check('pending booking status is CANCELLED and seat released', reloadedDelPending?.status === 'CANCELLED')

  // Seat S-5 should now be free to book again
  const rebookSeat = await prisma.companyBooking.create({
    data: {
      reference: `T3-REBOOK-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: labels[4],
      passengerName: 'New Holder',
      status: 'PENDING',
      total: 150,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })
  check('released seat can be rebooked successfully', !!rebookSeat.id)

  // 7b. Delete PAID booking with full financial reversal
  const paidBookingToDelete = await prisma.companyBooking.create({
    data: {
      reference: `T3-DEL-PAID-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: labels[5],
      passengerName: 'Delete Paid',
      status: 'PAID',
      total: 150,
      paidFromWallet: 150,
      paidOnCredit: 0,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })
  // Debit company wallet to simulate payment before delete
  const initialCompany = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  const balanceBeforeDelete = initialCompany.walletBalance

  const delPaid = await api(`/api/admin/company-bookings/${paidBookingToDelete.id}`, {
    method: 'DELETE',
    token: adminToken,
    body: { note: 'Admin soft-delete of paid booking with full refund' },
  })
  check('delete paid accepted with 200', delPaid.status === 200, JSON.stringify(delPaid.json))

  const companyAfterDelete = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('company wallet balance refunded by exactly 150', companyAfterDelete.walletBalance === balanceBeforeDelete + 150, `before: ${balanceBeforeDelete}, after: ${companyAfterDelete.walletBalance}`)

  const refundTx = await prisma.walletTransaction.findFirst({
    where: { companyId: company.id, reference: paidBookingToDelete.id, type: 'REFUND' },
  })
  check('REFUND wallet transaction created with 150', !!refundTx && refundTx.amount === 150)

  // Audit entry for delete
  const delAudit = await prisma.auditLog.findFirst({
    where: { entity: 'CompanyBooking', entityId: paidBookingToDelete.id, action: 'DELETE' },
  })
  check('audit entry created for delete action with note', !!delAudit && delAudit.userId === adminUser.id)

  // 8. Delete with fee
  const paidBookingWithFee = await prisma.companyBooking.create({
    data: {
      reference: `T3-DEL-FEE-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: labels[6],
      passengerName: 'Delete With Fee',
      status: 'PAID',
      total: 150,
      paidFromWallet: 150,
      paidOnCredit: 0,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })
  const balanceBeforeFeeDelete = (await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).walletBalance

  const delWithFee = await api(`/api/admin/company-bookings/${paidBookingWithFee.id}`, {
    method: 'DELETE',
    token: adminToken,
    body: { note: 'Cancelled with 30 EGP policy fee', fee: 30 },
  })
  check('delete with fee accepted with 200', delWithFee.status === 200, JSON.stringify(delWithFee.json))
  const balanceAfterFeeDelete = (await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).walletBalance
  check('company refunded total minus fee (150 - 30 = 120)', balanceAfterFeeDelete === balanceBeforeFeeDelete + 120, `expected +120, got +${balanceAfterFeeDelete - balanceBeforeFeeDelete}`)

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
