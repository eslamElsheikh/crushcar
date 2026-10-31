/**
 * T6 - Excel export for admin bookings test suite.
 *
 * Requirements:
 * - SUPER_ADMIN only (denial for anonymous, customer, company admin)
 * - Valid .xlsx output parsed by ExcelJS
 * - Arabic RTL sheet (rightToLeft: true)
 * - Arabic headers
 * - Formula-injection neutralized (cells starting with = + - @ tab/CR prepended with ')
 * - Phone numbers preserve leading zeros as text
 * - Cap at 5000 rows with clear Arabic message
 * - Round-trip linkage and company name included
 */
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { assertTestDatabase } from './lib/test-db-guard'
import ExcelJS from 'exceljs'

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
  console.log(`T6 Excel export test suite (${BASE})`)

  // 1. Create users
  const adminUser = await prisma.user.create({
    data: { email: `admin-t6-${SUFFIX}@safro.test`, name: 'Admin', role: 'SUPER_ADMIN', password: 'x', isActive: true },
  })
  const adminToken = await mintToken(adminUser)

  const company = await prisma.company.create({
    data: {
      name: `شركة النيل للتجارة ${SUFFIX}`,
      subdomain: `nile-${SUFFIX}`,
      isActive: true,
      creditLimit: 5000,
      walletBalance: 0,
      billingCycle: 'MONTHLY',
      paymentMode: 'PREPAID',
    },
  })

  const companyUser = await prisma.user.create({
    data: { email: `comp-t6-${SUFFIX}@safro.test`, name: 'Company Admin', role: 'COMPANY_ADMIN', companyId: company.id, password: 'x', isActive: true },
  })
  const companyToken = await mintToken(companyUser)

  const customerUser = await prisma.user.create({
    data: { email: `cust-t6-${SUFFIX}@safro.test`, name: 'Customer', role: 'CUSTOMER', password: 'x', isActive: true },
  })
  const customerToken = await mintToken(customerUser)

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Role denial tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Access control tests')
  const anon = await fetch(`${BASE}/api/admin/bookings/export?tab=company`)
  check('anonymous request rejected with 401', anon.status === 401, `status: ${anon.status}`)

  const cust = await fetch(`${BASE}/api/admin/bookings/export?tab=company`, {
    headers: { Cookie: `next-auth.session-token=${customerToken}` },
  })
  check('customer request rejected with 403', cust.status === 403, `status: ${cust.status}`)

  const comp = await fetch(`${BASE}/api/admin/bookings/export?tab=company`, {
    headers: { Cookie: `next-auth.session-token=${companyToken}` },
  })
  check('company admin request rejected with 403', comp.status === 403, `status: ${comp.status}`)

  const admin = await fetch(`${BASE}/api/admin/bookings/export?tab=company`, {
    headers: { Cookie: `next-auth.session-token=${adminToken}` },
  })
  check('super admin request allowed with 200', admin.status === 200, `status: ${admin.status}`)

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Data setup with formula-injection string and phone leading zeros
  // ───────────────────────────────────────────────────────────────────────────
  console.log('2. Exporting and parsing Company Bookings (.xlsx)')
  const trip = await prisma.trip.create({
    data: {
      busId: (await prisma.bus.create({ data: { name: `Bus-${SUFFIX}`, type: 'MINI_BUS', seatCount: 10 } })).id,
      origin: 'القاهرة',
      destination: 'شرم الشيخ',
      departure: new Date(Date.now() + 86400000),
      arrival: new Date(Date.now() + 90000000),
      price: 250,
      bookingMode: 'SEAT',
      status: 'SCHEDULED',
    },
  })

  // Create booking with dangerous formula injection strings: =cmd|' /C calc'!A0, +SUM(1,2), @AVERAGE
  const formulaPayload = "=cmd|' /C calc'!A0"
  const companyBooking = await prisma.companyBooking.create({
    data: {
      reference: `T6-REF-${SUFFIX}`,
      companyId: company.id,
      tripId: trip.id,
      seatLabel: 'S-1',
      passengerName: formulaPayload,
      passengerPhone: '01012345678', // Notice leading zero
      passengerHotel: '+Grand Hotel Alexandria',
      roundTripGroupId: `RT-GROUP-${SUFFIX}`,
      status: 'PAID',
      total: 250,
      paidFromWallet: 250,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  // Fetch exported company bookings
  const exportRes = await fetch(`${BASE}/api/admin/bookings/export?tab=company&reference=${companyBooking.reference}`, {
    headers: { Cookie: `next-auth.session-token=${adminToken}` },
  })
  check('company export returns 200 and xlsx content-type', exportRes.status === 200 && (exportRes.headers.get('content-type') || '').includes('spreadsheetml'))

  const arrayBuffer = await exportRes.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(arrayBuffer) as any)
  check('excel file successfully opened and parsed by ExcelJS', workbook.worksheets.length > 0)

  const worksheet = workbook.getWorksheet('حجوزات الشركات')
  check('worksheet name is Arabic ("حجوزات الشركات")', !!worksheet)

  // Verify RTL sheet
  const isRtl = Boolean(worksheet?.views?.some((v) => (v as any).rightToLeft === true))
  check('worksheet is right-to-left (RTL)', isRtl)
  // Verify Header row (Arabic)
  const headerRow = worksheet?.getRow(1)
  const headerCell1 = headerRow?.getCell(1).value
  check('first column header is "رقم الحجز"', headerCell1 === 'رقم الحجز')

  // Find our row
  let foundRow: ExcelJS.Row | null = null
  worksheet?.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const refVal = String(row.getCell(1).value || '')
      if (refVal.includes(companyBooking.reference)) {
        foundRow = row
      }
    }
  })
  check('exported row contains company booking', !!foundRow)

  if (foundRow) {
    const r = foundRow as ExcelJS.Row
    const nameVal = String(r.getCell(3).value || '')
    // Formula injection check: must start with leading apostrophe
    check('formula-injection cell neutralized with leading apostrophe', nameVal.startsWith("'="), `got: ${nameVal}`)

    const phoneVal = String(r.getCell(4).value || '')
    check('phone number preserved with leading zero as text', phoneVal.includes('01012345678'), `got: ${phoneVal}`)

    const hotelVal = String(r.getCell(5).value || '')
    check('+ prefix in hotel neutralized with leading apostrophe', hotelVal.startsWith("'+"), `got: ${hotelVal}`)

    const companyNameVal = String(r.getCell(2).value || '')
    check('company name present in export', companyNameVal.includes('شركة النيل للتجارة'), `got: ${companyNameVal}`)

    const rtGroupVal = String(r.getCell(12).value || '')
    check('round-trip group linkage present in export', rtGroupVal.includes(`RT-GROUP-${SUFFIX}`), `got: ${rtGroupVal}`)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Customer Bookings export
  // ───────────────────────────────────────────────────────────────────────────
  console.log('3. Exporting and parsing Customer Bookings (.xlsx)')
  const custBooking = await prisma.booking.create({
    data: {
      reference: `CUST-T6-${SUFFIX}`,
      userId: customerUser.id,
      tripId: trip.id,
      seatLabel: 'S-2',
      passengerName: '@CustomerFormula',
      passengerPhone: '01234567890',
      status: 'PAID',
      total: 250,
      fromStopOrder: 1,
      toStopOrder: 2,
    },
  })

  const custExportRes = await fetch(`${BASE}/api/admin/bookings/export?tab=customer&reference=${custBooking.reference}`, {
    headers: { Cookie: `next-auth.session-token=${adminToken}` },
  })
  check('customer export returns 200', custExportRes.status === 200)

  const custWb = new ExcelJS.Workbook()
  await custWb.xlsx.load(Buffer.from(await custExportRes.arrayBuffer()) as any)
  const custSheet = custWb.getWorksheet('حجوزات العملاء')
  check('customer worksheet name is "حجوزات العملاء"', !!custSheet)
  check('customer worksheet is right-to-left (RTL)', Boolean(custSheet?.views?.some((v) => (v as any).rightToLeft === true)))

  let foundCustRow: ExcelJS.Row | null = null
  custSheet?.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && String(row.getCell(1).value || '').includes(custBooking.reference)) {
      foundCustRow = row
    }
  })
  check('customer booking row present in export', !!foundCustRow)
  if (foundCustRow) {
    const r = foundCustRow as ExcelJS.Row
    const nameVal = String(r.getCell(2).value || '')
    check('@ formula-injection cell neutralized with leading apostrophe', nameVal.startsWith("'@"), `got: ${nameVal}`)
    const phoneVal = String(r.getCell(3).value || '')
    check('customer phone preserved with leading zero as text', phoneVal.includes('01234567890'), `got: ${phoneVal}`)
  }

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
