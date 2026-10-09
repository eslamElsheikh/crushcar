#!/usr/bin/env node
/**
 * Audits the denormalized balance columns (Company.walletBalance,
 * Company.outstandingBalance) against the immutable rows they are supposed to
 * summarise, and — only when explicitly asked — repairs them.
 *
 * These columns are written from six call sites with no reconciliation, so they
 * drift. When they drift, every balance the dashboard shows is a lie, and the
 * drift compounds because credit-limit checks read the wrong number.
 *
 * Usage:
 *   DATABASE_URL="mysql://..." node scripts/reconcile-balances.mjs            # report
 *   DATABASE_URL="mysql://..." node scripts/reconcile-balances.mjs --apply     # repair
 *   DATABASE_URL="mysql://..." node scripts/reconcile-balances.mjs --apply --company <id>
 *
 * `--apply` is refused unless you also pass --yes, and it prints an AuditLog row
 * for every company it touches so the repair itself is auditable.
 */
import mysql from 'mysql2/promise'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const YES = args.includes('--yes')
const companyIdx = args.indexOf('--company')
const ONLY = companyIdx !== -1 ? args[companyIdx + 1] : null

const url = process.env.DATABASE_URL || ''
const m = url.match(/^mysql:\/\/([^:]+):?(.*)@([^:/]+):?(\d*)\/([^?]+)/)
if (!m) {
  console.error('Set DATABASE_URL to a mysql:// DSN.')
  process.exit(2)
}
const [, user, pass, host, port, database] = m

const conn = await mysql.createConnection({
  user,
  password: pass || '',
  host,
  port: port ? Number(port) : 3306,
  database,
})
const rows = async (sql, p = []) => (await conn.query(sql, p))[0]
const r2 = (n) => Math.round(Number(n) * 100) / 100

const wallet = await rows(`
  SELECT c.id, c.name, c.walletBalance AS storedVal,
         COALESCE((SELECT SUM(w.amount) FROM WalletTransaction w WHERE w.companyId=c.id),0) AS ledgerVal
    FROM Company c ${ONLY ? 'WHERE c.id=?' : ''}
`)
const credit = await rows(`
  SELECT c.id, c.name, c.outstandingBalance AS storedVal,
         COALESCE((SELECT SUM(cb.paidOnCredit) FROM CompanyBooking cb
                    WHERE cb.companyId=c.id AND cb.status IN ('PAID','BOARDED')),0)
         - COALESCE((SELECT SUM(ch.paidOnCredit) FROM CharterBooking ch
                    WHERE ch.companyId=c.id AND ch.status='cancelled'),0) AS expectedVal
    FROM Company c ${ONLY ? 'WHERE c.id=?' : ''}
`, ONLY ? [ONLY] : [])

const drifts = []
for (const c of credit) {
  const stored = r2(c.storedVal)
  const expected = r2(c.expectedVal)
  if (Math.abs(stored - expected) > 0.01) {
    drifts.push({ id: c.id, name: c.name, column: 'outstandingBalance', stored, expected, delta: r2(expected - stored) })
  }
}
for (const w of wallet) {
  const stored = r2(w.storedVal)
  const expected = r2(w.ledgerVal)
  if (Math.abs(stored - expected) > 0.01) {
    drifts.push({ id: w.id, name: w.name, column: 'walletBalance', stored, expected, delta: r2(expected - stored) })
  }
}

console.log('\n=== BALANCE RECONCILIATION REPORT ===\n')
if (!drifts.length) {
  console.log('No drift. Every stored balance matches its source rows.')
  await conn.end()
  process.exit(0)
}

console.log('company              column              stored      expected        delta')
console.log('-'.repeat(78))
for (const d of drifts) {
  console.log(
    `${d.name.padEnd(20)}  ${d.column.padEnd(18)}  ${String(d.stored).padStart(9)}  ${String(d.expected).padStart(12)}  ${String(d.delta).padStart(10)}`,
  )
}

const auditTrail = await rows(`
  SELECT w.companyId, w.type, COUNT(*) n, SUM(w.amount) total, MIN(w.createdAt) firstAt, MAX(w.createdAt) lastAt
    FROM WalletTransaction w
   WHERE w.companyId IN (${drifts.map((d) => `'${d.id}'`).join(',')})
   GROUP BY w.companyId, w.type
`)
console.log('\n=== LEDGER ACTIVITY FOR AFFECTED COMPANIES ===\n')
for (const row of auditTrail) {
  console.log(`  ${row.companyId}  ${String(row.type).padEnd(15)} ${String(row.n).padStart(3)} rows  total ${row.total}  (${row.firstAt} → ${row.lastAt})`)
}

