# SAFROTRAVEL — API Route Security Matrix (Independent Verification, Run #5)

Date: 2026-11-13 · Branch: `fix/seatmap-mobile` — committed (`b4e62ac`) and deployed (run `43351249283` green) · Suite: `scripts/verify-security-suite.ts` (136/136 assertions, two consecutive runs) · Probe: `.scratch/verify-run5/probe.ts` (39/39) · Production probe: `.scratch/verify-run5/prod-probe.ts` (15/15, read-only)

## How to read this matrix

**Method.** Every one of the 90 files under `src/app/api/**/route.ts` was enumerated by
`scripts/route-matrix.ts`, which extracts exported HTTP methods and the security markers
actually present in each file's source (`auth()`, `getServerSession`, role constants,
`companyId`/`customerId`/ownership scoping, zod, rate limiters, `$transaction`, `lockRow`).
Auth/role/scope columns are **file-level source facts**, not behaviour claims. Behaviour
claims are made only where live HTTP evidence exists.

**Evidence codes**

| Code | Meaning |
|---|---|
| `A0`–`A26` | Area of `scripts/verify-security-suite.ts`, asserted against the running server (`http://127.0.0.1:3070`, local scratch DB) |
| `P` | Independent probe `.scratch/verify-run5/probe.ts` (status **and** response-body leak checks; 39 assertions, incl. direct middleware invocation) |
| `—` | No live request; classification rests on source inspection only |

**Status values**

| Status | Meaning |
|---|---|
| `LIVE` | Deny/allow behaviour asserted by at least one real HTTP request (suite or probe) |
| `STATIC` | Auth/role/scope markers confirmed in source; **not** probed live in this run |
| `PUBLIC` | Intentionally reachable without a session (by design; noted why) |
| `GAP` | Known residual issue — documented, not fixed in this run |

**Limitations (apply to the whole table)**

1. Sessions in live tests are forged as signed next-auth JWTs (`AUTH_SECRET`, salt
   `next-auth.session-token`). This exercises the real signature/expiry verification path
   but bypasses the login form and Turnstile. Login-form + Turnstile behaviour was not
   re-probed in Run #5 (unchanged from Run #4 — needs real credentials + keys).
2. Marker extraction is file-level: a file containing `auth()` may still expose a public
   method inside it. Rows marked `STATIC` therefore mean "the guards are present in
   source", not "every method was exercised".
3. The rate limiter store lives in the server process; re-running the suite inside a
   bucket window yields 429s where an assertion expects 400 — the suite accepts 429 as
   equivalent evidence on those rows (documented inline). This is a test-ordering artefact,
   not an application defect.
4. Run #4's vacuity caveat is **closed**: AREA 25 books against a future-dated,
   `SCHEDULED`, two-stop fixture trip, so the station-trips "future" filter is exercised
   with real data.

---

## Private page trees (not API, verified live)

| Route tree | Evidence | Status | Notes |
|---|---|---|---|
| `/bookings/*` (incl. `/bookings/[id]/print`) | A0, A12, P | LIVE | Anonymous → real **307** `Location: /login` from `src/middleware.ts`; forged/garbage cookie → 307; owner → 200. Layout `redirect()` retained as authoritative `auth()` check. |
| `/company/*` | A0, A12 | LIVE | Same middleware 307 guard. |
| `/admin/*` | A0, A12 | LIVE | Same middleware 307 guard. |

---

## API route matrix (90 routes)

Columns: **Auth** = session guard found in source · **Roles** = role checks found ·
**Scope** = tenant/ownership scoping found · **V/RL** = validation (zod) / rate limiter ·
**Ev** = live evidence · **St** = status.

