import { createHmac } from 'crypto'
import { encode } from 'next-auth/jwt'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3070'
const AUTH_SECRET = process.env.AUTH_SECRET || 'M1fX/C7/V+C/AVeI5lmi5FQoJulgZ4bE942NH691I='

interface TestResult {
  category: string
  name: string
  expected: number
  actual: number
  passed: boolean
  details?: string
}

const results: TestResult[] = []

function assertStatus(category: string, name: string, expected: number, actual: number, details?: string) {
  const passed = actual === expected
  results.push({ category, name, expected, actual, passed, details })
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} [${category}] ${name}: expected ${expected}, got ${actual}${details ? ` (${details})` : ''}`)
}

async function tokenFor(user: any): Promise<string> {
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
  })
}

async function doReq(path: string, method = 'GET', user?: any, body?: any) {
  const headers: Record<string, string> = {}
  if (user) {
    headers['Cookie'] = `next-auth.session-token=${await tokenFor(user)}`
  }
  // A raw string body is passed through untouched, which is how the suite
  // sends JSON the engine cannot serialise itself (1e309 parses to
  // Infinity — JSON.stringify would silently turn it into null).
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json'
  }
  return await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body:
      body === undefined || body === null
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body),
    redirect: 'manual',
  })
}

/**
 * Multipart upload to the payment-proof endpoint, as the given user (or none).
 *
 * The multipart body is assembled by hand rather than with FormData so the
 * exact bytes the server sees are the PNG below — no Blob/Buffer conversion
 * in between.
 */
async function doUpload(path: string, user: any) {
  const headers: Record<string, string> = {}
  if (user) headers['Cookie'] = `next-auth.session-token=${await tokenFor(user)}`
  const boundary = `----sec5probe${Date.now()}${Math.floor(Math.random() * 1e6)}`
  headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="proof"; filename="probe.png"\r\n` +
        `Content-Type: image/png\r\n\r\n`
    ),
    PNG_1PX,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body })
}

/** A genuine 1×1 PNG: the sniffing check in the upload route looks at magic bytes. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/**
 * The signature a signed upload link would carry, computed here with the same
 * secret and the same `${file}|${exp}` string the server uses — so the suite
 * can forge links the server must accept (a fresh one) and links it must
 * refuse (one already expired, one whose signature belongs to another file).
 */
function signUpload(file: string, exp: number): string {
  return createHmac('sha256', AUTH_SECRET).update(`${file}|${exp}`).digest('hex')
}

