/**
 * A change to a company's credit limit is written down.
 *
 * Three paths move a credit limit, and all three have to leave a record:
 *
 *   - the dedicated credit-limit endpoint, which always did;
 *   - the company settings page, which could change the limit silently;
 *   - the approval of a pending company, which set a limit silently.
 *
 * A record that says the limit did not move is a record of nothing, so
 * nothing is written when the limit is unchanged. And the record and the
 * change itself have to stand or fall together, so they are written in the
 * same transaction.
 *
 *   DATABASE_URL="mysql://root:pass@127.0.0.1:3306/db_test" \
 *   BASE_URL="http://127.0.0.1:3005" npx tsx scripts/verify-credit-audit.ts
 */
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from './lib/test-db-guard'

// This script writes to the database and deletes rows. It must never run
// against production, so the guard refuses to start unless this is a test database.
assertTestDatabase()

const prisma = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3005'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const SUFFIX = Date.now().toString(36)

async function api(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token) headers.Cookie = `next-auth.session-token=${init.token}`
  const res = await fetch(`${BASE}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function main() {
  const { authSecret } = await import('./lib/auth-secret')
  const secret = authSecret()

  const admin = await prisma.user.create({
    data: {
      email: `credit-audit-${SUFFIX}@example.com`,
      name: 'Credit Audit Admin',
      role: 'SUPER_ADMIN',
      password: 'x',
    },
  })
  const { encode } = await import('next-auth/jwt')
  const token = await encode({
    token: {
      id: admin.id, sub: admin.id, email: admin.email, name: admin.name,
      role: 'SUPER_ADMIN', companyId: null, image: null, activeCheckedAt: Date.now(),
    },
    secret,
    salt: 'next-auth.session-token',
  })

  const company = await prisma.company.create({
    data: {
      name: `Audit Co ${SUFFIX}`, subdomain: `audit-${SUFFIX}`, isActive: true,
      creditLimit: 1000, walletBalance: 0, paymentMode: 'CREDIT', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })

  console.log('the company settings page')
  const before = (await prisma.creditLog.count({ where: { companyId: company.id } }))
  check('there is no record yet', before === 0, String(before))

  const raised = await api(`/api/admin/companies/${company.id}`, {
    method: 'PATCH',
    token,
    body: { creditLimit: 2500 },
  })
  check('the change is accepted', raised.status === 200, `${raised.status} ${JSON.stringify(raised.json).slice(0, 120)}`)
  check('the response still carries the company', raised.json?.id === company.id)
  check('and the new limit', raised.json?.creditLimit === 2500, String(raised.json?.creditLimit))

  const log = await prisma.creditLog.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' } })
  check('a record was written', !!log)
  check('it names the limit before', log?.previousLimit === 1000, String(log?.previousLimit))
  check('and the limit after', log?.newLimit === 2500, String(log?.newLimit))
  check('and the exact change', log?.changeAmount === 1500, String(log?.changeAmount))
  check('and the administrator who made it', log?.createdById === admin.id, String(log?.createdById))
  check('and a reason', !!log?.reason, String(log?.reason))
  check('and it is not tied to a booking', log?.bookingReference === null, String(log?.bookingReference))
  check('and it has a timestamp', !!log?.createdAt)

  console.log('a limit that does not move')
  const countBefore = await prisma.creditLog.count({ where: { companyId: company.id } })
  const unchanged = await api(`/api/admin/companies/${company.id}`, {
    method: 'PATCH',
    token,
    body: { creditLimit: 2500 },
  })
  check('the request is still accepted', unchanged.status === 200, String(unchanged.status))
  const countAfter = await prisma.creditLog.count({ where: { companyId: company.id } })
  check('no record is written for a limit that did not move', countAfter === countBefore,
    `${countBefore} -> ${countAfter}`)

  console.log('a change to something else')
  const countBefore2 = await prisma.creditLog.count({ where: { companyId: company.id } })
  const renamed = await api(`/api/admin/companies/${company.id}`, {
    method: 'PATCH',
    token,
    body: { name: `Renamed Co ${SUFFIX}` },
  })
  check('the request is accepted', renamed.status === 200, String(renamed.status))
  const countAfter2 = await prisma.creditLog.count({ where: { companyId: company.id } })
  check('and no credit record is written for it', countAfter2 === countBefore2,
    `${countBefore2} -> ${countAfter2}`)

  console.log('a request that is not allowed')
  const countBefore3 = await prisma.creditLog.count({ where: { companyId: company.id } })
  const noToken = await api(`/api/admin/companies/${company.id}`, {
    method: 'PATCH',
    body: { creditLimit: 9999 },
  })
  check('it is refused', noToken.status === 401, String(noToken.status))
  const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('and the limit did not move', after.creditLimit === 2500, String(after.creditLimit))
  const countAfter3 = await prisma.creditLog.count({ where: { companyId: company.id } })
  check('and nothing was written', countAfter3 === countBefore3, `${countBefore3} -> ${countAfter3}`)

  console.log('approving a pending company')
  const pending = await prisma.company.create({
    data: {
      name: `Pending Co ${SUFFIX}`, subdomain: `pending-${SUFFIX}`, isActive: false,
      creditLimit: 0, walletBalance: 0, paymentMode: 'PREPAID', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const approved = await api(`/api/admin/companies/${pending.id}/approve`, {
    method: 'PATCH',
    token,
    body: { action: 'approve', creditLimit: 4000, paymentMode: 'CREDIT', billingCycle: 'MONTHLY' },
  })
  check('the approval is accepted', approved.status === 200, `${approved.status} ${JSON.stringify(approved.json).slice(0, 140)}`)
  check('the response still says the company was activated',
    approved.json?.success === true && typeof approved.json?.message === 'string',
    JSON.stringify(approved.json?.message))
  check('and still carries the company', approved.json?.company?.id === pending.id)

  const approvalLog = await prisma.creditLog.findFirst({
    where: { companyId: pending.id },
    orderBy: { createdAt: 'desc' },
  })
  check('the approval left a record', !!approvalLog)
  check('naming the limit before', approvalLog?.previousLimit === 0, String(approvalLog?.previousLimit))
  check('and the limit after', approvalLog?.newLimit === 4000, String(approvalLog?.newLimit))
  check('and the exact change', approvalLog?.changeAmount === 4000, String(approvalLog?.changeAmount))
  check('and the administrator who approved it', approvalLog?.createdById === admin.id, String(approvalLog?.createdById))
  check('and it is not tied to a booking', approvalLog?.bookingReference === null, String(approvalLog?.bookingReference))

  console.log('approving a company whose limit does not move')
  const approvalCount = await prisma.creditLog.count({ where: { companyId: pending.id } })
  const approvedAgain = await api(`/api/admin/companies/${pending.id}/approve`, {
    method: 'PATCH',
    token,
    body: { action: 'approve', creditLimit: 4000, paymentMode: 'CREDIT', billingCycle: 'MONTHLY' },
  })
  check('the approval is still accepted', approvedAgain.status === 200, String(approvedAgain.status))
  const approvalCountAfter = await prisma.creditLog.count({ where: { companyId: pending.id } })
  check('and no second record is written for a limit that did not move',
    approvalCountAfter === approvalCount, `${approvalCount} -> ${approvalCountAfter}`)

  console.log('the dedicated credit-limit endpoint still behaves')
  const dedicated = await api(`/api/admin/companies/${company.id}/credit-limit`, {
    method: 'POST',
    token,
    body: { creditLimit: 3000, reason: 'A deliberate increase' },
  })
  check('it is accepted', dedicated.status === 200, String(dedicated.status))
  const dedicatedLog = await prisma.creditLog.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' },
  })
  check('and it leaves a record too', dedicatedLog?.newLimit === 3000, String(dedicatedLog?.newLimit))
  check('with the reason that was given', dedicatedLog?.reason === 'A deliberate increase',
    String(dedicatedLog?.reason))

  console.log('a limit that does not move leaves no record on the dedicated endpoint either')
  const dedicatedCount = await prisma.creditLog.count({ where: { companyId: company.id } })
  const dedicatedSame = await api(`/api/admin/companies/${company.id}/credit-limit`, {
    method: 'POST',
    token,
    body: { creditLimit: 3000, reason: 'The same value again' },
  })
  check('the request is still accepted', dedicatedSame.status === 200, String(dedicatedSame.status))
  const dedicatedCountAfter = await prisma.creditLog.count({ where: { companyId: company.id } })
  check('and no record is written for it', dedicatedCountAfter === dedicatedCount,
    `${dedicatedCount} -> ${dedicatedCountAfter}`)

  console.log('a negative limit is refused by every path that can set one')
  const negativeChecks: [string, () => Promise<{ status: number; json: any }>][] = [
    [
      'the company settings page',
      () => api(`/api/admin/companies/${company.id}`, {
        method: 'PATCH', token, body: { creditLimit: -1000 },
      }),
    ],
    [
      'the dedicated credit-limit endpoint',
      () => api(`/api/admin/companies/${company.id}/credit-limit`, {
        method: 'POST', token, body: { creditLimit: -1000, reason: 'negative' },
      }),
    ],
  ]
  for (const [name, call] of negativeChecks) {
    const before = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    const logsBefore = await prisma.creditLog.count({ where: { companyId: company.id } })
    const res = await call()
    check(`${name} refuses a negative limit`, res.status === 400, `status=${res.status}`)
    check(`${name} says what is wrong`, typeof res.json?.error === 'string' && res.json.error.length > 0,
      JSON.stringify(res.json?.error))
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
    check(`${name} leaves the limit alone`, after.creditLimit === before.creditLimit,
      `${before.creditLimit} -> ${after.creditLimit}`)
    const logsAfter = await prisma.creditLog.count({ where: { companyId: company.id } })
    check(`${name} writes no record`, logsAfter === logsBefore, `${logsBefore} -> ${logsAfter}`)
  }

  console.log('an approval with a negative limit is refused too')
  const negativePending = await prisma.company.create({
    data: {
      name: `Negative Co ${SUFFIX}`, subdomain: `negative-${SUFFIX}`, isActive: false,
      creditLimit: 0, walletBalance: 0, paymentMode: 'PREPAID', outstandingBalance: 0,
      billingCycle: 'MONTHLY', autoPayEnabled: false, maxSeatsPerBooking: null,
    },
  })
  const negativeApproval = await api(`/api/admin/companies/${negativePending.id}/approve`, {
    method: 'PATCH',
    token,
    body: { action: 'approve', creditLimit: -500, paymentMode: 'CREDIT', billingCycle: 'MONTHLY' },
  })
  check('it is refused', negativeApproval.status === 400, `status=${negativeApproval.status}`)
  const stillPending = await prisma.company.findUniqueOrThrow({ where: { id: negativePending.id } })
  check('the company is not activated', stillPending.isActive === false)
  check('and its limit is not negative', stillPending.creditLimit === 0, String(stillPending.creditLimit))
  check('and no record was written',
    (await prisma.creditLog.count({ where: { companyId: negativePending.id } })) === 0)

  console.log('zero is a valid limit')
  const zeroed = await api(`/api/admin/companies/${company.id}`, {
    method: 'PATCH',
    token,
    body: { creditLimit: 0 },
  })
  check('it is accepted', zeroed.status === 200, `status=${zeroed.status}`)
  const afterZero = await prisma.company.findUniqueOrThrow({ where: { id: company.id } })
  check('and the limit is zero', afterZero.creditLimit === 0, String(afterZero.creditLimit))
  const zeroLog = await prisma.creditLog.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' },
  })
  check('and it was written down', zeroLog?.newLimit === 0, String(zeroLog?.newLimit))
  check('with the change it made', zeroLog?.changeAmount === -3000, String(zeroLog?.changeAmount))

  // ── Clean up ─────────────────────────────────────────────────────────
  await prisma.creditLog.deleteMany({ where: { companyId: { in: [company.id, pending.id, negativePending.id] } } })
  await prisma.auditLog.deleteMany({ where: { companyId: { in: [company.id, pending.id, negativePending.id] } } })
  await prisma.user.updateMany({ where: { companyId: { in: [company.id, pending.id, negativePending.id] } }, data: { companyId: null } })
  await prisma.company.deleteMany({ where: { id: { in: [company.id, pending.id, negativePending.id] } } })
  await prisma.user.delete({ where: { id: admin.id } })

  console.log(failures === 0 ? '\n  all checks passed' : `\n  ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
