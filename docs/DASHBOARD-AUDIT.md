# Dashboard audit — what was wrong, what changed, how to re-verify

The admin dashboard was showing numbers the database did not support. This
records each defect, the file that caused it, and the tool that now catches it.

## Production status — checked 2026-10-09 against the live database

Reached via FTP + a throwaway read-only PHP script (MySQL is bound to
`localhost`, port 3306 is not reachable from outside). The script was uploaded
under a random name, fetched once, and deleted; all temp files verified gone
(HTTP 404).

| Item | State |
|---|---|
| Dashboard indexes | **fixed** — all 7 added; `EXPLAIN` now uses `range` instead of a full scan |
| `Destination` table | already present with 4 rows |
| `Booking` payment columns | already present (6 of 6) |
| `User.image` | already present |
| `DepositRequest.method` / `.notes` | already present |
| Trip statuses | clean — 119 COMPLETED, 1 CANCELLED, 0 stale SCHEDULED |
| Balances | **still unrepaired on purpose** — see below |

The `data_live/` dump (2026-10-05) was four days stale, which is why an early
pass concluded those tables and columns were missing. They were not. The only
genuinely missing item was the indexes.

### Also removed: leftover debug scripts in the web root

`public_html` contained 17 debug/maintenance PHP files from earlier sessions,
several reachable over HTTP. The worst was `up.php`:

```php
if (move_uploaded_file($_FILES['file']['tmp_name'],
    '/home/safro/public_html/standalone-next.tar.gz')) { ... }
```

No authentication, no extension check, no filename control — anyone on the
internet could write arbitrary files into the web root, including a `.php`
webshell, and take over the site or read `wp-config.php` credentials. It also
wrote a predictable filename.

All 17 were downloaded to a local backup and then deleted. `POST /up.php` now
returns 404. Backups: `C:\Users\eslam\AppData\Local\Temp\opencode\safro-mysql\removed-php-scripts\`.

## Do not repair the balances yet — read this first

`npm run reconcile:balances` will refuse to apply, and it is right to. The audit
turned up the reason:

```
charter cmtestbook65e6d2094e1df717  price=2500  wallet_before=500  paidFromWallet=2500  paidOnCredit=0
charter cmul6ddi5000ba8daxqgtxhmp  price=900   wallet_before=500  paidFromWallet=900   paidOnCredit=0
```

Two confirmed charter bookings were charged to the wallet in full when the
wallet held 500. The booking guard in
`api/admin/charter-bookings/[id]/route.ts:61` splits a charge into
`paidFromWallet` + `paidOnCredit`, so those rows should read `500 / 2000` and
`500 / 400`. They read `2500 / 0` and `900 / 0`.

Consequences:

- `SUM(WalletTransaction.amount)` is **−400**. "Trusting the ledger" would
  write a negative wallet balance, which is not a repair — it hides the defect
  behind a number that cannot be true.
- `walletBalance` (1853) is wrong too, but for a different reason than simple
  drift. Do not overwrite it with either figure.
- The `paidOnCredit` split is also wrong, which is why `outstandingBalance`
  shows 0 while 1375 was booked on credit.

There is also a confirmed charter from 2026-08-23 (`cmt5usc0e0001e6uyiedf2f9m`,
497 EGP) with `paidFromWallet = 0` and `paidOnCredit = 0`. It is counted as
revenue but no money ever moved for it.

So the 2253 gap is the sum of at least three separate defects, not one drift.
Someone who knows what the company actually paid needs to decide the real
figures. The scripts report the anomaly and refuse to guess.

## Verify

```bash
# 1. What the database actually implies (read-only, works on production)
DATABASE_URL="mysql://user:pass@host:3306/safro_travel_db" npm run check:numbers

# 2. What the running app returns vs that same SQL (needs a login)
DATABASE_URL="mysql://..." BASE_URL="https://your-domain.com" \
  AUDIT_EMAIL="superadmin@safrotravel.com" AUDIT_PASSWORD="..." \
  npm run check:dashboard

# 3. Translation keys resolve (catches raw keys leaking into the UI)
npm run check:lang