| # | Route | Methods | Auth | Roles | Scope | V/RL | Ev | St |
|---|---|---|---|---|---|---|---|---|
| 1 | `/api/admin/audit-log` | GET | auth() | SUPER_ADMIN | companyId | — | — | STATIC |
| 2 | `/api/admin/bookings/export` | GET | auth() | SUPER_ADMIN | ownership | — | A16 | LIVE |
| 3 | `/api/admin/cancellations/:id` | PATCH | auth() | SUPER_ADMIN | companyId | tx | A18, P | LIVE — conditional refund claim: concurrent processing → exactly one 200, loser 409, stamp once |
| 4 | `/api/admin/cancellations` | GET | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 5 | `/api/admin/charter-bookings/:id` | PATCH | auth() | SUPER_ADMIN | companyId | zod+tx+lockRow | — | STATIC (fixed in Run #4: conditional status claims, ledger idempotency keys `charter-charge:`/`charter-refund:`) |
| 6 | `/api/admin/charter-bookings` | GET | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 7 | `/api/admin/companies/:id/approve` | PATCH | auth() | SUPER_ADMIN | companyId | tx | — | STATIC |
| 8 | `/api/admin/companies/:id/credit-limit` | GET,POST | auth() | SUPER_ADMIN | companyId | tx, `parseMoneyAmount`/`.finite()` | A23 | LIVE — Infinity/string amounts → 400, valid value accepted; **no ceiling on the value itself** (business decision, options in report §6) |
| 9 | `/api/admin/companies/:id/route-quotas` | GET,PUT,DELETE | auth() | SUPER_ADMIN | companyId | tx | — | STATIC |
| 10 | `/api/admin/companies/:id` | GET,PATCH | auth() | SUPER_ADMIN | companyId | tx | — | STATIC |
| 11 | `/api/admin/companies/pending` | GET | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 12 | `/api/admin/company-bookings/:id` | GET,PATCH,DELETE | auth() | SUPER_ADMIN | companyId | tx | A19, A24, A26 | LIVE — ATTACH_PROOF URL allowlist (external/`javascript:` → 400, own path → 200); EDIT conditional claim before money (concurrent edits → only 200/409, exactly one refund row); no `err.message` echo |
| 13 | `/api/admin/company-bookings/preview` | GET | auth() | SUPER_ADMIN | companyId | — | — | STATIC |
| 14 | `/api/admin/company-bookings` | GET,POST | auth() | SUPER_ADMIN | companyId+customerId | tx+lockRow | — | STATIC (customerId guard added Run #4 on company path; admin path mirrors it) |
| 15 | `/api/admin/credit-report` | GET | auth() | SUPER_ADMIN | companyId | — | — | STATIC |
| 16 | `/api/admin/deposit-requests/:id` | PATCH | auth() | SUPER_ADMIN | companyId | tx | A16, A24 | LIVE — concurrent approval race: exactly one 2xx, wallet credited once, one ledger row (`deposit-request:<id>` idempotency); corrupted stored amount → generic 500 + rollback (stays PENDING); unknown id → 404, no message echo |
| 17 | `/api/admin/deposit-requests` | GET | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 18 | `/api/admin/destinations/:id` | PATCH,DELETE | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 19 | `/api/admin/destinations` | GET,POST | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 20 | `/api/admin/destinations/upload` | POST | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 21 | `/api/admin/overview` | GET | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 22 | `/api/admin/payment-methods/:id` | PATCH,DELETE | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 23 | `/api/admin/payment-methods` | GET,POST | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 24 | `/api/admin/platform-wallet/adjust` | POST | auth() | SUPER_ADMIN | — | tx, `parseMoneyAmount` signed | A23 | LIVE — string/above-ceiling amounts → 400 (Run #5: had no magnitude cap at all) |
| 25 | `/api/admin/platform-wallet` | GET,POST | auth() | SUPER_ADMIN | — | tx, `parseMoneyAmount` | A23 | LIVE — Infinity funding → 400 |
| 26 | `/api/admin/settings` | GET,PATCH | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 27 | `/api/admin/trip-requests/:id` | PATCH | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 28 | `/api/admin/trip-requests` | GET | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 29 | `/api/admin/trips/:id/quotas` | GET,PUT | auth() | SUPER_ADMIN | companyId | tx | — | STATIC |
| 30 | `/api/admin/users/:id` | PUT | auth() | SUPER_ADMIN+COMPANY_ADMIN | companyId | — | A16 | LIVE — company admin editing a SUPER_ADMIN → 403 |
| 31 | `/api/admin/users` | GET,POST | auth() | SUPER_ADMIN+COMPANY_ADMIN | companyId | — | A16 | LIVE — POST with arbitrary role string → 400 (allowlist CUSTOMER/COMPANY_ADMIN/SUPER_ADMIN) |
| 32 | `/api/admin/verify/lookup` | GET | auth() | SUPER_ADMIN+COMPANY_ADMIN | companyId | RL 30/min | — | STATIC |
| 33 | `/api/analytics` | GET | auth() | role-checked | companyId | RL 150/min | A16 | LIVE — anon 401, customer 403, unlinked admin 400 |
| 34 | `/api/auth/[...nextauth]` | GET,POST | NextAuth | — | — | login throttle in middleware (`auth-login` 15/15 min) | — | STATIC — middleware `loginAttempt()` counts every credentials POST before NextAuth runs; timing oracle on unknown emails fixed in Run #5 (dummy bcrypt compare, `src/lib/auth.ts`); both source-verified only, not re-probed live |
| 35 | `/api/auth/send-verification` | POST | — (by design) | — | — | per-email limiter | — | PUBLIC — account-activation flow; email-keyed throttle in source |
| 36 | `/api/auth/verify-email` | GET | — (by design) | — | token | — | — | PUBLIC — token-based verification |
| 37 | `/api/bookings/:id` | GET,PATCH | auth() | SUPER_ADMIN+COMPANY_ADMIN | companyId+ownership | tx | A3, A13, A17, P | LIVE — anon 401 / cross-customer 403 / cross-company 403, no PII in denied bodies; owner PATCH restricted to allowlist (total/paymentStatus/userId/reference/status untouched — P); self-confirm PAID/BOARDED → 403; cancel-on-cancelled → 409 `BOOKING_CHANGED` (A17); boarding a CANCELLED booking → 409 (A16) |
| 38 | `/api/bookings/:id/ticket` | GET | auth() | SUPER_ADMIN+COMPANY_ADMIN | companyId+ownership | — | A1, A13, P | LIVE — 401/403/403/200/200 matrix, denied bodies contain no name/phone/reference |
| 39 | `/api/bookings/export` | GET | auth() | SUPER_ADMIN+COMPANY_ADMIN | companyId | — | A16 | LIVE — anon 401, customer 403, unlinked admin 400 `No company linked` |
| 40 | `/api/bookings` | GET | auth() | role-checked | companyId+ownership | RL `booking-lookup` | A5, A14 | LIVE — anon 401; customer body contains only their own rows; company-scoped bodies scoped to own buses |
| 41 | `/api/bookings` | POST | auth() | role-checked | companyId+ownership | RL `booking-checkout` 100/10 min, tx, lockRow, Turnstile | A19, A24 | LIVE — cross-table conflicts (company-held seat, live hold, no-stop-trip seat) → 409 `SEAT_TAKEN`; unknown trip → 404 `Trip not found`; positive control: free seat → 200 |
| 42 | `/api/buses/:id/layout` | GET,PUT | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 43 | `/api/buses/:id` | GET,PUT,DELETE | auth() | SUPER_ADMIN | companyId | — | — | STATIC |
| 44 | `/api/buses/:id/stations` | GET,PUT | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 45 | `/api/buses` | GET,POST | auth() | SUPER_ADMIN | companyId | — | — | STATIC |
| 46 | `/api/cancellation-policy` | GET | — (by design) | — | — | — | — | PUBLIC — policy text needed before booking |
| 47 | `/api/companies` | GET,POST | auth() | role-checked | companyId | — | — | STATIC |
| 48 | `/api/company/bookings/:id` | GET,PATCH | auth() | role-checked | companyId | tx | A4, A13, A17, P | LIVE — cross-tenant admin → 404 (isolated), owning admin 200, super-admin 200; denied cross-tenant body leak-checked; board guard: BOARDED refused for non-boardable status → 409 (A17) |
| 49 | `/api/company/bookings/:id/ticket` | GET | auth() | role-checked | companyId | — | A2, A13, P | LIVE — 401/403/403/200/200 matrix, no PII in denied bodies |
| 50 | `/api/company/bookings` | GET | auth() | role-checked | companyId | — | — | STATIC — list scoping covered indirectly via `/api/bookings?type=company` (A14); this exact path not probed |
| 51 | `/api/company/bookings` | POST | auth() | role-checked | companyId+customerId | tx+lockRow | A16, A19, A24 | LIVE — cross-tenant `customerId` → 400 `INVALID_CUSTOMER`; customer hold blocks the seat → 409 `SEAT_TAKEN`; unknown trip → 404; reversed stations → 400 |
| 52 | `/api/company/charter/bookings` | GET,POST | auth() | COMPANY_ADMIN | companyId | zod | — | STATIC |
| 53 | `/api/company/charter/trips` | GET | auth() | COMPANY_ADMIN | companyId | — | — | STATIC |
| 54 | `/api/company/credit` | GET | auth() | role-checked | companyId | — | — | STATIC |
| 55 | `/api/company/customers/:id` | GET,PATCH,DELETE | auth() | role-checked | companyId | — | — | STATIC |
| 56 | `/api/company/customers` | GET,POST | auth() | role-checked | companyId | — | — | STATIC |
| 57 | `/api/company/deposit-requests` | GET,POST | auth() | COMPANY_ADMIN | companyId | `parseMoneyAmount` | A23 | LIVE — string/3-decimal/above-ceiling/negative/Infinity amounts → 400; plain valid deposit → 200 (positive control) |
| 58 | `/api/company/info` | GET | auth() | role-checked | companyId | — | A11 | LIVE — customer denied (401/403), owning company admin 200 |
| 59 | `/api/company/settings/logo` | POST,PUT | auth() | COMPANY_ADMIN | companyId | — | — | STATIC |
| 60 | `/api/company/trip-requests` | GET,POST | auth() | COMPANY_ADMIN | companyId | — | — | STATIC |
| 61 | `/api/company/wallet` | GET,POST | auth() | role-checked | companyId | tx, `parseMoneyAmount` | A23 | LIVE — POST is super-admin-only by design (a company admin crediting their own wallet would mint money) + string amount → 400 |
| 62 | `/api/customers` | GET | auth() | role-checked | companyId+customerId | — | A6, A16 | LIVE — admin without company → 400; anon 401; customer 403 |
| 63 | `/api/destinations` | GET | — (by design) | — | — | — | — | PUBLIC — destination catalogue for public search |
| 64 | `/api/faqs/:id/reorder` | PATCH | auth() | SUPER_ADMIN | — | tx | — | STATIC |
| 65 | `/api/faqs/:id` | PATCH,DELETE | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 66 | `/api/faqs` | GET | auth() in file | — | — | `?all=1` gate | A22, P | LIVE — anon `?all=1` excludes inactive FAQs, super admin sees them, default view excludes them (Run #5 fix) |
| 67 | `/api/faqs` | POST | auth() | SUPER_ADMIN | — | — | A7 | LIVE — customer → 403, company admin → 403 |
| 68 | `/api/faqs/seed` | POST | auth() | SUPER_ADMIN | — | tx | — | STATIC |
| 69 | `/api/health` | GET | — (by design) | — | — | — | — | PUBLIC — health probe, no data |
| 70 | `/api/jobs/transition` | POST | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 71 | `/api/log-error` | POST | — (by design) | — | — | RL 30/min `client-log-error` | A10, A15 | LIVE — normal post → 200; flooding → 429 with `Retry-After` |
| 72 | `/api/payment-methods` | GET | — (by design) | — | — | — | — | PUBLIC — checkout needs the list; display data only |
| 73 | `/api/platform/bookings` | POST | auth() | SUPER_ADMIN | — | tx+lockRow | — | STATIC |
| 74 | `/api/profile` | GET,PUT | auth() | session-scoped | self | zod | A9 | LIVE — PUT password < 6 chars → 400; wrong current password → 400 (bcrypt cost 12 verified in source) |
| 75 | `/api/profile/upload` | POST | auth() | session-scoped | self | — | — | STATIC |
| 76 | `/api/public/stats` | GET | — (by design) | — | — | RL 300/min | — | PUBLIC — aggregate counters only; financials excluded by design (comment + source) |
| 77 | `/api/register` | POST | — (by design) | — | — | validation, RL `register-customer` 20/15 min, tx | A20 | LIVE — malformed email → 400, case-variant duplicate → 400; Turnstile enforced when configured |
| 78 | `/api/register/company` | POST | — (by design) | — | companyId | validation, RL `register-company` 10/15 min, tx | A20 | LIVE — Run #5: rate limit added (flood → 429 with `Retry-After`); malformed email/short password/oversized name → 400; case-variant duplicate → 400 |
| 79 | `/api/reports` | GET | auth() | role-checked | companyId | — | — | STATIC |
| 80 | `/api/seats/hold` | POST,DELETE | auth() | session-scoped | — | RL `seat-hold` 30/60 s, 10 active/user | A19 | LIVE — Run #5: anonymous → 401; flood → 429 with `Retry-After`; active holds/user ≤ 10; company-booked seat → 409 `SEAT_TAKEN` (holds now consulted by every booking path) |
| 81 | `/api/settings/individual-registration` | GET | — (by design) | — | — | — | — | PUBLIC — registration toggle for the signup page |
| 82 | `/api/settings/payment` | GET | — (by design) | — | — | — | — | PUBLIC — display-only payment instructions (source comment: managed by SUPER_ADMIN in /admin/settings) |
| 83 | `/api/stations/:id` | GET,PATCH,DELETE | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 84 | `/api/stations/:id/trips` | GET | — (by design) | — | — | — | A25 | LIVE — returns only scheduled, future, non-charter trips, asserted with a **future-dated fixture trip** (Run #4's vacuity caveat closed) |
| 85 | `/api/stations` | GET,POST | auth() in file | SUPER_ADMIN (POST) | — | — | — | STATIC — GET used by public booking pages in source; file-level marker caveat applies |
| 86 | `/api/trips/:id/block` | POST,DELETE | auth() | SUPER_ADMIN | — | — | — | STATIC |
| 87 | `/api/trips/:id` | GET,PUT,DELETE | auth() | role-checked | companyId | tx | — | STATIC |
| 88 | `/api/trips/counts` | GET | auth() | SUPER_ADMIN only | — | — | A8 | LIVE — anon 401, customer 403, company admin 403, super admin 200 |
| 89 | `/api/trips` | GET,POST | auth() in file | role-checked | companyId | — | — | STATIC — GET is the public timetable in the booking flow; per-method caveat applies |
| 90 | `/api/uploads/:...path` | GET | signed link or session | — | ownership via DB reference | HMAC `?exp=&sig=` | A21, P | LIVE — Run #5: files referenced by proof columns → anon 401 / other customer 403 / owner 200 (`no-store`) / super admin 200; destination photos & avatars stay public by design |
| 91 | `/api/uploads/:file` | GET | signed link or session | — | ownership via DB reference | HMAC `?exp=&sig=` | A21, P | LIVE — same model as above; expired/tampered/garbage signature → 401 (falls back to session auth); encoded path traversal → 404 |
| 92 | `/api/uploads/payment-proof` | POST | auth() | session-scoped | self | magic-byte sniffing | A21, P | LIVE — anon upload → 401, signed-in upload → 201 |
| 93 | `/api/uploads/sign` | POST | auth() | owner-or-better | ownership via DB reference | HMAC SHA256, TTL | A21, P | LIVE — anon mint → 401, other user's file → 403, owner → 200; fresh link works anonymously until expiry |

> Row numbering exceeds 90 because `/api/bookings` (GET vs POST) and `/api/faqs`
> (GET vs POST) are split to give each method its own evidence and status.
> **Distinct route files: 90** (enumerated by `scripts/route-matrix.ts`; Run #5 added
> `api/uploads/sign`).

### Routes with no authentication by design (summary)

`/api/auth/send-verification`, `/api/auth/verify-email`, `/api/cancellation-policy`,
`/api/destinations`, `/api/health`, `/api/log-error`, `/api/payment-methods`,
`/api/public/stats`, `/api/register`, `/api/register/company`,
`/api/settings/individual-registration`, `/api/settings/payment`,
`/api/stations/:id/trips`, NextAuth catch-all — plus **`/api/uploads/*` for files not
referenced by any record** (destination photos, avatars, and orphaned uploads; proof
files referenced by a DB row are private — Run #5).

Rate-limited in source: `log-error`, `public-stats`, **both `register` paths (Run #5)**,
`booking-lookup`, `booking-checkout`, `seat-hold` (Run #5), `auth-login` (middleware),
`client-log-error`, `verify/lookup`. `register` also relies on Turnstile when configured.

---

## Evidence index

| Suite area | What it proves | Routes covered |
|---|---|---|
| A0 | Anonymous private-page redirect | `/bookings/*` pages |
| A1 | Customer ticket IDOR matrix | `/api/bookings/:id/ticket` |
| A2 | Company ticket IDOR matrix | `/api/company/bookings/:id/ticket` |
| A3 | Booking detail/patch authorization + privilege escalation | `/api/bookings/:id` |
| A4 | Company booking tenant isolation (404 cross-tenant) | `/api/company/bookings/:id` |
| A5 | Bookings list anonymous denial | `/api/bookings` GET |
| A6 | Customers list company scoping | `/api/customers` |
| A7 | FAQ privilege escalation | `/api/faqs` POST |
| A8 | Trip counts role gate | `/api/trips/counts` |
| A9 | Profile password policy | `/api/profile` PUT |
| A10/A15 | Log-error limiter (200 then 429 + Retry-After) | `/api/log-error` |
| A11 | Company info access control | `/api/company/info` |
| A12 | Real server-side **307** on private pages (forged cookie) | page trees |
| A13 | Denied responses carry **no booking PII** (body scan) | tickets, booking detail |
| A14 | List bodies tenant-scoped (no foreign rows) | `/api/bookings` GET (customer + company) |
| A16 | Run #4 fixes: role allowlist, customerId tenant guard, board guard, deposit race, export/customers/analytics gates, super-admin PUT guard | rows 16, 30, 31, 33, 39, 48, 51, 62 |
| A17 | Previously code-only findings: station-trips contract, cancel/positive flows | rows 37, 48 (superseded for station trips by A25) |
| A18 | **Run #5:** customer refund conditional claim (concurrent → one winner) | row 3 |
| A19 | **Run #5:** seat holds + cross-table + degenerate-segment conflicts, hold auth/cap/RL, positive control | rows 41, 51, 80 |
| A20 | **Run #5:** registration validation, case-insensitive duplicates, flood → 429 | rows 77, 78 |
| A21 | **Run #5:** upload authz matrix + signed-link lifecycle | rows 90–93 |
| A22 | **Run #5:** FAQ drafts behind `?all=1` | row 66 |
| A23 | **Run #5:** money bounds (strings/Infinity/decimals/caps) + error mapping | rows 8, 24, 25, 57, 61 |
| A24 | **Run #5:** invalid ids/segments → 404/400, PROOF_URL allowlist, stored-amount guard | rows 12, 16, 41, 51 |
| A25 | **Run #5:** station trips with a future-dated fixture (vacuity closed) | row 84 |
| A26 | **Run #5:** concurrent company-booking EDIT — money exactly once + claim predicate | row 12 |
| P (probe) | Independent 39/39: middleware fail-closed (direct invocation), CSP/nonce headers, upload authz + signatures + traversal, FAQ drafts, refund race, cross-table seat, money bounds, mapped errors with leak scans | rows 3, 12, 37, 38, 48, 49, 66, 90–93, page trees |

## Residual issues (documented, not fixed in Run #5)

1. **FINDING-026 — hardcoded deploy key** in `.github/workflows/deploy.yml` /
   `scripts/apply-migrations.php` (`safro_extract_2026` shipped in a query string,
   cleanup `|| true`) — **HIGH, OPEN**; operational decision required.
2. **`creditLimit` has no ceiling** (`.finite()` only) — business decision; four options
   documented in `SECURITY_VERIFICATION_REPORT.md` §6.
3. **Login/Turnstile not live-probed** — needs real credentials + Turnstile keys
   (timing fix and login throttle are source-verified).
4. **Orphaned uploads fall back to public** — deliberate (destination photos/avatars must
   stay public); needs a reference-collection scheme to change.
5. **DB index recommendations** — `Booking(tripId, seatLabel)`,
   `CompanyBooking(tripId, seatLabel)`, `SeatHold(tripId, seatLabel, expiresAt)`.
6. **SQLite serialises interactive transactions**, so the EDIT-claim stale-read 409 is not
   observable over HTTP in this environment (asserted at predicate level; report §5).
