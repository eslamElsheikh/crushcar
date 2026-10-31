/**
 * T5 - Payment methods chosen by payer verification test suite.
 *
 * Requirements:
 * - Super admin manages payment methods (CRUD)
 * - Non-admin cannot create or edit (401 / 403)
 * - Only active methods are returned to payers
 * - Payer cannot submit nonexistent or inactive method (rejected with 400)
 * - Payer submits active method -> stored on booking & deposit request
 * - Chosen method appears in admin review
 * - Existing records without a method or with legacy string still render
 */
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { assertTestDatabase } from './lib/test-db-guard'

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

async function main() {
  console.log(`T5 payment methods test suite (${BASE})`)

  // 1. Create users
  const adminUser = await prisma.user.create({
    data: { email: `admin-t5-${SUFFIX}@safro.test`, name: 'Admin', role: 'SUPER_ADMIN', password: 'x', isActive: true },
  })
  const adminToken = await mintToken(adminUser)

  const company = await prisma.company.create({
    data: {
      name: `CoT5 ${SUFFIX}`,
      subdomain: `cot5-${SUFFIX}`,
      isActive: true,
      creditLimit: 5000,
      walletBalance: 0,
      billingCycle: 'MONTHLY',
      paymentMode: 'PREPAID',
    },
  })

  const companyUser = await prisma.user.create({
    data: { email: `company-t5-${SUFFIX}@safro.test`, name: 'Company Admin', role: 'COMPANY_ADMIN', companyId: company.id, password: 'x', isActive: true },
  })
  const companyToken = await mintToken(companyUser)

  const customerUser = await prisma.user.create({
    data: { email: `cust-t5-${SUFFIX}@safro.test`, name: 'Customer', role: 'CUSTOMER', password: 'x', isActive: true },
  })
  const customerToken = await mintToken(customerUser)

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Super admin manages payment methods & non-admin denied
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Super admin CRUD and access control')

  // Non-admin attempts to create payment method
  const custCreate = await api('/api/admin/payment-methods', {
    method: 'POST',
    token: customerToken,
    body: { displayName: 'Hacked Bank', type: 'BANK' },
  })
  check('non-admin cannot create payment method (403)', custCreate.status === 403, `status: ${custCreate.status}`)

  const anonCreate = await api('/api/admin/payment-methods', {
    method: 'POST',
    body: { displayName: 'Hacked Bank', type: 'BANK' },
  })
  check('anonymous cannot create payment method (401)', anonCreate.status === 401, `status: ${anonCreate.status}`)

  // Admin creates active Bank method
  const activeMethodRes = await api('/api/admin/payment-methods', {
    method: 'POST',
    token: adminToken,
    body: {
      type: 'BANK',
      displayName: `بنك مصر-${SUFFIX}`,
      accountNumber: '1234567890123456',
      accountHolder: 'شركة سافرو ترافيل',
      instructions: 'يرجى إرفاق صورة إيصال التحويل البنكي',
      isActive: true,
      sortOrder: 1,
    },
  })
  check('super admin creates active payment method (201)', activeMethodRes.status === 201, JSON.stringify(activeMethodRes.json))
  const activeMethod = (activeMethodRes.json as any).method

  // Admin creates inactive method
  const inactiveMethodRes = await api('/api/admin/payment-methods', {
    method: 'POST',
    token: adminToken,
    body: {
      type: 'VODAFONE_CASH',
      displayName: `فودافون معطلة-${SUFFIX}`,
      accountNumber: '01000000000',
      isActive: false,
      sortOrder: 2,
    },
  })
  check('super admin creates inactive payment method (201)', inactiveMethodRes.status === 201, JSON.stringify(inactiveMethodRes.json))
  const inactiveMethod = (inactiveMethodRes.json as any).method

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Only active methods returned to payers
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2. Public / Payer listing: only active methods returned')
  const publicList = await api('/api/payment-methods', { method: 'GET' })
  check('public listing returns 200', publicList.status === 200)
  const publicMethods = (publicList.json as any).methods || []

  const hasActive = publicMethods.some((m: any) => m.id === activeMethod.id)
  const hasInactive = publicMethods.some((m: any) => m.id === inactiveMethod.id)
  check('active method is included in public listing', hasActive)
  check('inactive method is excluded from public listing', !hasInactive)

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Customer booking payment: inactive/nonexistent method rejected
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3. Customer payment submission with method validation')
  // Create a trip and customer booking
  const trip = await prisma.trip.create({
    data: {
      busId: (await prisma.bus.create({ data: { name: `Bus-${SUFFIX}`, type: 'MINI_BUS', seatCount: 10 } })).id,
      origin: 'Cairo',
      destination: 'Alexandria',
      departure: new Date(Date.now() + 86400000),
      arrival: new Date(Date.now() + 90000000),
      price: 200,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
    },
  })

  const custBooking = await prisma.booking.create({
    data: {
      reference: `BKG-T5-${SUFFIX}`,
      userId: customerUser.id,
      tripId: trip.id,
      seatLabel: 'S-1',
      passengerName: 'Ali Customer',
      passengerPhone: '01012345678',
      status: 'PENDING',
      total: 200,
    },
  })

  // Attempt payment submission with INACTIVE method
  const inactiveSubmit = await api(`/api/bookings/${custBooking.id}`, {
    method: 'PATCH',
    token: customerToken,
    body: {
      action: 'SUBMIT_PROOF',
      paymentMethodId: inactiveMethod.id,
      paymentProofUrl: '/api/uploads/11112222-3333-4444-5555-666677778888.png',
    },
  })
  check('submitting inactive payment method is rejected with 400', inactiveSubmit.status === 400 && inactiveSubmit.json.error === 'INVALID_PAYMENT_METHOD', JSON.stringify(inactiveSubmit.json))

  // Attempt payment submission with NONEXISTENT method
  const fakeSubmit = await api(`/api/bookings/${custBooking.id}`, {
    method: 'PATCH',
    token: customerToken,
    body: {
      action: 'SUBMIT_PROOF',
      paymentMethodId: 'nonexistent-method-id',
      paymentProofUrl: '/api/uploads/11112222-3333-4444-5555-666677778888.png',
    },
  })
  check('submitting nonexistent payment method is rejected with 400', fakeSubmit.status === 400 && fakeSubmit.json.error === 'INVALID_PAYMENT_METHOD')

  // Submit with ACTIVE method
  const activeSubmit = await api(`/api/bookings/${custBooking.id}`, {
    method: 'PATCH',
    token: customerToken,
    body: {
      action: 'SUBMIT_PROOF',
      paymentMethodId: activeMethod.id,
      paymentProofUrl: '/api/uploads/11112222-3333-4444-5555-666677778888.png',
      paymentNotes: 'Transferred via Misr mobile banking',
    },
  })
  check('submitting active payment method is accepted with 200', activeSubmit.status === 200, JSON.stringify(activeSubmit.json))

  const reloadedCustBooking = await prisma.booking.findUnique({
    where: { id: custBooking.id },
    include: { paymentMethodRef: true },
  })
  check('booking stores paymentMethodId and links to PaymentMethod', reloadedCustBooking?.paymentMethodId === activeMethod.id && reloadedCustBooking?.paymentMethodRef?.displayName === activeMethod.displayName)

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Company deposit request with method validation
  // ───────────────────────────────────────────────────────────────────────────
  console.log('4. Company deposit request with method validation')
  // Deposit request with inactive method
  const depInactive = await api('/api/company/deposit-requests', {
    method: 'POST',
    token: companyToken,
    body: {
      amount: 1500,
      paymentMethodId: inactiveMethod.id,
      attachmentUrl: '/api/uploads/11112222-3333-4444-5555-666677778888.png',
    },
  })
  check('company deposit request with inactive method rejected with 400', depInactive.status === 400 && depInactive.json.error === 'INVALID_PAYMENT_METHOD', JSON.stringify(depInactive.json))

  // Deposit request with active method
  const depActive = await api('/api/company/deposit-requests', {
    method: 'POST',
    token: companyToken,
    body: {
      amount: 1500,
      paymentMethodId: activeMethod.id,
      attachmentUrl: '/api/uploads/11112222-3333-4444-5555-666677778888.png',
    },
  })
  check('company deposit request with active method accepted with 200', depActive.status === 200, JSON.stringify(depActive.json))

  const reloadedDep = await prisma.depositRequest.findFirst({
    where: { companyId: company.id, paymentMethodId: activeMethod.id },
    include: { paymentMethodRef: true },
  })
  check('deposit request stores paymentMethodId and display name', !!reloadedDep && reloadedDep.paymentMethodRef?.displayName === activeMethod.displayName)
  // ───────────────────────────────────────────────────────────────────────────
  // 5. Existing records without a method or legacy strings still render
  // ───────────────────────────────────────────────────────────────────────────
  console.log('5. Legacy records compatibility')
  // Create a legacy booking with method='VODAFONE_CASH' and paymentMethodId=null
  const legacyBooking = await prisma.booking.create({
    data: {
      reference: `BKG-LEGACY-${SUFFIX}`,
      userId: customerUser.id,
      tripId: trip.id,
      seatLabel: 'S-2',
      passengerName: 'Legacy Customer',
      status: 'PAID',
      paymentMethod: 'VODAFONE_CASH',
      paymentMethodId: null,
      total: 200,
    },
  })

  // Fetching it via API should succeed without error
  const legacyRes = await api(`/api/bookings/${legacyBooking.id}`, { method: 'GET', token: customerToken })
  check('legacy booking without paymentMethodId fetches cleanly with 200', legacyRes.status === 200 && (legacyRes.json as any).paymentMethod === 'VODAFONE_CASH')

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