# 4. Balance drift
DATABASE_URL="mysql://..." npm run reconcile:balances           # report
DATABASE_URL="mysql://..." npm run reconcile:balances -- --apply --yes   # repair
```

`check:dashboard` must report 41/41 before this is considered done.

From cPanel, MySQL is bound to localhost and port 3306 is not reachable from
outside. Use the two SQL files in phpMyAdmin instead:

| File | Use |
|---|---|
| `docs/deploy/audit-production-dashboard.sql` | Read-only. Paste into phpMyAdmin → SQL. Prints what the database contains. Run before and after the repair and keep both outputs. |
| `docs/deploy/repair-production-data.sql` | Makes changes. Take a `mysqldump` first. Idempotent — tested by running twice against a copy of the live dump with no errors. Does not touch balances: step 6 only reports drift. |

## Production data repair

`docs/deploy/repair-production-data.sql` — take a `mysqldump` first. Every
statement is idempotent; it was run twice against a copy of the live dump with
no errors. It does not modify balances: step 6 only *reports* drift, and the
repair UPDATE is left commented out on purpose.

## Defects fixed

### Revenue was structurally undercounted

| File | Defect |
|---|---|
| `api/analytics/route.ts` | Summed `Booking` where `status:'PAID'`. BOARDED bookings — the normal state of a completed trip — were excluded, so revenue dropped the moment a passenger boarded. Company bookings and charter bookings were not counted at all. |
| `api/reports/route.ts` | Same filter, three times. Also `groupBy(['createdAt'])` on a `DateTime`, which produces one row per distinct timestamp — no aggregation at all. |
| `api/public/stats/route.ts` | Same filter on a public, unauthenticated endpoint. |
| `api/company/credit/route.ts` | Already correct (`PAID`+`BOARDED`), which is why the two dashboards disagreed. |

Revenue now comes from one place, `src/lib/analytics.ts`, and counts customer +
company + charter with BOARDED treated as paid. `activeTrips` gained the
`departure >= now` filter it was missing — it previously counted trips that had
already departed, because `Trip.status` only advances when someone opens the
dashboard.

### Scope and definition mismatches

| Symptom | Cause |
|---|---|
| "Total Bookings" ignored the 7d/30d/90d selector | Query had no date filter and no status filter |
| Two pages reported different trip counts for the same moment | One counted `SCHEDULED`, the other `SCHEDULED` + `departure >= now` |
| "Total Routes" showed 0 with 120 trips in the database | Counted `routeData.length`, which only contains trips that took money |
| Booking counts on the customers page described 20 rows as "Total Bookings" | Summed the current page client-side |
| "Avg per Customer" divided by page length | Same |
| Customers page Revenue column was always 0 | API returned `totalSpent`, page read `totalRevenue` |
| Customer search did nothing | Page sent `?q=`, API read `?search=` |
| Cancellations KPI counted a wider set than the cancellations page | One filter omitted `refundAmount: { not: null }` |
| Company booking counts included cancelled bookings | `count({ companyId })` with no status filter |
| `User.totalBookings` included cancelled bookings | `bookings.length` |
| Credit report totals disagreed with the dashboard KPI above it | One summed all companies client-side, the other used `isActive: true` |

### Unauthenticated data exposure

- `api/public/stats` returned platform-wide revenue, booking counts, bus count
  and seat occupancy to anyone. Now returns only active trips and station count.
- `api/companies` had no auth check whatsoever on GET — any visitor could list
  every company with bus and user counts. Now scoped by role.
- `api/company/wallet` POST let a `COMPANY_ADMIN` credit their own wallet with
  no approval and no audit row. Now SUPER_ADMIN-only and audited.

### Other

- `api/trips/route.ts` interpolated `companyId` into `$queryRawUnsafe`. Now a
  bound parameter. (Low risk — it came from the session, not the request — but
  it is one refactor away from being exploitable.)
- `api/analytics` logged user email and every metric on each page load.
- Raw translation keys rendered into the UI. `t()` returns its input when a key
  is missing, so `company.noBookings`, `company.pendingRequests` and
  `company.paymentMode` were printing as literal strings. Keys added;
  `npm run check:lang` now fails the build on any new one.
- Timezone: three different conventions (UTC buckets / local windows / UTC month
  keys). All bucketing is now Africa/Cairo via `businessDay`/`businessMonth`.
- Revenue chart had no zero-fill, so a quiet week drew a straight line across
  the gap. Labels were raw ISO dates.
- Reports CSV hardcoded `Revenue (EGP)`, bypassing i18n.
- `layout.seats` was never loaded in reports, so occupancy always fell back to
  a stale `bus.seatCount`.

## Data problems found in production

| Problem | State |
|---|---|
| No indexes on `Booking.status/createdAt`, `CompanyBooking.companyId/status`, `Trip.status/departure` | **fixed** 2026-10-09 |
| Every `Bus.companyId` was NULL | open — 4 buses, ownership is a business decision |
| 1 trip stuck `SCHEDULED` after arrival | already resolved (119 COMPLETED, 0 stale) |
| `Destination` table absent | not actually absent — present with 4 rows; the Oct 5 dump was stale |
| `Booking` payment columns absent | not actually absent — all 6 present |
| `User.image` absent | not actually absent — present |
| `walletBalance` 1853 vs ledger −400 | **open — needs a human decision** |
| `outstandingBalance` −275 vs 1375 booked on credit | **open — needs a human decision** |

The drift reproduces exactly the shape you would expect from six unsynchronised
write sites with no reconciliation, and one of them (`POST /api/company/wallet`)
let a company admin credit itself. Which figure is authoritative needs a human
decision — `npm run reconcile:balances` reports both and repairs only on
`--apply --yes`, writing an `AuditLog` row per change.

## Known limitations

- The balance repair was verified against a local copy of the dump, never run
  against production.
- `Bus.companyId` is still NULL everywhere. The repair script prints the buses
  and their trip counts and leaves the UPDATE commented out, because assigning
  ownership is a business decision — the two "test" companies in the dump have
  zero buses, so there is only one plausible owner, but that is not this code's
  call to make.
- `reconcile-balances.mjs` computes expected outstanding as
  `SUM(paidOnCredit) - SUM(cancelled charter paidOnCredit)`. It does not model
  deposits that pay down outstanding, so a company that has settled credit will
  still show as drifted. Read the report before applying.
- `totalBookings` on the dashboard is range-scoped; the reports page is
  all-time. That is intentional (the selector sits above the dashboard) but it
  means the two numbers will differ, by design.