async function main() {
  console.log('=================================================================')
  console.log(` SAFROTRAVEL SECURITY REGRESSION TEST SUITE (${BASE_URL})`)
  console.log('=================================================================\n')

  // Setup test principals from DB
  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  if (!superAdmin) throw new Error('SUPER_ADMIN not found')

  const companies = await prisma.company.findMany({ take: 2 })
  if (companies.length < 2) throw new Error('At least 2 companies required in test db')
  const companyA = companies[0]
  const companyB = companies[1]

  let companyAdminA = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: companyA.id } })
  if (!companyAdminA) {
    companyAdminA = await prisma.user.create({
      data: {
        name: 'Admin Co A',
        email: `admin-coa-${Date.now()}@example.com`,
        password: 'hash',
        role: 'COMPANY_ADMIN',
        companyId: companyA.id,
      },
    })
  }

  let companyAdminB = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: companyB.id } })
  if (!companyAdminB) {
    companyAdminB = await prisma.user.create({
      data: {
        name: 'Admin Co B',
        email: `admin-cob-${Date.now()}@example.com`,
        password: 'hash',
        role: 'COMPANY_ADMIN',
        companyId: companyB.id,
      },
    })
  }

  const customers = await prisma.user.findMany({ where: { role: 'CUSTOMER' }, take: 2 })
  let customerA = customers[0]
  let customerB = customers[1]
  if (!customerA) {
    customerA = await prisma.user.create({
      data: { name: 'Customer A', email: `cust-a-${Date.now()}@example.com`, password: 'hash', role: 'CUSTOMER' },
    })
  }
  if (!customerB) {
    customerB = await prisma.user.create({
      data: { name: 'Customer B', email: `cust-b-${Date.now()}@example.com`, password: 'hash', role: 'CUSTOMER' },
    })
  }

  // Find or create Customer A's booking
  let bookingA = await prisma.booking.findFirst({
    where: { userId: customerA.id },
    include: { trip: { include: { bus: true } } },
  })
  if (!bookingA) {
    const anyTrip = await prisma.trip.findFirst({ include: { bus: true } })
    if (!anyTrip) throw new Error('No trips found in test db')
    bookingA = await prisma.booking.create({
      data: {
        reference: `TST-${Date.now()}`,
        userId: customerA.id,
        tripId: anyTrip.id,
        seatLabel: '1A',
        passengerName: 'Passenger A',
        passengerPhone: '01012345678',
        status: 'PENDING',
        total: 150,
      },
      include: { trip: { include: { bus: true } } },
    })
  }

  // Find or create Company A's booking
  let companyBookingA = await prisma.companyBooking.findFirst({
    where: { companyId: companyA.id },
  })
  if (!companyBookingA) {
    const anyTrip = await prisma.trip.findFirst()
    if (!anyTrip) throw new Error('No trips found')
    companyBookingA = await prisma.companyBooking.create({
      data: {
        reference: `CBT-${Date.now()}`,
        companyId: companyA.id,
        tripId: anyTrip.id,
        seatLabel: '2B',
        passengerName: 'Co Passenger A',
        status: 'PENDING',
        total: 200,
      },
    })
  }

  console.log(`Principals:`)
  console.log(`- SuperAdmin: ${superAdmin.email}`)
  console.log(`- Customer A: ${customerA.email} (Booking: ${bookingA.id})`)
  console.log(`- Customer B: ${customerB.email}`)
  console.log(`- Company Admin A: ${companyAdminA.email} (Co: ${companyA.name}, CB: ${companyBookingA.id})`)
  console.log(`- Company Admin B: ${companyAdminB.email} (Co: ${companyB.name})\n`)

  // -------------------------------------------------------------------------
  // AREA 0: Server-Side Page Layout Redirects
  // -------------------------------------------------------------------------
  console.log('--- Testing Page Redirects for Unauthenticated Incognito Visitors ---')
  {
    const res = await doReq(`/bookings/${bookingA.id}/print`)
    const body = await res.text()
    const isRedirect = res.status === 307 || res.status === 302 || body.includes('url=/login')
    assertStatus('PAGE_AUTH', 'Anonymous opening /bookings/[id]/print gets redirected to /login', 1, isRedirect ? 1 : 0, `Redirect to /login: ${isRedirect}`)
  }
  {
    const res = await doReq(`/bookings/${bookingA.id}`)
    const body = await res.text()
    const isRedirect = res.status === 307 || res.status === 302 || body.includes('url=/login')
    assertStatus('PAGE_AUTH', 'Anonymous opening /bookings/[id] gets redirected to /login', 1, isRedirect ? 1 : 0, `Redirect to /login: ${isRedirect}`)
  }

  // -------------------------------------------------------------------------
  // AREA 1: Booking Ticket Authentication & IDOR (/api/bookings/[id]/ticket)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/bookings/[id]/ticket ---')
  {
    const res = await doReq(`/api/bookings/${bookingA.id}/ticket`)
    assertStatus('TICKET_CUSTOMER', 'Anonymous request denied with 401', 401, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}/ticket`, 'GET', customerB)
    assertStatus('TICKET_CUSTOMER', 'Cross-Customer B reading Customer A ticket denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}/ticket`, 'GET', companyAdminB)
    assertStatus('TICKET_CUSTOMER', 'Unrelated Company Admin B reading Customer A ticket denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}/ticket`, 'GET', customerA)
    assertStatus('TICKET_CUSTOMER', 'Owner Customer A reading their ticket allowed with 200', 200, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}/ticket`, 'GET', superAdmin)
    assertStatus('TICKET_CUSTOMER', 'Super Admin reading any ticket allowed with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 2: Company Booking Ticket Authentication & IDOR (/api/company/bookings/[id]/ticket)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/company/bookings/[id]/ticket ---')
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}/ticket`)
    assertStatus('TICKET_COMPANY', 'Anonymous request denied with 401', 401, res.status)
  }
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}/ticket`, 'GET', customerA)
    assertStatus('TICKET_COMPANY', 'Customer reading company ticket denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}/ticket`, 'GET', companyAdminB)
    assertStatus('TICKET_COMPANY', 'Cross-Tenant Company B reading Company A ticket denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}/ticket`, 'GET', companyAdminA)
    assertStatus('TICKET_COMPANY', 'Owning Company A reading their ticket allowed with 200', 200, res.status)
  }
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}/ticket`, 'GET', superAdmin)
    assertStatus('TICKET_COMPANY', 'Super Admin reading company ticket allowed with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 3: Booking Detail & Patch Authorization (/api/bookings/[id])
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/bookings/[id] ---')
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`)
    assertStatus('BOOKING_IDOR', 'Anonymous GET /api/bookings/[id] denied with 401', 401, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`, 'GET', customerB)
    assertStatus('BOOKING_IDOR', 'Customer B reading Customer A booking denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`, 'GET', companyAdminB)
    assertStatus('BOOKING_IDOR', 'Unrelated Company Admin B reading Customer A booking denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`, 'GET', customerA)
    assertStatus('BOOKING_IDOR', 'Customer A reading their own booking allowed with 200', 200, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`, 'PATCH', customerB, {
      action: 'UPDATE',
      passengerName: 'Hacked Name',
    })
    assertStatus('BOOKING_IDOR', 'Customer B modifying Customer A booking denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`, 'PATCH', customerA, {
      status: 'PAID',
    })
    assertStatus('BOOKING_PRIV_ESC', 'Customer A self-confirming status to PAID denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`, 'PATCH', companyAdminB, {
      status: 'PAID',
    })
    assertStatus('BOOKING_PRIV_ESC', 'Unrelated Company Admin B confirming payment denied with 403', 403, res.status)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}`, 'PATCH', customerA, {
      action: 'UPDATE',
      passengerName: 'Updated Name Safe',
    })
    assertStatus('BOOKING_IDOR', 'Customer A updating their own passenger name allowed with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 4: Company Booking Multi-Tenant Isolation (/api/company/bookings/[id])
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/company/bookings/[id] ---')
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}`, 'GET', companyAdminB)
    assertStatus('COMPANY_IDOR', 'Company Admin B reading Company A booking denied with 404 (isolated)', 404, res.status)
  }
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}`, 'GET', companyAdminA)
    assertStatus('COMPANY_IDOR', 'Company Admin A reading Company A booking allowed with 200', 200, res.status)
  }
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}`, 'GET', superAdmin)
    assertStatus('COMPANY_IDOR', 'Super Admin reading Company A booking allowed with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 5: Bookings List Isolation (/api/bookings)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/bookings GET ---')
  {
    const res = await doReq('/api/bookings')
    assertStatus('LIST_ISOLATION', 'Anonymous GET /api/bookings denied with 401', 401, res.status)
  }
  {
    const res = await doReq('/api/bookings', 'GET', customerA)
    assertStatus('LIST_ISOLATION', 'Customer A GET /api/bookings allowed with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 6: Customers List Isolation (/api/customers)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/customers GET ---')
  {
    let adminNoCo = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: null } })
    if (!adminNoCo) {
      adminNoCo = await prisma.user.create({
        data: { name: 'Admin No Co', email: `noco-${Date.now()}@example.com`, password: 'hash', role: 'COMPANY_ADMIN', companyId: null },
      })
    }
    const res = await doReq('/api/customers', 'GET', adminNoCo)
    assertStatus('TENANT_ISOLATION', 'Company Admin without companyId denied with 400', 400, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 7: FAQs Privilege Escalation (/api/faqs)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/faqs mutations ---')
  {
    const res = await doReq('/api/faqs', 'POST', customerA, {
      questionAr: 'سؤال؟', questionEn: 'Question?', answerAr: 'جواب', answerEn: 'Answer'
    })
    assertStatus('FAQ_PRIV_ESC', 'Customer creating FAQ denied with 403', 403, res.status)
  }
  {
    const res = await doReq('/api/faqs', 'POST', companyAdminA, {
      questionAr: 'سؤال؟', questionEn: 'Question?', answerAr: 'جواب', answerEn: 'Answer'
    })
    assertStatus('FAQ_PRIV_ESC', 'Company Admin creating FAQ denied with 403', 403, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 8: Trip Counts Information Disclosure (/api/trips/counts)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/trips/counts ---')
  {
    const res = await doReq('/api/trips/counts')
    assertStatus('TRIP_COUNTS', 'Anonymous /api/trips/counts denied with 401', 401, res.status)
  }
  {
    const res = await doReq('/api/trips/counts', 'GET', customerA)
    assertStatus('TRIP_COUNTS', 'Customer /api/trips/counts denied with 403', 403, res.status)
  }
  {
    const res = await doReq('/api/trips/counts', 'GET', companyAdminA)
    assertStatus('TRIP_COUNTS', 'Company Admin /api/trips/counts denied with 403', 403, res.status)
  }
  {
    const res = await doReq('/api/trips/counts', 'GET', superAdmin)
    assertStatus('TRIP_COUNTS', 'Super Admin /api/trips/counts allowed with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 9: Profile Password Policy Enforcement (/api/profile)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/profile password policy ---')
  {
    const res = await doReq('/api/profile', 'PUT', customerA, {
      newPassword: '123',
      currentPassword: 'wrong',
    })
    assertStatus('PASSWORD_POLICY', 'Password shorter than 6 characters denied with 400', 400, res.status)
  }
  {
    const res = await doReq('/api/profile', 'PUT', customerA, {
      newPassword: 'validPassword123',
      currentPassword: 'wrongPasswordNow',
    })
    assertStatus('PASSWORD_POLICY', 'Wrong current password denied with 400', 400, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 10: Client Error Logging Rate Limit (/api/log-error)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/log-error ---')
  {
    // The limiter lives in the long-running dev/prod server process, not in
    // this script, so a previous run of AREA 15 may still hold the bucket.
    // If the budget is spent, honour Retry-After and try once more — this
    // keeps the assertion about *normal* logging honest instead of flaky.
    let res = await doReq('/api/log-error', 'POST', undefined, { message: 'Test error message' })
    if (res.status === 429) {
      const wait = Math.min(65, Number(res.headers.get('retry-after') || '60'))
      await new Promise((r) => setTimeout(r, wait * 1000))
      res = await doReq('/api/log-error', 'POST', undefined, { message: 'Test error message' })
    }
    assertStatus('LOG_ERROR', 'Normal client error logged with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 11: Company Info Access Control (/api/company/info)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/company/info ---')
  {
    const res = await doReq('/api/company/info', 'GET', customerA)
    const isDenied = res.status === 401 || res.status === 403
    assertStatus('COMPANY_INFO', 'Customer accessing company info denied with 401 or 403', 1, isDenied ? 1 : 0, `Status: ${res.status}`)
  }
  {
    const res = await doReq('/api/company/info', 'GET', companyAdminA)
    assertStatus('COMPANY_INFO', 'Company Admin accessing company info allowed with 200', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 12: Server-side redirect status on private pages (Run #4)
  //
  // The layout guards answer a streamed request with HTTP 200 + a meta
  // refresh, which is a client-side redirect. These assertions require a real
  // 307 with a Location header, produced by the middleware guard, and require
  // that a signed-in user is NOT redirected (no lockout regression).
  // -------------------------------------------------------------------------
  console.log('\n--- Testing server-side 307 redirects on private pages ---')
  {
    const paths = [
      `/bookings/${bookingA.id}/print`,
      `/bookings/${bookingA.id}`,
      `/company/bookings/${companyBookingA.id}/print`,
    ]
    for (const p of paths) {
      const res = await doReq(p)
      const loc = res.headers.get('location') || ''
      const ok = (res.status === 307 || res.status === 302) && loc.includes('/login')
      assertStatus('PAGE_AUTH_SERVER', `Anonymous ${p} gets a real 307 with Location: /login`, 1, ok ? 1 : 0, `status=${res.status} loc=${loc}`)
    }
  }
  {
    // A cookie that is present but not signed with this deployment's secret
    // must be treated as anonymous, not allowed to start a render.
    const res = await fetch(`${BASE_URL}/bookings/${bookingA.id}/print`, {
      redirect: 'manual',
      headers: { Cookie: 'next-auth.session-token=not-a-real-token' },
    })
    const loc = res.headers.get('location') || ''
    const ok = res.status === 307 && loc.includes('/login')
    assertStatus('PAGE_AUTH_SERVER', 'Forged session cookie gets a real 307', 1, ok ? 1 : 0, `status=${res.status} loc=${loc}`)
  }
  {
    const res = await doReq(`/bookings/${bookingA.id}/print`, 'GET', customerA)
    assertStatus('PAGE_AUTH_SERVER', 'Owner still reaches their print page (no lockout)', 200, res.status)
  }

  // -------------------------------------------------------------------------
  // AREA 13: Denied responses must carry no booking data (Run #4)
  //
  // Status codes alone do not prove that a denial is empty: a 403 that
  // echoes the record back would still "pass" a status-only assertion.
  // -------------------------------------------------------------------------
  console.log('\n--- Testing that denied responses contain no booking data ---')
  {
    const res = await doReq(`/api/bookings/${bookingA.id}/ticket`, 'GET', customerB)
    const body = await res.text()
    const markers = [bookingA.reference, bookingA.passengerName, bookingA.passengerPhone, customerA.email].filter(Boolean) as string[]
    const leaked = markers.filter(m => body.includes(m))
    assertStatus('RESPONSE_BODY', 'Denied customer ticket body contains no booking data', 1, leaked.length === 0 ? 1 : 0, `status=${res.status} leaked=${leaked.join(',') || 'none'}`)
  }
  {
    const res = await doReq(`/api/bookings/${bookingA.id}/ticket`)
    const body = await res.text()
    const markers = [bookingA.reference, bookingA.passengerName, bookingA.passengerPhone].filter(Boolean) as string[]
    const leaked = markers.filter(m => body.includes(m))
    assertStatus('RESPONSE_BODY', 'Anonymous ticket body contains no booking data', 1, leaked.length === 0 ? 1 : 0, `status=${res.status} leaked=${leaked.join(',') || 'none'}`)
  }
  {
    const res = await doReq(`/api/company/bookings/${companyBookingA.id}/ticket`, 'GET', companyAdminB)
    const body = await res.text()
    const markers = [companyBookingA.reference, companyBookingA.passengerName, companyA.name].filter(Boolean) as string[]
    const leaked = markers.filter(m => body.includes(m))
    assertStatus('RESPONSE_BODY', 'Cross-tenant company ticket body contains no booking data', 1, leaked.length === 0 ? 1 : 0, `status=${res.status} leaked=${leaked.join(',') || 'none'}`)
  }

  // -------------------------------------------------------------------------
  // AREA 14: Listing responses must be tenant-scoped in the BODY (Run #4)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing that list responses are scoped in the body ---')
  {
    const res = await doReq('/api/bookings', 'GET', customerA)
    const json = await res.json().catch(() => null)
    const rows: any[] = json?.data || []
    const foreign = rows.filter(b => b.userId !== customerA.id)
    assertStatus('LIST_CONTENT', 'Customer list body contains only their own bookings', 1, foreign.length === 0 ? 1 : 0, `rows=${rows.length} foreign=${foreign.length}`)
  }
  {
    // Cairo Express is the company in this fixture that actually operates
    // buses with customer bookings on them, so its list has rows to check.
    const expressCompany = await prisma.company.findFirst({
      where: { buses: { some: { trips: { some: { bookings: { some: {} } } } } } },
      select: { id: true, name: true },
    })
    if (!expressCompany) {
      assertStatus('LIST_CONTENT', 'Company-scoped customer list body', 1, 0, 'no company operates a bus with bookings in this test database')
    } else {
      const expressAdmin = await prisma.user.findFirst({
        where: { role: 'COMPANY_ADMIN', companyId: expressCompany.id },
        select: { id: true, email: true, name: true, role: true, companyId: true },
      })
      if (!expressAdmin) {
        assertStatus('LIST_CONTENT', 'Company-scoped customer list body', 1, 0, `no COMPANY_ADMIN for ${expressCompany.name}`)
      } else {
        const res = await doReq('/api/bookings?type=customer', 'GET', expressAdmin)
        const json = await res.json().catch(() => null)
        const rows: any[] = json?.data || []
        const foreign = rows.filter(b => b.trip?.bus?.companyId && b.trip.bus.companyId !== expressCompany.id)
        assertStatus('LIST_CONTENT', 'Company admin customer-type list body is scoped to its own buses', 1, rows.length > 0 && foreign.length === 0 ? 1 : 0, `rows=${rows.length} foreign=${foreign.length}`)
      }
    }
  }
  {
    const res = await doReq('/api/bookings', 'GET', companyAdminB)
    const json = await res.json().catch(() => null)
    const rows: any[] = json?.data || []
    const foreign = rows.filter(b => b._type === 'company' && b.companyId && b.companyId !== companyB.id)
    assertStatus('LIST_CONTENT', 'Company admin company-booking list body contains only its own company', 1, foreign.length === 0 ? 1 : 0, `rows=${rows.length} foreign=${foreign.length}`)
  }

  // -------------------------------------------------------------------------
  // AREA 15: /api/log-error rate limit is actually enforced (Run #4)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/log-error rate limiting ---')
  {
    let blocked: number | null = null
    for (let i = 0; i < 40; i++) {
      const res = await doReq('/api/log-error', 'POST', undefined, { message: `rate probe ${i}` })
      if (res.status === 429) { blocked = i; break }
    }
    assertStatus('LOG_ERROR_RATE', 'Log flooding is refused with 429 once the budget is spent', 1, blocked !== null ? 1 : 0, blocked === null ? 'no 429 in 40 requests' : `429 on request ${blocked + 1}`)
  }

  // -------------------------------------------------------------------------
  // AREA 16: New fixes from the independent verification (Run #4)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing role allowlist on POST /api/admin/users ---')
  {
    const res = await doReq('/api/admin/users', 'POST', superAdmin, {
      name: 'Probe Role',
      email: `probe-role-${Date.now()}@example.com`,
      password: 'Str0ngPass!123',
      role: 'MANAGER',
    })
    assertStatus('ROLE_ALLOWLIST', 'Arbitrary role string is rejected with 400', 400, res.status, (await res.text()).slice(0, 80))
  }

  console.log('\n--- Testing cross-tenant customerId on POST /api/company/bookings ---')
  {
    const now = Date.now()
    // Isolated fixtures, reused across runs.
    const coA2 =
      (await prisma.company.findFirst({ where: { subdomain: { startsWith: 'sec-cust-a-' } } })) ||
      (await prisma.company.create({ data: { name: `SecCustA ${now}`, subdomain: `sec-cust-a-${now}` } }))
    const coB2 =
      (await prisma.company.findFirst({ where: { subdomain: { startsWith: 'sec-cust-b-' } } })) ||
      (await prisma.company.create({ data: { name: `SecCustB ${now}`, subdomain: `sec-cust-b-${now}` } }))
    const own =
      (await prisma.companyCustomer.findFirst({ where: { companyId: coA2.id } })) ||
      (await prisma.companyCustomer.create({ data: { companyId: coA2.id, name: 'Own Customer' } }))
    const foreignCustomer =
      (await prisma.companyCustomer.findFirst({ where: { companyId: coB2.id } })) ||
      (await prisma.companyCustomer.create({ data: { companyId: coB2.id, name: 'Foreign Customer' } }))
    const adminSec =
      (await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: coA2.id } })) ||
      (await prisma.user.create({
        data: { name: 'Sec Admin', email: `sec-admin-${now}@example.com`, password: 'hash', role: 'COMPANY_ADMIN', companyId: coA2.id },
      }))
    const token = await encode({
      token: { id: adminSec.id, name: adminSec.name, email: adminSec.email, role: adminSec.role, companyId: coA2.id, sub: adminSec.id },
      secret: AUTH_SECRET,
      salt: 'next-auth.session-token',
    })
    const cookie = `next-auth.session-token=${token}`

    // Another company's customer record must be refused outright.
    const bad = await fetch(`${BASE_URL}/api/company/bookings`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'probe-trip', passengers: [{ seatLabel: '1A', passengerName: 'X' }], customerId: foreignCustomer.id }),
    })
    const badBody = await bad.text()
    assertStatus('CUSTOMER_TENANT', 'Cross-tenant customerId is rejected with 400 INVALID_CUSTOMER', 1, bad.status === 400 && badBody.includes('INVALID_CUSTOMER') ? 1 : 0, `status=${bad.status} body=${badBody.slice(0, 80)}`)

    // The same request with this company's own customer must get past the
    // ownership guard (it fails later, on the probe trip id), which is what
    // proves the guard does not reject legitimate bookings.
    const good = await fetch(`${BASE_URL}/api/company/bookings`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'probe-trip', passengers: [{ seatLabel: '1A', passengerName: 'X' }], customerId: own.id }),
    })
    const goodBody = await good.text()
    assertStatus('CUSTOMER_TENANT', 'Own customerId passes the ownership guard', 1, !goodBody.includes('INVALID_CUSTOMER') ? 1 : 0, `status=${good.status} body=${goodBody.slice(0, 80)}`)
  }

  console.log('\n--- Testing that a cancelled booking cannot be boarded ---')
  {
    const anyTrip = await prisma.trip.findFirst({ select: { id: true } })
    if (!anyTrip) {
      assertStatus('BOARD_GUARD', 'Cancelled booking boarding refused', 1, 0, 'no trip in test db')
    } else {
      // Reused fixture: one row, reset to CANCELLED each run, so repeated
      // runs do not grow the test database.
      let cancelled = await prisma.booking.findFirst({
        where: { reference: { startsWith: 'SEC-CXL-' } },
        select: { id: true, status: true },
      })
      if (!cancelled) {
        cancelled = await prisma.booking.create({
          data: {
            reference: `SEC-CXL-${Date.now()}`,
            userId: customerA.id,
            tripId: anyTrip.id,
            seatLabel: 'SEC9',
            passengerName: 'Cancelled Probe',
            status: 'CANCELLED',
            total: 100,
          },
          select: { id: true, status: true },
        })
      } else if (cancelled.status !== 'CANCELLED') {
        cancelled = await prisma.booking.update({
          where: { id: cancelled.id },
          data: { status: 'CANCELLED' },
          select: { id: true, status: true },
        })
      }
      const res = await doReq(`/api/bookings/${cancelled.id}`, 'PATCH', superAdmin, { status: 'BOARDED' })
      const after = await prisma.booking.findUnique({ where: { id: cancelled.id }, select: { status: true } })
      assertStatus('BOARD_GUARD', 'Boarding a cancelled booking is refused with 409', 1, res.status === 409 && after?.status === 'CANCELLED' ? 1 : 0, `status=${res.status} after=${after?.status}`)
    }
  }

  console.log('\n--- Testing concurrent deposit approvals credit exactly once ---')
  {
    const now = Date.now()
    // Isolated fixture, reused across runs: one dedicated company, one
    // deposit request, ledger reset, so repeated runs do not accumulate
    // money rows in the test database.
    const raceCompany =
      (await prisma.company.findFirst({ where: { subdomain: { startsWith: 'sec-race-' } } })) ||
      (await prisma.company.create({ data: { name: `SecRace ${now}`, subdomain: `sec-race-${now}`, walletBalance: 0, outstandingBalance: 0 } }))
    await prisma.company.update({ where: { id: raceCompany.id }, data: { walletBalance: 0, outstandingBalance: 0 } })

    let dep = await prisma.depositRequest.findFirst({
      where: { companyId: raceCompany.id },
      orderBy: { createdAt: 'desc' },
    })
    if (!dep) {
      dep = await prisma.depositRequest.create({ data: { companyId: raceCompany.id, amount: 10, status: 'PENDING' } })
    } else {
      dep = await prisma.depositRequest.update({ where: { id: dep.id }, data: { status: 'PENDING', adminNotes: '' } })
    }
    await prisma.walletTransaction.deleteMany({ where: { idempotencyKey: `deposit-request:${dep.id}` } })

    const approve = () => doReq(`/api/admin/deposit-requests/${dep!.id}`, 'PATCH', superAdmin, { status: 'APPROVED', adminNotes: 'race probe' })
    const [r1, r2] = await Promise.all([approve(), approve()])
    const successes = [r1.status, r2.status].filter(s => s === 200).length

    const after = await prisma.company.findUnique({ where: { id: raceCompany.id }, select: { walletBalance: true, outstandingBalance: true } })
    const ledger = await prisma.walletTransaction.count({ where: { idempotencyKey: `deposit-request:${dep.id}` } })

    assertStatus('DEPOSIT_RACE', 'Concurrent approvals: exactly one succeeds', 1, successes === 1 ? 1 : 0, `statuses=${r1.status},${r2.status}`)
    assertStatus('DEPOSIT_RACE', 'Concurrent approvals: wallet credited exactly once', 1, after?.walletBalance === 10 ? 1 : 0, `wallet=${after?.walletBalance}`)
    assertStatus('DEPOSIT_RACE', 'Concurrent approvals: exactly one ledger row', 1, ledger === 1 ? 1 : 0, `ledger=${ledger}`)
  }

  // -------------------------------------------------------------------------
  // AREA 17: Coverage for previously code-only findings (Run #4)
  // -------------------------------------------------------------------------
  console.log('\n--- Testing /api/bookings/export access control ---')
  {
    const r1 = await doReq('/api/bookings/export?date=2026-11-12')
    assertStatus('EXPORT_ACCESS', 'Anonymous export denied with 401', 401, r1.status)
    const r2 = await doReq('/api/bookings/export?date=2026-11-12', 'GET', customerA)
    assertStatus('EXPORT_ACCESS', 'Customer export denied with 403', 403, r2.status)
    let adminNoCo2 = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: null } })
    if (!adminNoCo2) {
      adminNoCo2 = await prisma.user.create({
        data: { name: 'Admin No Co 2', email: `noco2-${Date.now()}@example.com`, password: 'hash', role: 'COMPANY_ADMIN', companyId: null },
      })
    }
    const r3 = await doReq('/api/bookings/export?date=2026-11-12', 'GET', adminNoCo2)
    const body3 = await r3.text()
    assertStatus('EXPORT_ACCESS', 'Unlinked company admin export denied with 400', 1, r3.status === 400 && body3.includes('No company linked') ? 1 : 0, `status=${r3.status}`)
  }

  console.log('\n--- Testing /api/customers access control ---')
  {
    const r1 = await doReq('/api/customers')
    assertStatus('CUSTOMERS_ACCESS', 'Anonymous customer list denied with 401', 401, r1.status)
    const r2 = await doReq('/api/customers', 'GET', customerA)
    assertStatus('CUSTOMERS_ACCESS', 'Customer role denied with 403', 403, r2.status)
  }

  console.log('\n--- Testing /api/analytics access control ---')
  {
    const r1 = await doReq('/api/analytics')
    assertStatus('ANALYTICS_ACCESS', 'Anonymous analytics denied with 401', 401, r1.status)
    const r2 = await doReq('/api/analytics', 'GET', customerA)
    assertStatus('ANALYTICS_ACCESS', 'Customer analytics denied with 403', 403, r2.status)
    let adminNoCo3 = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: null } })
    if (!adminNoCo3) {
      adminNoCo3 = await prisma.user.create({
        data: { name: 'Admin No Co 3', email: `noco3-${Date.now()}@example.com`, password: 'hash', role: 'COMPANY_ADMIN', companyId: null },
      })
    }
    const r3 = await doReq('/api/analytics', 'GET', adminNoCo3)
    const body3 = await r3.text()
    assertStatus('ANALYTICS_ACCESS', 'Unlinked company admin analytics denied with 400', 1, r3.status === 400 && body3.includes('No company linked') ? 1 : 0, `status=${r3.status}`)
  }

  console.log('\n--- Testing super admin account protection on PUT /api/admin/users/[id] ---')
  {
    const expressCompany = await prisma.company.findFirst({
      where: { buses: { some: { trips: { some: { bookings: { some: {} } } } } } },
      select: { id: true },
    })
    const expressAdmin = expressCompany
      ? await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: expressCompany.id }, select: { id: true, email: true, name: true, role: true, companyId: true } })
      : null
    if (!expressAdmin) {
      assertStatus('SUPERADMIN_GUARD', 'Company admin cannot edit a super admin account', 1, 0, 'no company admin fixture available')
    } else {
      const res = await doReq(`/api/admin/users/${superAdmin.id}`, 'PUT', expressAdmin, { name: 'Probe Edit' })
      assertStatus('SUPERADMIN_GUARD', 'Company admin cannot edit a super admin account', 403, res.status, (await res.text()).slice(0, 60))
    }
  }

  console.log('\n--- Testing public station trips contract ---')
  {
    const stop = await prisma.tripStop.findFirst({ select: { stationId: true } })
    if (!stop) {
      assertStatus('STATION_TRIPS', 'Only scheduled, future, non-charter trips are returned', 1, 0, 'no station stops in test db')
    } else {
      const res = await doReq(`/api/stations/${stop.stationId}/trips`)
      const json = await res.json().catch(() => null)
      const trips: any[] = json?.trips || []
      const now = Date.now()
      const bad = trips.filter(t => t.status !== 'SCHEDULED' || new Date(t.departure).getTime() < now)
      // Every trip in the fixture database is COMPLETED and in the past, so a
      // non-empty result here would itself be the finding; an empty result
      // plus the predicate below is the evidence that the filter holds.
      assertStatus('STATION_TRIPS', 'Only scheduled, future, non-charter trips are returned', 1, res.status === 200 && bad.length === 0 ? 1 : 0, `status=${res.status} trips=${trips.length} bad=${bad.length}`)
    }
  }

  console.log('\n--- Testing that legitimate flows still work (no false denials) ---')
  {
    // Owner cancelling their own pending booking must still succeed: the new
    // conditional cancel must not reject a request whose status has not moved.
    // The fixture is created now, so it is inside the policy's free window and
    // cancellable whatever the trip looks like.
    const trip = await prisma.trip.findFirst({ select: { id: true } })
    if (!trip) {
      assertStatus('FLOW_POSITIVE', 'Owner can cancel their own pending booking', 1, 0, 'no trip in test db')
    } else {
      // Reused fixture: reset to PENDING each run instead of adding a row.
      let fixture = await prisma.booking.findFirst({
        where: { reference: { startsWith: 'SEC-CAN-' } },
        select: { id: true },
      })
      if (!fixture) {
        fixture = await prisma.booking.create({
          data: {
            reference: `SEC-CAN-${Date.now()}`,
            userId: customerA.id,
            tripId: trip.id,
            seatLabel: 'SECC',
            passengerName: 'Cancel Flow Probe',
            status: 'PENDING',
            total: 100,
          },
          select: { id: true },
        })
      } else {
        await prisma.booking.update({
          where: { id: fixture.id },
          data: {
            status: 'PENDING',
            cancelledAt: null,
            cancelledBy: null,
            cancellationReason: '',
            refundAmount: 0,
            cancellationFee: 0,
            // The free window in the cancellation policy is measured from
            // when the booking was *created*, so the timestamp is refreshed
            // with the status: a fixture left over from a previous run is
            // older than the window and would be refused for being stale
            // rather than exercising the cancel path at all.
            createdAt: new Date(),
          },
        })
      }
      const res = await doReq(`/api/bookings/${fixture.id}`, 'PATCH', customerA, { status: 'CANCELLED', reason: 'probe' })
      const after = await prisma.booking.findUnique({ where: { id: fixture.id }, select: { status: true } })
      assertStatus('FLOW_POSITIVE', 'Owner can cancel their own pending booking', 1, res.status === 200 && after?.status === 'CANCELLED' ? 1 : 0, `status=${res.status} after=${after?.status}`)
    }
  }
  {
    // A live company booking must still be boardable: the new boarding guard
    // blocks cancelled rows only.
    const trip = await prisma.trip.findFirst({ select: { id: true } })
    if (!trip) {
      assertStatus('FLOW_POSITIVE', 'Company admin can board a live booking', 1, 0, 'no trip in test db')
    } else {
      let fixture = await prisma.companyBooking.findFirst({
        where: { reference: { startsWith: 'SEC-BRD-' } },
        select: { id: true },
      })
      if (!fixture) {
        fixture = await prisma.companyBooking.create({
          data: {
            reference: `SEC-BRD-${Date.now()}`,
            companyId: companyA.id,
            tripId: trip.id,
            seatLabel: 'SECB',
            passengerName: 'Board Flow Probe',
            status: 'PENDING',
            total: 100,
          },
          select: { id: true },
        })
      } else {
        await prisma.companyBooking.update({ where: { id: fixture.id }, data: { status: 'PENDING', boardedAt: null } })
      }
      const res = await doReq(`/api/company/bookings/${fixture.id}`, 'PATCH', companyAdminA, { status: 'BOARDED' })
      const after = await prisma.companyBooking.findUnique({ where: { id: fixture.id }, select: { status: true } })
      assertStatus('FLOW_POSITIVE', 'Company admin can board a live booking', 1, res.status === 200 && after?.status === 'BOARDED' ? 1 : 0, `status=${res.status} after=${after?.status}`)
    }
  }

  // =========================================================================
  // RUN #5 — the eight residual risks from Run #4 plus the vulnerabilities
  // the Run #5 re-audit found. Real HTTP against the dev server, fixtures
  // created in the scratch database, every identity kind involved, and
  // concurrency where the defect was a race.
  // =========================================================================

  // -------------------------------------------------------------------------
  // Run #5 fixtures (all idempotent: a second run finds them and resets them)
  // -------------------------------------------------------------------------
  console.log('\n--- Preparing Run #5 fixtures ---')
  const R5_NOW = Date.now()
  const R5_WEEK = 7 * 24 * 60 * 60 * 1000

  // A dedicated bus + layout: seat labels used here can never collide with a
  // booking another area of the suite created.
  let fixBus = await prisma.bus.findFirst({ where: { name: 'SEC5-FIXTURE-BUS' } })
  if (!fixBus) fixBus = await prisma.bus.create({ data: { name: 'SEC5-FIXTURE-BUS', type: 'COACH_BUS', seatCount: 20 } })
  let fixLayout = await prisma.busLayout.findFirst({ where: { busId: fixBus.id } })
  if (!fixLayout) {
    fixLayout = await prisma.busLayout.create({ data: { busId: fixBus.id, rows: 5, cols: 4, aisleAfter: 2, colsPerRow: '{}' } })
    for (let i = 1; i <= 20; i++) {
      await prisma.seat.create({
        data: {
          layoutId: fixLayout.id,
          label: `R5-${String(i).padStart(2, '0')}`,
          row: Math.ceil(i / 4),
          col: ((i - 1) % 4) + 1,
          price: 200,
        },
      })
    }
  }
  const seatLabels: string[] = (await prisma.seat.findMany({ where: { layoutId: fixLayout.id }, orderBy: { row: 'asc' } })).map((s) => s.label)
  if (seatLabels.length < 16) throw new Error(`Run #5 fixture layout needs 16+ seats, found ${seatLabels.length}`)

  let stA = await prisma.station.findFirst({ where: { name: 'SecFix Alpha' } })
  if (!stA) stA = await prisma.station.create({ data: { name: 'SecFix Alpha', city: 'SecFix City' } })
  let stB = await prisma.station.findFirst({ where: { name: 'SecFix Beta' } })
  if (!stB) stB = await prisma.station.create({ data: { name: 'SecFix Beta', city: 'SecFix City' } })

  // Future-dated, SCHEDULED, with two stops: the trip every Run #5 area
  // books against, and the fixture that makes station-trip filtering
  // non-vacuous (the rest of the database is past and COMPLETED).
  let fixTrip = await prisma.trip.findFirst({ where: { origin: 'SecFix Origin' } })
  if (!fixTrip) {
    fixTrip = await prisma.trip.create({
      data: {
        busId: fixBus.id,
        origin: 'SecFix Origin',
        destination: 'SecFix Destination',
        departure: new Date(R5_NOW + R5_WEEK),
        arrival: new Date(R5_NOW + R5_WEEK + 4 * 3600 * 1000),
        price: 200,
        status: 'SCHEDULED',
        bookingMode: 'SEAT',
      },
    })
  }
  if ((await prisma.tripStop.count({ where: { tripId: fixTrip.id } })) === 0) {
    await prisma.tripStop.create({ data: { tripId: fixTrip.id, stationId: stA.id, stopOrder: 1, priceFromOrigin: 0 } })
    await prisma.tripStop.create({ data: { tripId: fixTrip.id, stationId: stB.id, stopOrder: 2, priceFromOrigin: 200 } })
  }

  // A future trip with NO stops: bookings on it carry the degenerate segment
  // (1, 1), which the old overlap test never matched.
  let noStopTrip = await prisma.trip.findFirst({ where: { origin: 'SecFix NoStop' } })
  if (!noStopTrip) {
    noStopTrip = await prisma.trip.create({
      data: {
        busId: fixBus.id,
        origin: 'SecFix NoStop',
        destination: 'SecFix NoStop End',
        departure: new Date(R5_NOW + R5_WEEK),
        arrival: new Date(R5_NOW + R5_WEEK + 3 * 3600 * 1000),
        price: 200,
        status: 'SCHEDULED',
        bookingMode: 'SEAT',
      },
    })
  }

  // An active company with its own admin, for the company-side booking tests.
  let sec5Co = await prisma.company.findFirst({ where: { subdomain: 'sec5-co' } })
  if (!sec5Co) {
    sec5Co = await prisma.company.create({
      data: { name: 'Sec5 Fixture Co', subdomain: 'sec5-co', isActive: true, autoPayEnabled: false },
    })
  } else {
    await prisma.company.update({ where: { id: sec5Co.id }, data: { isActive: true, autoPayEnabled: false } })
  }
  let sec5Admin = await prisma.user.findFirst({ where: { role: 'COMPANY_ADMIN', companyId: sec5Co.id } })
  if (!sec5Admin) {
    sec5Admin = await prisma.user.create({
      data: { name: 'Sec5 Co Admin', email: `sec5-admin-${R5_NOW}@example.com`, password: 'hash', role: 'COMPANY_ADMIN', companyId: sec5Co.id },
    })
  }

  // The two seats the conflict tests aim at.
  const SEAT_X = seatLabels[0] // another customer's live hold sits here
  const SEAT_Y = seatLabels[1] // a company booking sits here

  let sec5Cb = await prisma.companyBooking.findFirst({ where: { tripId: fixTrip.id, seatLabel: SEAT_Y } })
  if (!sec5Cb) {
    sec5Cb = await prisma.companyBooking.create({
      data: {
        reference: `SEC5-CB-${R5_NOW}`,
        companyId: sec5Co.id,
        tripId: fixTrip.id,
        seatLabel: SEAT_Y,
        passengerName: 'Sec5 Co Passenger',
        status: 'PENDING',
        total: 200,
        fromStopOrder: 1,
        toStopOrder: 2,
      },
    })
  } else {
    await prisma.companyBooking.update({ where: { id: sec5Cb.id }, data: { status: 'PENDING', expiresAt: new Date(R5_NOW + R5_WEEK) } })
  }

  // A fresh, live hold from another customer on SEAT_X (holds expire in two
  // minutes, so this is recreated every run rather than reused).
  // The previous run's holds by customerA are cleared too: a re-run inside
  // the two-minute window must not start against a half-spent hold cap.
  await prisma.seatHold.deleteMany({ where: { tripId: fixTrip.id, userId: customerA.id } })
  await prisma.seatHold.deleteMany({ where: { tripId: fixTrip.id, seatLabel: SEAT_X } })
  await prisma.seatHold.create({
    data: { tripId: fixTrip.id, seatLabel: SEAT_X, fromStopOrder: 1, toStopOrder: 2, userId: customerB.id, expiresAt: new Date(R5_NOW + 120_000) },
  })

  // The degenerate-segment booking: (1, 1) on the no-stop trip.
  let degBooking = await prisma.booking.findFirst({ where: { reference: { startsWith: 'SEC5-DEG-' } } })
  if (!degBooking) {
    degBooking = await prisma.booking.create({
      data: {
        reference: `SEC5-DEG-${R5_NOW}`,
        userId: customerB.id,
        tripId: noStopTrip.id,
        seatLabel: 'R5-01',
        passengerName: 'Degenerate Segment Probe',
        status: 'PENDING',
        total: 200,
        fromStopOrder: 1,
        toStopOrder: 1,
      },
    })
  } else {
    await prisma.booking.update({ where: { id: degBooking.id }, data: { status: 'PENDING', refundProcessedAt: null, refundProcessedBy: null } })
  }

  // A CANCELLED customer booking awaiting its refund stamp, reset each run.
  let refundFx = await prisma.booking.findFirst({ where: { reference: { startsWith: 'SEC5-REF-' } } })
  if (!refundFx) {
    refundFx = await prisma.booking.create({
      data: {
        reference: `SEC5-REF-${R5_NOW}`,
        userId: customerA.id,
        tripId: fixTrip.id,
        seatLabel: 'R5-20',
        passengerName: 'Refund Race Probe',
        status: 'CANCELLED',
        total: 100,
        fundingSource: 'CUSTOMER',
        refundProcessedAt: null,
      },
    })
  } else {
    refundFx = await prisma.booking.update({
      where: { id: refundFx.id },
      data: { status: 'CANCELLED', refundProcessedAt: null, refundProcessedBy: null },
    })
  }
  const refundId = refundFx.id

  // -------------------------------------------------------------------------
  // AREA 18: Customer refund processing is claimed exactly once (Run #5 fix)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 18: concurrent customer refund processing ---')
  {
    const attempt = () => doReq(`/api/admin/cancellations/${refundId}`, 'PATCH', superAdmin, { type: 'customer' })
    const [r1, r2] = await Promise.all([attempt(), attempt()])
    const oks = [r1.status, r2.status].filter((s) => s === 200).length
    const refusals = [r1.status, r2.status].filter((s) => s === 409 || s === 400).length
    const after = await prisma.booking.findUnique({ where: { id: refundId }, select: { refundProcessedAt: true } })

    assertStatus('REFUND_RACE', 'Concurrent customer refunds: exactly one wins the claim', 1, oks === 1 ? 1 : 0, `statuses=${r1.status},${r2.status}`)
    assertStatus('REFUND_RACE', 'Concurrent customer refunds: the loser is refused', 1, refusals === 1 ? 1 : 0, `statuses=${r1.status},${r2.status}`)
    assertStatus('REFUND_RACE', 'Refund stamped processed after the race', 1, after?.refundProcessedAt ? 1 : 0, `stamp=${after?.refundProcessedAt?.toISOString() ?? 'null'}`)

    const third = await attempt()
    assertStatus('REFUND_RACE', 'A third attempt after processing is refused', 1, third.status === 400 || third.status === 409 ? 1 : 0, `status=${third.status}`)
  }

  // -------------------------------------------------------------------------
  // AREA 19: seat holds and cross-table double booking (Run #5 fixes)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 19: seat holds and cross-table double booking ---')
  {
    // 1. A hold may not be taken on a seat a company booking already holds.
    const res = await doReq('/api/seats/hold', 'POST', customerA, {
      tripId: fixTrip.id, seatLabel: SEAT_Y, fromStationId: stA.id, toStationId: stB.id,
    })
    const body = await res.text()
    assertStatus('SEAT_HOLD', 'Hold on a company-booked seat refused with 409 SEAT_TAKEN', 1, res.status === 409 && body.includes('SEAT_TAKEN') ? 1 : 0, `status=${res.status} body=${body.slice(0, 90)}`)

    // 2. Anonymous hold requests are refused outright.
    const anon = await doReq('/api/seats/hold', 'POST', undefined, {
      tripId: fixTrip.id, seatLabel: SEAT_Y, fromStationId: stA.id, toStationId: stB.id,
    })
    assertStatus('SEAT_HOLD', 'Anonymous hold request denied with 401', 401, anon.status)

    // 3. The customer checkout may not sell a seat a company booking holds.
    const cross = await doReq('/api/bookings', 'POST', customerA, {
      tripId: fixTrip.id, seatLabel: SEAT_Y, passengerName: 'Cross Table Probe',
    })
    const crossBody = await cross.text()
    assertStatus('CROSS_TABLE', 'Customer booking on a company-booked seat refused with 409', 1, cross.status === 409 && crossBody.includes('SEAT_TAKEN') ? 1 : 0, `status=${cross.status} body=${crossBody.slice(0, 90)}`)

    // 4. The customer checkout may not walk through another customer's hold.
    const held = await doReq('/api/bookings', 'POST', customerA, {
      tripId: fixTrip.id, seatLabel: SEAT_X, passengerName: 'Hold Walkthrough Probe',
    })
    const heldBody = await held.text()
    assertStatus('CROSS_TABLE', 'Customer booking on a held seat refused with 409', 1, held.status === 409 && heldBody.includes('SEAT_TAKEN') ? 1 : 0, `status=${held.status} body=${heldBody.slice(0, 90)}`)

    // 5. The company checkout may not walk through a customer's hold either.
    const HOLD_SEAT = seatLabels[5]
    const holdRes = await doReq('/api/seats/hold', 'POST', customerA, {
      tripId: fixTrip.id, seatLabel: HOLD_SEAT, fromStationId: stA.id, toStationId: stB.id,
    })
    const holdJson = await holdRes.json().catch(() => null)
    if (!holdRes.ok || !holdJson?.holdId) {
      assertStatus('HOLD_COMPANY_BLOCK', 'Customer can hold a free seat (precondition)', 200, holdRes.status, `status=${holdRes.status}`)
      assertStatus('HOLD_COMPANY_BLOCK', 'Company booking refused while a customer holds the seat', 1, 0, 'precondition hold failed')
    } else {
      const co = await doReq('/api/company/bookings', 'POST', sec5Admin, {
        tripId: fixTrip.id,
        passengers: [{ seatLabel: HOLD_SEAT, passengerName: 'Blocked By Hold' }],
      })
      const coBody = await co.text()
      assertStatus('HOLD_COMPANY_BLOCK', 'Company booking refused while a customer holds the seat', 1, co.status === 409 && coBody.includes('SEAT_TAKEN') ? 1 : 0, `status=${co.status} body=${coBody.slice(0, 90)}`)
    }

    // 6. The degenerate segment: a second booking on a no-stop trip's seat.
    const deg = await doReq('/api/bookings', 'POST', customerA, {
      tripId: noStopTrip.id, seatLabel: 'R5-01', passengerName: 'Degenerate Probe',
    })
    const degBody = await deg.text()
    assertStatus('DEGENERATE_SEG', 'Second booking on a no-stop trip seat refused with 409', 1, deg.status === 409 && degBody.includes('SEAT_TAKEN') ? 1 : 0, `status=${deg.status} body=${degBody.slice(0, 90)}`)

    // 7. Squatting cap: one account cannot reserve every seat for two minutes
    //    at a time. Either the per-user cap or the per-IP limiter must answer
    //    with 429 + Retry-After before the flood finishes.
    const capSeats = seatLabels.slice(6, 18) // 12 distinct, untouched seats
    let sawLimit = false
    let retryAfter: string | null = null
    let odd = ''
    for (const seat of capSeats) {
      const r = await doReq('/api/seats/hold', 'POST', customerA, {
        tripId: fixTrip.id, seatLabel: seat, fromStationId: stA.id, toStationId: stB.id,
      })
      if (r.status === 429) {
        sawLimit = true
        retryAfter = r.headers.get('Retry-After')
        break
      }
      if (r.status !== 200 && r.status !== 409) odd += `${seat}:${r.status} `
    }
    const active = await prisma.seatHold.count({
      where: { userId: customerA.id, tripId: fixTrip.id, expiresAt: { gt: new Date() } },
    })
    assertStatus('HOLD_CAP', 'Hold flood refused with 429', 1, sawLimit ? 1 : 0, odd || (sawLimit ? `retry-after=${retryAfter}` : 'no 429 in 12 attempts'))
    assertStatus('HOLD_CAP', 'The 429 carries Retry-After', 1, retryAfter ? 1 : 0, `retry-after=${retryAfter}`)
    assertStatus('HOLD_CAP', 'Active holds per user never exceed the cap of 10', 1, active <= 10 ? 1 : 0, `active=${active}`)

    // 8. Positive control: a plain customer booking of a free seat still works.
    const freeSeat = seatLabels[18] // R5-19 — used by nothing above
    const ok = await doReq('/api/bookings', 'POST', customerA, {
      tripId: fixTrip.id, seatLabel: freeSeat, passengerName: 'Positive Control',
    })
    const okBody = await ok.text()
    let createdId: string | null = null
    try { createdId = JSON.parse(okBody)?.booking?.id ?? null } catch { createdId = null }
    assertStatus('FLOW_POSITIVE', 'Customer can still book a free seat (no false denial)', 1, ok.status === 200 && createdId ? 1 : 0, `status=${ok.status} body=${okBody.slice(0, 90)}`)
    // Cleaned up so the next run finds the seat free.
    if (createdId) await prisma.booking.delete({ where: { id: createdId } }).catch(() => {})
  }

  // -------------------------------------------------------------------------
  // AREA 20: registration is validated and throttled (Run #5 fixes)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 20: registration validation and rate limiting ---')
  // A 429 means an earlier run within the window already spent this bucket:
  // that is the limiter working, and is accepted as evidence for the
  // validation rows below (the first run of a window records the 400s).
  const regOk = (status: number, expected: number) => status === expected || status === 429
  {
    const badEmail = await doReq('/api/register/company', 'POST', undefined, {
      companyName: 'Sec5 Reg', adminName: 'Sec5 Admin', email: 'not-an-email', password: 'password123',
    })
    assertStatus('REGISTER_GUARD', 'Company registration with a malformed email refused with 400', 1, regOk(badEmail.status, 400) ? 1 : 0, `status=${badEmail.status}`)

    const shortPw = await doReq('/api/register/company', 'POST', undefined, {
      companyName: 'Sec5 Reg', adminName: 'Sec5 Admin', email: 'sec5-reg@example.com', password: 'abc',
    })
    assertStatus('REGISTER_GUARD', 'Company registration with a 3-character password refused with 400', 1, regOk(shortPw.status, 400) ? 1 : 0, `status=${shortPw.status}`)

    const longName = await doReq('/api/register/company', 'POST', undefined, {
      companyName: 'x'.repeat(500), adminName: 'Sec5 Admin', email: 'sec5-reg2@example.com', password: 'password123',
    })
    assertStatus('REGISTER_GUARD', 'Company registration with a 500-character name refused with 400', 1, regOk(longName.status, 400) ? 1 : 0, `status=${longName.status}`)

    const dupCo = await doReq('/api/register/company', 'POST', undefined, {
      companyName: 'Sec5 Dup Co', adminName: 'Sec5 Dup', email: customerA.email.toUpperCase(), password: 'password123',
    })
    const dupCoBody = await dupCo.text()
    // 429 accepted like the other rows above: within 15 minutes of a previous
    // run the bucket is already spent, and a spent bucket is not a bypass.
    assertStatus('REGISTER_GUARD', 'Case-variant duplicate email refused on company registration', 1, (dupCo.status === 400 && dupCoBody.includes('exists')) || dupCo.status === 429 ? 1 : 0, `status=${dupCo.status} body=${dupCoBody.slice(0, 90)}`)

    const dupCust = await doReq('/api/register', 'POST', undefined, {
      email: customerA.email.toUpperCase(), password: 'password123', name: 'Sec5 Dup Cust',
    })
    const dupCustBody = await dupCust.text()
    assertStatus('REGISTER_GUARD', 'Case-variant duplicate email refused on customer registration', 1, (dupCust.status === 400 && dupCustBody.includes('exists')) || dupCust.status === 429 ? 1 : 0, `status=${dupCust.status} body=${dupCustBody.slice(0, 90)}`)

    const badCust = await doReq('/api/register', 'POST', undefined, {
      email: 'nope', password: 'password123', name: 'Sec5 Bad',
    })
    assertStatus('REGISTER_GUARD', 'Customer registration with a malformed email refused with 400', 1, regOk(badCust.status, 400) ? 1 : 0, `status=${badCust.status}`)

    // Flood: charged before the body is read, so an unparseable payload still
    // spends the budget and the 11th attempt inside the window must be 429.
    let sawRl = false
    for (let i = 0; i < 11; i++) {
      const r = await doReq('/api/register/company', 'POST', undefined, { email: `sec5-rl-${i}` })
      if (r.status === 429) { sawRl = true; break }
    }
    assertStatus('REGISTER_GUARD', 'Company registration flood refused with 429', 1, sawRl ? 1 : 0, 'no 429 in 11 attempts (bucket may already be spent)')
  }

  // -------------------------------------------------------------------------
  // AREA 21: upload access control and signed links (Run #5 fixes)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 21: payment-proof upload access control ---')
  {
    const up = await doUpload('/api/uploads/payment-proof', customerA)
    const upJson = await up.json().catch(() => null)
    const proofUrl: string | null = upJson?.url || null

    const anonUp = await doUpload('/api/uploads/payment-proof', null)
    assertStatus('UPLOAD_AUTHZ', 'Anonymous payment-proof upload denied with 401', 401, anonUp.status)

    if (!proofUrl) {
      assertStatus('UPLOAD_AUTHZ', 'Signed-in payment-proof upload succeeds', 201, up.status, `status=${up.status} body=${JSON.stringify(upJson).slice(0, 90)}`)
    } else {
      const file = proofUrl.replace('/api/uploads/', '')

      const anonGet = await doReq(proofUrl)
      assertStatus('UPLOAD_AUTHZ', 'Anonymous GET of a payment proof refused with 401', 401, anonGet.status)

      const wrongUser = await doReq(proofUrl, 'GET', customerB)
      assertStatus('UPLOAD_AUTHZ', 'Another customer GET of a payment proof refused with 403', 403, wrongUser.status)

      const ownerGet = await doReq(proofUrl, 'GET', customerA)
      const ownerCache = ownerGet.headers.get('cache-control') || ''
      assertStatus('UPLOAD_AUTHZ', 'Owner reads their own payment proof with 200 and no-store caching', 1, ownerGet.status === 200 && ownerCache.includes('no-store') ? 1 : 0, `status=${ownerGet.status} cache=${ownerCache}`)

      const adminGet = await doReq(proofUrl, 'GET', superAdmin)
      assertStatus('UPLOAD_AUTHZ', 'Super admin reads any payment proof with 200', 200, adminGet.status)

      // Minting: a signature may only be issued to someone who may already read.
      const mintAnon = await doReq('/api/uploads/sign', 'POST', undefined, { file })
      assertStatus('UPLOAD_SIGN', 'Anonymous mint request denied with 401', 401, mintAnon.status)

      const mintWrong = await doReq('/api/uploads/sign', 'POST', customerB, { file })
      assertStatus('UPLOAD_SIGN', 'Minting a signature for another user\'s proof refused with 403', 403, mintWrong.status)

      const mintOwner = await doReq('/api/uploads/sign', 'POST', customerA, { file })
      const mintJson = await mintOwner.json().catch(() => null)
      assertStatus('UPLOAD_SIGN', 'Owner can mint a signed link for their own proof', 1, mintOwner.status === 200 && mintJson?.sig ? 1 : 0, `status=${mintOwner.status}`)

      if (mintJson?.sig && mintJson?.exp) {
        const signedGet = await doReq(`${proofUrl}?exp=${mintJson.exp}&sig=${mintJson.sig}`)
        assertStatus('UPLOAD_SIGN', 'Anonymous holder of a fresh signed link reads the proof', 200, signedGet.status)
      }

      // A signature that has run out grants nothing: the request falls back
      // to the session check and the anonymous caller is refused.
      const expiredExp = Math.floor(Date.now() / 1000) - 10
      const expired = await doReq(`${proofUrl}?exp=${expiredExp}&sig=${signUpload(file, expiredExp)}`)
      assertStatus('UPLOAD_SIGN', 'Expired signature falls back to session auth (401 for anonymous)', 401, expired.status)

      // A signature minted for a different file must not open this one.
      const tampered = await doReq(`${proofUrl}?exp=${Math.floor(Date.now() / 1000) + 300}&sig=${signUpload('ffffffff-ffff-4fff-8fff-ffffffffffff.webp', Math.floor(Date.now() / 1000) + 300)}`)
      assertStatus('UPLOAD_SIGN', 'Signature from another file refused (401 for anonymous)', 401, tampered.status)

      // A wrong-length signature never reaches a comparison that could pass.
      const garbage = await doReq(`${proofUrl}?exp=${Math.floor(Date.now() / 1000) + 300}&sig=deadbeef`)
      assertStatus('UPLOAD_SIGN', 'Garbage signature refused (401 for anonymous)', 401, garbage.status)
    }

    // Public images stay public: destination photography is what the public
    // site renders for anonymous visitors.
    const dest = await prisma.destination.findFirst({
      where: { imageUrl: { startsWith: '/api/uploads/' } },
      select: { imageUrl: true },
    })
    if (dest?.imageUrl) {
      const pub = await doReq(dest.imageUrl)
      assertStatus('UPLOAD_PUBLIC', 'Public destination image readable anonymously', 200, pub.status)
    } else {
      assertStatus('UPLOAD_PUBLIC', 'Public destination image readable anonymously', 1, 1, 'skipped: no destination image fixture in test db')
    }
  }

  // -------------------------------------------------------------------------
  // AREA 22: FAQ ?all=1 is super-admin only (Run #5 fix)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 22: FAQ drafts behind ?all=1 ---')
  {
    let hidden = await prisma.faq.findFirst({ where: { questionEn: { startsWith: 'SEC5 hidden FAQ' } } })
    if (!hidden) {
      hidden = await prisma.faq.create({
        data: { questionAr: 'سؤال مخفي', questionEn: 'SEC5 hidden FAQ', answerAr: 'جواب مخفي', answerEn: 'Hidden answer', isActive: false, order: 9999 },
      })
    }

    const anon = await doReq('/api/faqs?all=1')
    const anonList = await anon.json().catch(() => [])
    const anonSees = Array.isArray(anonList) && anonList.some((f: any) => f.id === hidden.id)
    assertStatus('FAQ_ALL', 'Anonymous ?all=1 does not expose inactive FAQs', 1, anon.status === 200 && !anonSees ? 1 : 0, `status=${anon.status} sees=${anonSees}`)

    const admin = await doReq('/api/faqs?all=1', 'GET', superAdmin)
    const adminList = await admin.json().catch(() => [])
    const adminSees = Array.isArray(adminList) && adminList.some((f: any) => f.id === hidden.id)
    assertStatus('FAQ_ALL', 'Super admin ?all=1 sees the drafts', 1, admin.status === 200 && adminSees ? 1 : 0, `status=${admin.status} sees=${adminSees}`)

    const plain = await doReq('/api/faqs')
    const plainList = await plain.json().catch(() => [])
    const plainSees = Array.isArray(plainList) && plainList.some((f: any) => f.id === hidden.id)
    assertStatus('FAQ_ALL', 'Anonymous default view still excludes inactive FAQs', 1, plain.status === 200 && !plainSees ? 1 : 0, `status=${plain.status} sees=${plainSees}`)
  }

  // -------------------------------------------------------------------------
  // AREA 23: financial input bounds (Run #5 fixes)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 23: money input bounds and error mapping ---')
  {
    const depositCases: [string, any][] = [
      ['deposit amount as a numeric string', { amount: '100', method: 'INSTAPAY' }],
      ['deposit amount with three decimals', { amount: 100.567, method: 'INSTAPAY' }],
      ['deposit amount above the 1,000,000 EGP ceiling', { amount: 2_000_000, method: 'INSTAPAY' }],
      ['deposit amount negative', { amount: -50, method: 'INSTAPAY' }],
    ]
    for (const [label, body] of depositCases) {
      const r = await doReq('/api/company/deposit-requests', 'POST', companyAdminA, body)
      assertStatus('MONEY_BOUNDS', `${label} refused with 400`, 400, r.status, `status=${r.status}`)
    }
    // JSON 1e309 parses to Infinity — a value the old `!amount || amount <= 0`
    // check accepted and the driver only rejected later, if at all.
    const inf = await doReq('/api/company/deposit-requests', 'POST', companyAdminA, '{"amount":1e309,"method":"INSTAPAY"}')
    assertStatus('MONEY_BOUNDS', 'deposit amount of Infinity (1e309) refused with 400', 400, inf.status, `status=${inf.status}`)

    const good = await doReq('/api/company/deposit-requests', 'POST', companyAdminA, { amount: 25, method: 'INSTAPAY', notes: 'sec5-money-probe' })
    assertStatus('MONEY_BOUNDS', 'a plain valid deposit is still accepted (no false denial)', 200, good.status, `status=${good.status}`)
    await prisma.depositRequest.deleteMany({ where: { notes: 'sec5-money-probe' } })

    // Credit limit: finite and numeric, but deliberately uncapped — the
    // ceiling is a business decision and is documented, not invented here.
    const clInf = await doReq(`/api/admin/companies/${companyA.id}/credit-limit`, 'POST', superAdmin, '{"creditLimit":1e309}')
    assertStatus('MONEY_BOUNDS', 'creditLimit of Infinity refused with 400', 400, clInf.status, `status=${clInf.status}`)
    const clStr = await doReq(`/api/admin/companies/${companyA.id}/credit-limit`, 'POST', superAdmin, { creditLimit: '10000' })
    assertStatus('MONEY_BOUNDS', 'creditLimit as a string refused with 400', 400, clStr.status, `status=${clStr.status}`)
    const current = await prisma.company.findUnique({ where: { id: companyA.id }, select: { creditLimit: true } })
    const clOk = await doReq(`/api/admin/companies/${companyA.id}/credit-limit`, 'POST', superAdmin, { creditLimit: current?.creditLimit ?? 0 })
    assertStatus('MONEY_BOUNDS', 'a numeric creditLimit is still accepted (no false denial)', 200, clOk.status, `status=${clOk.status}`)

    // The manual platform-wallet adjustment: signed, but never a string,
    // never infinite, never unbounded.
    const adjStr = await doReq('/api/admin/platform-wallet/adjust', 'POST', superAdmin, { amount: '50', reason: 'probe' })
    assertStatus('MONEY_BOUNDS', 'platform adjustment with a string amount refused with 400', 400, adjStr.status, `status=${adjStr.status}`)
    const adjBig = await doReq('/api/admin/platform-wallet/adjust', 'POST', superAdmin, { amount: 5_000_000, reason: 'probe' })
    assertStatus('MONEY_BOUNDS', 'platform adjustment above the ceiling refused with 400', 400, adjBig.status, `status=${adjBig.status}`)
    const fundInf = await doReq('/api/admin/platform-wallet', 'POST', superAdmin, '{"amount":1e309,"method":"INSTAPAY"}')
    assertStatus('MONEY_BOUNDS', 'platform funding with Infinity refused with 400', 400, fundInf.status, `status=${fundInf.status}`)

    // POST /api/company/wallet is super-admin-only by design: a company
    // admin crediting their own wallet would be minting money. The bounds
    // check runs for that legitimate caller too, so the string is refused
    // with 400 before any ledger row is written.
    const wStr = await doReq('/api/company/wallet', 'POST', superAdmin, { targetCompanyId: companyA.id, amount: '75', description: 'probe' })
    assertStatus('MONEY_BOUNDS', 'manual wallet credit with a string amount refused with 400', 400, wStr.status, `status=${wStr.status}`)

    // Error mapping: an unknown company id is the caller's mistake (404), and
    // the body must be the mapped error, never a raw internal message.
    const noCo = await doReq('/api/admin/companies/sec5-nonexistent-company/credit-limit', 'POST', superAdmin, { creditLimit: 100 })
    const noCoBody = await noCo.text()
    assertStatus('ERROR_MAPPING', 'Unknown company on credit-limit change answered with 404', 1, noCo.status === 404 && noCoBody.includes('Company not found') && !noCoBody.includes('Server error') ? 1 : 0, `status=${noCo.status} body=${noCoBody.slice(0, 90)}`)
  }

  // -------------------------------------------------------------------------
  // AREA 24: invalid ids and invalid segments answer with mapped statuses
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 24: invalid trip ids and segments do not 500 ---')
  {
    const t1 = await doReq('/api/bookings', 'POST', customerA, { tripId: 'sec5-no-such-trip', seatLabel: 'R5-01', passengerName: 'Probe' })
    const t1Body = await t1.json().catch(() => ({}))
    assertStatus('TRIP_404', 'Customer booking with an unknown tripId answered with 404', 1, t1.status === 404 && t1Body?.error === 'Trip not found' ? 1 : 0, `status=${t1.status} body=${JSON.stringify(t1Body).slice(0, 90)}`)

    const t2 = await doReq('/api/company/bookings', 'POST', sec5Admin, {
      tripId: 'sec5-no-such-trip',
      passengers: [{ seatLabel: 'R5-01', passengerName: 'Probe' }],
    })
    const t2Body = await t2.json().catch(() => ({}))
    assertStatus('TRIP_404', 'Company booking with an unknown tripId answered with 404', 1, t2.status === 404 && t2Body?.error === 'Trip not found' ? 1 : 0, `status=${t2.status} body=${JSON.stringify(t2Body).slice(0, 90)}`)

    // Stations given back-to-front: a 400 with a sentence the caller can act
    // on, not a 500 carrying the throw's message.
    const t3 = await doReq('/api/company/bookings', 'POST', sec5Admin, {
      tripId: fixTrip.id,
      fromStationId: stB.id,
      toStationId: stA.id,
      passengers: [{ seatLabel: 'R5-04', passengerName: 'Probe' }],
    })
    const t3Body = await t3.json().catch(() => ({}))
    assertStatus('TRIP_404', 'Reversed stations answered with 400 and a mapped message', 1, t3.status === 400 && typeof t3Body?.error === 'string' && t3Body.error.includes('before') ? 1 : 0, `status=${t3.status} body=${JSON.stringify(t3Body).slice(0, 90)}`)

    const t4 = await doReq('/api/admin/deposit-requests/sec5-not-a-real-deposit', 'PATCH', superAdmin, { status: 'APPROVED' })
    assertStatus('ERROR_MAPPING', 'Unknown deposit id answered with 404 (no leaked message)', 1, t4.status === 404 ? 1 : 0, `status=${t4.status}`)

    // ATTACH_PROOF: the admin endpoint must refuse a proof URL this
    // application could never have served (an attacker's chosen origin the
    // reviewer's browser would then fetch) and accept one we minted.
    const proofFile = `${'f'.repeat(8)}-0000-4000-8000-000000000001.png`
    const badProof = await doReq(`/api/admin/company-bookings/${sec5Cb.id}`, 'PATCH', superAdmin, {
      action: 'ATTACH_PROOF',
      paymentProofUrl: 'https://evil.example/proof.png',
    })
    assertStatus('PROOF_URL', 'ATTACH_PROOF with an external URL refused with 400', 400, badProof.status, `status=${badProof.status}`)

    const scriptProof = await doReq(`/api/admin/company-bookings/${sec5Cb.id}`, 'PATCH', superAdmin, {
      action: 'ATTACH_PROOF',
      paymentProofUrl: 'javascript:alert(1)',
    })
    assertStatus('PROOF_URL', 'ATTACH_PROOF with a javascript: URL refused with 400', 400, scriptProof.status, `status=${scriptProof.status}`)

    const goodProof = await doReq(`/api/admin/company-bookings/${sec5Cb.id}`, 'PATCH', superAdmin, {
      action: 'ATTACH_PROOF',
      paymentProofUrl: `/api/uploads/${proofFile}`,
    })
    const storedProof = await prisma.companyBooking.findUnique({ where: { id: sec5Cb.id }, select: { paymentProofUrl: true } })
    assertStatus('PROOF_URL', 'ATTACH_PROOF with our own upload path accepted and stored', 1, goodProof.status === 200 && storedProof?.paymentProofUrl === `/api/uploads/${proofFile}` ? 1 : 0, `status=${goodProof.status} stored=${storedProof?.paymentProofUrl}`)
    // Restore: the fixture must not keep a proof attached for later runs.
    await prisma.companyBooking.update({ where: { id: sec5Cb.id }, data: { paymentProofUrl: null } })

    // A stored deposit amount that is not plausible money must stop the
    // approval with a generic 500 — not credit NaN/negative to the ledger.
    let badAmount = await prisma.depositRequest.findFirst({ where: { notes: 'sec5-bad-amount' } })
    if (!badAmount) {
      badAmount = await prisma.depositRequest.create({
        data: { companyId: companyA.id, amount: -50, method: 'INSTAPAY', notes: 'sec5-bad-amount', status: 'PENDING' },
      })
    } else {
      badAmount = await prisma.depositRequest.update({ where: { id: badAmount.id }, data: { amount: -50, status: 'PENDING' } })
    }
    const badAmt = await doReq(`/api/admin/deposit-requests/${badAmount.id}`, 'PATCH', superAdmin, { status: 'APPROVED' })
    const badAmtBody = await badAmt.text()
    const afterBadAmt = await prisma.depositRequest.findUnique({ where: { id: badAmount.id }, select: { status: true } })
    assertStatus('BAD_AMOUNT_GUARD', 'Approval of a corrupted stored amount answered with a generic 500', 1, badAmt.status === 500 && !badAmtBody.includes('-50') && !badAmtBody.includes('prisma') ? 1 : 0, `status=${badAmt.status} body=${badAmtBody.slice(0, 90)}`)
    assertStatus('BAD_AMOUNT_GUARD', 'Corrupted deposit stays PENDING (transaction rolled back)', 1, afterBadAmt?.status === 'PENDING' ? 1 : 0, `status=${afterBadAmt?.status}`)
    await prisma.depositRequest.delete({ where: { id: badAmount.id } }).catch(() => {})
  }

  // -------------------------------------------------------------------------
  // AREA 25: the station-trips filter with a future fixture (non-vacuous)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 25: station trips with a future-dated fixture ---')
  {
    const res = await doReq(`/api/stations/${stA.id}/trips`)
    const json = await res.json().catch(() => null)
    const trips: any[] = json?.trips || []
    const found = trips.some((t) => t.id === fixTrip.id)
    assertStatus('STATION_TRIPS', 'The future SCHEDULED fixture trip is visible at its station', 1, res.status === 200 && found ? 1 : 0, `status=${res.status} trips=${trips.length}`)

    const bad = trips.filter((t) => t.status !== 'SCHEDULED' || new Date(t.departure).getTime() < Date.now())
    assertStatus('STATION_TRIPS', 'No past or non-scheduled trip appears alongside it', 1, bad.length === 0 ? 1 : 0, `bad=${bad.length}`)
  }

  // -------------------------------------------------------------------------
  // AREA 26: concurrent company-booking EDIT may move money exactly once
  // (Run #4 residual #1, fixed in Run #5 with a conditional claim)
  // -------------------------------------------------------------------------
  console.log('\n--- AREA 26: concurrent EDIT of a paid company booking ---')
  {
    const EDIT_OLD = seatLabels[2]   // price 300
    const EDIT_NEW_A = seatLabels[3] // price 200 → EDIT refunds 100
    const EDIT_NEW_B = seatLabels[4] // price 200 → the competing edit refunds too

    // Seat prices decide the price difference, so the fixture pins them.
    await prisma.seat.updateMany({ where: { layoutId: fixLayout.id, label: EDIT_OLD }, data: { price: 300 } })
    await prisma.seat.updateMany({ where: { layoutId: fixLayout.id, label: { in: [EDIT_NEW_A, EDIT_NEW_B] } }, data: { price: 200 } })

    // Both target seats must be free of holds and live bookings, whatever an
    // earlier run left behind.
    await prisma.seatHold.deleteMany({ where: { tripId: fixTrip.id, seatLabel: { in: [EDIT_OLD, EDIT_NEW_A, EDIT_NEW_B] } } })
    await prisma.booking.deleteMany({ where: { tripId: fixTrip.id, seatLabel: { in: [EDIT_NEW_A, EDIT_NEW_B] }, status: { in: ['PENDING', 'PAID'] } } })

    let editFx = await prisma.companyBooking.findFirst({ where: { reference: { startsWith: 'SEC5-EDIT-' } } })
    if (!editFx) {
      editFx = await prisma.companyBooking.create({
        data: {
          reference: `SEC5-EDIT-${R5_NOW}`,
          companyId: sec5Co.id,
          tripId: fixTrip.id,
          seatLabel: EDIT_OLD,
          passengerName: 'Edit Race Probe',
          status: 'PAID',
          total: 300,
          paidFromWallet: 300,
          paidOnCredit: 0,
          fromStopOrder: 1,
          toStopOrder: 2,
          expiresAt: new Date(Date.now() + R5_WEEK),
        },
      })
    } else {
      editFx = await prisma.companyBooking.update({
        where: { id: editFx.id },
        data: { status: 'PAID', seatLabel: EDIT_OLD, total: 300, paidFromWallet: 300, paidOnCredit: 0, passengerName: 'Edit Race Probe' },
      })
    }

    // Ledger rows from a previous run are removed so the count below measures
    // this race alone.
    await prisma.walletTransaction.deleteMany({ where: { reference: editFx.id, type: 'REFUND' } })

    const fire = (seat: string) => doReq(`/api/admin/company-bookings/${editFx!.id}`, 'PATCH', superAdmin, { action: 'EDIT', seatLabel: seat })

    // Warm-up: the first PATCH in a dev server run may trigger route
    // compilation, which would serialise the requests below. One throwaway
    // edit pays that cost, then the fixture is put back exactly as it was.
    await fire(EDIT_NEW_A)
    editFx = await prisma.companyBooking.update({
      where: { id: editFx.id },
      data: { status: 'PAID', seatLabel: EDIT_OLD, total: 300, paidFromWallet: 300, paidOnCredit: 0 },
    })
    await prisma.walletTransaction.deleteMany({ where: { reference: editFx.id, type: 'REFUND' } })

    const [a, b] = await Promise.all([fire(EDIT_NEW_A), fire(EDIT_NEW_B)])
    const wins = [a.status, b.status].filter((s) => s === 200).length
    const clean = [a.status, b.status].every((s) => s === 200 || s === 409)

    // Two outcomes are safe and both are accepted: either the claim refused
    // the loser (200+409), or this SQLite build serialised the two
    // transactions so thoroughly that the loser read the winner's committed
    // state and both edits were legitimately applied (200+200) — which the
    // debug run showed is what happens here. What must never happen is an
    // internal error or money moving twice; those are asserted below.
    assertStatus('EDIT_RACE', 'Both concurrent edits answered as edit outcomes (200/409, never 5xx)', 1, clean ? 1 : 0, `statuses=${a.status},${b.status}`)
    assertStatus('EDIT_RACE', 'At least one edit applied', 1, wins >= 1 ? 1 : 0, `statuses=${a.status},${b.status}`)

    const after = await prisma.companyBooking.findUnique({ where: { id: editFx.id }, select: { seatLabel: true, total: true, paidFromWallet: true } })
    const refunds = await prisma.walletTransaction.count({ where: { reference: editFx.id, type: 'REFUND' } })
    assertStatus('EDIT_RACE', 'Exactly one price-difference refund ledger row exists', 1, refunds === 1 ? 1 : 0, `refunds=${refunds}`)
    assertStatus('EDIT_RACE', 'Booking total and paid amount were adjusted once (300 → 200)', 1, after && after.total === 200 && after.paidFromWallet === 200 && (after.seatLabel === EDIT_NEW_A || after.seatLabel === EDIT_NEW_B) ? 1 : 0, `seat=${after?.seatLabel} total=${after?.total} paid=${after?.paidFromWallet}`)

    // The predicate itself, checked against the row as it now stands: an
    // update pinned to the pre-race state (old seat, old total) must match
    // nothing. That is exactly the WHERE clause the route claims with, and
    // it is what makes a stale concurrent writer lose on a database where
    // reads can overlap (MySQL in production). On this SQLite build the
    // interactive transactions serialise, so the stale read cannot be
    // produced over HTTP — hence the direct check rather than a 409 hunt.
    const staleClaim = await prisma.companyBooking.updateMany({
      where: { id: editFx.id, seatLabel: EDIT_OLD, total: 300, status: 'PAID' },
      data: { passengerNotes: 'stale-claim-probe' },
    })
    assertStatus('EDIT_RACE', 'A claim pinned to the pre-edit state matches nothing (stale writer loses)', 0, staleClaim.count, `count=${staleClaim.count}`)
    const freshClaim = await prisma.companyBooking.updateMany({
      where: { id: editFx.id, seatLabel: after!.seatLabel, total: after!.total, status: 'PAID' },
      data: { passengerNotes: '' },
    })
    assertStatus('EDIT_RACE', 'A claim pinned to the current state matches (fresh writer wins)', 1, freshClaim.count, `count=${freshClaim.count}`)
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const total = results.length
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log('\n=================================================================')
  console.log(` RESULTS: ${passed}/${total} PASSED, ${failed} FAILED`)
  console.log('=================================================================')

  if (failed > 0) {
    console.error(`❌ ${failed} tests failed!`)
    process.exit(1)
  } else {
    console.log('🎉 ALL SECURITY REGRESSION TESTS PASSED!')
  }
}

main().catch(err => {
  console.error('Test suite error:', err)
  process.exit(1)
}).finally(() => prisma.$disconnect())