// A charge larger than the balance available at that moment means the
// insufficient-funds guard did not hold when the booking was confirmed.
// Trusting the ledger would then "repair" the wallet to a negative number,
// which is not a repair. Surface it and refuse to apply.
const overspend = await rows(`
  SELECT ch.id, ch.price, ch.paidFromWallet, ch.paidOnCredit, ch.createdAt,
         (SELECT COALESCE(SUM(w.amount),0) FROM WalletTransaction w
           WHERE w.companyId = ch.companyId AND w.createdAt <= ch.createdAt) AS wallet_before
    FROM CharterBooking ch
   WHERE ch.status = 'confirmed'
     AND ch.id IN (SELECT reference FROM WalletTransaction WHERE type='BOOKING_CHARGE')
   HAVING ch.paidFromWallet > GREATEST(wallet_before, 0)
`)

let blocked = false
if (overspend.length) {
  console.log('\n!! OVERSPEND — the wallet was charged more than it held.\n')
  for (const r of overspend) {
    console.log(
      `   charter ${r.id}  price=${r.price}  wallet_before=${r.wallet_before}  ` +
        `paidFromWallet=${r.paidFromWallet}  paidOnCredit=${r.paidOnCredit}`,
    )
  }
  console.log(
    '\n   The booking guard should have moved the shortfall to credit, but the\n' +
      '   row says it all came from the wallet. Trusting the ledger would set the\n' +
      '   wallet negative — that is not a repair, it is hiding the defect.\n' +
      '   Resolve this by hand: decide what the company actually owes, then either\n' +
      '   correct the booking row or write an adjusting ledger entry.',
  )
  blocked = true
}

const negativeTargets = drifts.filter((d) => d.expected < 0)
if (negativeTargets.length) {
  console.log('\n!! Recomputed value would go NEGATIVE — refusing to consider it a repair.')
  for (const d of negativeTargets) {
    console.log(`   ${d.name}: ${d.column} would become ${d.expected}`)
  }
  blocked = true
}

console.log(
  '\nA deposit approved outside the ledger, or a manual edit in phpMyAdmin, looks\n' +
    'exactly like this. Confirm with the owner which figure is correct before\n' +
    'applying: --apply overwrites the stored column with the recomputed value.',
)

if (blocked) {
  console.error('\nRefusing to repair: the recomputed values are not trustworthy. See above.')
  await conn.end()
  process.exit(1)
}

if (!APPLY) {
  console.log(`\nRe-run with --apply${YES ? '' : ' --yes'} to repair. Nothing was changed.`)
  await conn.end()
  process.exit(0)
}

if (!YES) {
  console.error('\nRefusing to repair without --yes. Re-run with: --apply --yes')
  await conn.end()
  process.exit(1)
}

console.log('\nApplying repairs…\n')
for (const d of drifts) {
  await conn.query(
    `UPDATE Company SET ${d.column} = ? WHERE id = ? AND ${d.column} = ?`,
    [d.expected, d.id, d.stored],
  )
  await conn.query(
    `INSERT INTO AuditLog (id, action, entity, entityId, userId, userEmail, companyId, metadata, ip, createdAt)
     VALUES (?, 'ADJUST', 'Company', ?, '', 'reconcile-balances.mjs', ?, ?, '', NOW(3))`,
    [
      `adj_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      d.id,
      d.id,
      JSON.stringify({ column: d.column, from: d.stored, to: d.expected, delta: d.delta }),
    ],
  )
  console.log(`  ${d.name}: ${d.column} ${d.stored} → ${d.expected} (${d.delta > 0 ? '+' : ''}${d.delta})`)
}

const after = await rows(`
  SELECT c.id, c.name, c.walletBalance, c.outstandingBalance
    FROM Company c WHERE c.id IN (${drifts.map((d) => `'${d.id}'`).join(',')})
`)
console.log('\nPost-repair state:')
for (const row of after) {
  console.log(`  ${row.name}: wallet=${row.walletBalance} outstanding=${row.outstandingBalance}`)
}

await conn.end()
console.log('\nDone. Re-run without --apply to confirm zero drift.')