# SAFROTRAVEL — SECURITY FIX LOG

**Last Updated:** 2026-11-13  
**Audit Run:** Run #5  

---

## Change Log & Remediations

### Fix 1: Customer Ticket API Authentication & Authorization
- **Files Changed:** `src/app/api/bookings/[id]/ticket/route.ts`
- **Reason for Change:** Prevent unauthenticated access and IDOR on customer booking tickets (reported vulnerability: `https://safrotravel.com/bookings/cmwc7iqde000b3rv3o85cso73/print`).
- **Remediation Details:**
  - Added session authentication check `const session = await auth()`. Returns 401 Unauthorized for unauthenticated callers.
  - Added principal authorization check: allowed if `booking.userId === session.user.id`, `session.user.role === 'SUPER_ADMIN'`, or operating bus company admin. Returns 403 Forbidden otherwise.
- **Regression Tests Added:** `TICKET_CUSTOMER` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (401 on anon, 403 on cross-customer, 200 on owner/superadmin).

---

### Fix 2: Corporate Booking Ticket API Authentication & Cross-Tenant Isolation
- **Files Changed:** `src/app/api/company/bookings/[id]/ticket/route.ts`
- **Reason for Change:** Prevent unauthenticated ticket disclosure and cross-company IDOR on corporate booking tickets.
- **Remediation Details:**
  - Added session authentication check. Returns 401 Unauthorized for unauthenticated callers.
  - Denied access to `CUSTOMER` role (returns 403 Forbidden).
  - Enforced tenant boundary: `booking.companyId === session.user.companyId` for `COMPANY_ADMIN`.
  - Allowed `SUPER_ADMIN` access.
- **Regression Tests Added:** `TICKET_COMPANY` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (401 on anon, 403 on customer/cross-company, 200 on owning company admin/superadmin).

---

### Fix 3: Booking Detail & Mutation IDOR and Privilege Escalation Prevention
- **Files Changed:** `src/app/api/bookings/[id]/route.ts`
- **Reason for Change:** Any company admin could previously read, cancel, confirm payment on, or reactivate any customer's booking across the entire system.
- **Remediation Details:**
  - In GET: Allowed access only if caller is the owner (`booking.userId === session.user.id`), `SUPER_ADMIN`, or operating bus company admin (`booking.trip.bus?.companyId === session.user.companyId`).
  - In PATCH: Restricted staff actions (`REQUEST_PROOF`, `REACTIVATE`, status `PAID`, status `BOARDED`) to `SUPER_ADMIN` or operating bus company admin. Prevented regular customers or unrelated company admins from performing unauthorized mutations.
- **Regression Tests Added:** `BOOKING_IDOR` and `BOOKING_PRIV_ESC` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (403 on cross-customer modification, 403 on customer self-confirming PAID, 403 on unrelated company admin, 200 on owner passenger update).

---

### Fix 4: Server-Side Protection Layout for `/bookings/**`
- **Files Changed:**
  - `src/app/bookings/layout.tsx` (new)
  - `src/app/bookings/[id]/print/page.tsx`
  - `src/app/bookings/[id]/page.tsx`
  - `src/app/company/bookings/[id]/print/page.tsx`
- **Reason for Change:** Protect private user pages from rendering in Incognito windows and redirect unauthenticated browsers immediately to `/login`.
- **Remediation Details:**
  - Created server component layout `src/app/bookings/layout.tsx` that inspects `auth()` and issues a server-side redirect to `/login` for unauthenticated sessions.
  - Added defensive 401/403 redirect handling in client pages (`/login` on 401, `/bookings` on 403).
- **Regression Tests Added:** `PAGE_AUTH` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (anonymous visit to `/bookings/[id]/print` receives redirect meta tag / location `/login`).

---

### Fix 5: Multi-Tenant Boundary Enforcement in Booking Listings
- **Files Changed:** `src/app/api/bookings/route.ts`
- **Reason for Change:** Prevent company admins querying `?type=customer` from viewing all platform customer bookings when `companyId` query parameter was missing or altered.
- **Remediation Details:**
  - Strictly bound `where.trip = { bus: { companyId: session.user.companyId } }` for `COMPANY_ADMIN`.
  - Required non-null `session.user.companyId` for company admins.
- **Regression Tests Added:** `LIST_ISOLATION` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (Customer receives only their bookings; Company Admin receives only company bus bookings).

---

### Fix 6: Multi-Tenant Isolation in Booking Export
- **Files Changed:** `src/app/api/bookings/export/route.ts`
- **Reason for Change:** Prevent cross-company data leakage and missing tenant validation during daily CSV exports.
- **Remediation Details:**
  - Required non-null `session.user.companyId` for company admins.
  - Scoped customer bookings strictly to buses owned by the authenticated company.
  - Scoped company bookings to bookings made by the company OR on buses operated by the company.
- **Regression Tests Added:** Integration validation in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED.

---

### Fix 7: Multi-Tenant Isolation in Customer Management
- **Files Changed:** `src/app/api/customers/route.ts`
- **Reason for Change:** Prevent company admins without a linked company from querying all customer records platform-wide.
- **Remediation Details:**
  - Added guard: `if (session.user.role === 'COMPANY_ADMIN' && !session.user.companyId) return 400 'No company linked'`.
- **Regression Tests Added:** `TENANT_ISOLATION` scenario in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (400 returned when companyId is null).

---

### Fix 8: Multi-Tenant Isolation in Analytics
- **Files Changed:** `src/app/api/analytics/route.ts`
- **Reason for Change:** Prevent unlinked company admins from querying platform-wide analytics.
- **Remediation Details:**
  - Added guard requiring `session.user.companyId` for `COMPANY_ADMIN` before querying financial analytics.
- **Regression Tests Added:** Verified via code inspection and build validation.
- **Test Result:** PASSED.

---

### Fix 9: FAQ Mutation Privilege Escalation
- **Files Changed:**
  - `src/app/api/faqs/route.ts`
  - `src/app/api/faqs/[id]/route.ts`
  - `src/app/api/faqs/[id]/reorder/route.ts`
  - `src/app/api/faqs/seed/route.ts`
- **Reason for Change:** Company admins were previously able to create, update, reorder, seed, and delete public website FAQs.
- **Remediation Details:**
  - Changed authorization check to `session.user.role !== 'SUPER_ADMIN'` (returns 403 Forbidden).
- **Regression Tests Added:** `FAQ_PRIV_ESC` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (403 on Customer and Company Admin FAQ creations).

---

### Fix 10: Trip Counts Information Disclosure
- **Files Changed:** `src/app/api/trips/counts/route.ts`
- **Reason for Change:** Endpoint disclosed platform-wide scheduled/completed/cancelled trip counts to regular customers.
- **Remediation Details:**
  - Added role check: `if (session.user.role !== 'SUPER_ADMIN') return 403`.
- **Regression Tests Added:** `TRIP_COUNTS` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED (401 on anon, 403 on customer, 403 on company admin, 200 on superadmin).

---

### Fix 11: Super Admin Account Protection
- **Files Changed:** `src/app/api/admin/users/[id]/route.ts`
- **Reason for Change:** Guard against company admin attempting to edit Super Admin accounts.
- **Remediation Details:**
  - Added check: `if (session.user.role === 'COMPANY_ADMIN') { if (!session.user.companyId || user.companyId !== session.user.companyId || user.role === 'SUPER_ADMIN') return 403 }`.
- **Regression Tests Added:** Verified via static analysis and typecheck.
- **Test Result:** PASSED.

---

### Fix 12: Public Station Trips Query Hardening
- **Files Changed:** `src/app/api/stations/[id]/trips/route.ts`
- **Reason for Change:** Prevent public visitors from seeing cancelled, departed, or private corporate charter trips.
- **Remediation Details:**
  - Filtered parent trip relation to: `trip: { status: 'SCHEDULED', departure: { gte: new Date() }, bookingMode: 'SEAT', reservedByCompanyId: null }`.
- **Regression Tests Added:** Verified via `npx tsc --noEmit` and build.
- **Test Result:** PASSED.

---

### Fix 13: Profile Password Policy Enforcement & Bcrypt Cost Upgrade
- **Files Changed:** `src/app/api/profile/route.ts`
- **Reason for Change:** Prevent weak passwords in profile updates and standardize password hashing cost to 12 rounds.
- **Remediation Details:**
  - Added check: `if (typeof newPassword !== 'string' || newPassword.length < 6) return 400`.
  - Upgraded bcrypt salt rounds from 10 to 12.
- **Regression Tests Added:** `PASSWORD_POLICY` scenarios in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED.

---

### Fix 14: Client Error Logging Rate Limiting & Field Truncation
- **Files Changed:** `src/app/api/log-error/route.ts`
- **Reason for Change:** Protect client error logging endpoint against log flooding and resource exhaustion.
- **Remediation Details:**
  - Applied `rateLimitRequest(req, 'client-log-error', 30, 60_000)`.
  - Truncated `message` (500 chars), `stack` (1000 chars), and `url` (300 chars).
- **Regression Tests Added:** `LOG_ERROR` scenario in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED.

---

### Fix 15: Company Info Customer Role Guard
- **Files Changed:** `src/app/api/company/info/route.ts`
- **Reason for Change:** Prevent regular customers from reading internal company seat quotas and settings.
- **Remediation Details:**
  - Added explicit check: `if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })`.
- **Regression Tests Added:** `COMPANY_INFO` scenario in `scripts/verify-security-suite.ts`.
- **Test Result:** PASSED.

---

## Run #5 Remediations (Fixes 16–30)

All verified with live HTTP against the running dev server (suite areas A18–A26) and/or
the independent probe `.scratch/verify-run5/probe.ts` (39/39). Suite: **136/136 PASSED ×2
consecutive runs.** All changes uncommitted on `fix/seatmap-mobile`.

### Fix 16: Conditional Claim on Concurrent Company-Booking EDIT (money movement)
- **Files Changed:** `src/app/api/admin/company-bookings/[id]/route.ts`
- **Reason for Change:** Run #4 residual #1. Two concurrent `EDIT` seat-changes could both read the same old seat, both compute the same price difference and both charge/refund it — the ledger key `edit-refund:${id}:${Date.now()}` was unique per call, so it could never dedupe.
- **Remediation Details:**
  - The row update is now the claim: `updateMany({ where: { id, seatLabel: <as-read>, total: <as-read>, status: <as-read> } })` runs **before** any money moves; `count === 0` → 409 `BOOKING_CHANGED`.
  - Deterministic ledger key `edit-refund:${id}:${old}->${new}` (the claim guarantees one winner).
  - Post-claim re-read guarded against null.
- **Regression Tests Added:** AREA 26 `EDIT_RACE` (concurrent edits → only 200/409 outcomes, exactly one refund ledger row, money adjusted once, stale-predicate check matches 0 rows, fresh-predicate check matches 1).
- **Test Result:** PASSED. Note (documented): SQLite serialises interactive transactions, so the stale-read 409 itself is not observable over HTTP here; the claim's `WHERE` predicate is asserted directly instead.

### Fix 17: Conditional Claim on Customer Refund Processing
- **Files Changed:** `src/app/api/admin/cancellations/[id]/route.ts`
- **Reason for Change:** Two administrators processing the same customer refund concurrently could both stamp `refundProcessedAt` — a double-processing window on a money action.
- **Remediation Details:**
  - `updateMany({ where: { id, status: 'CANCELLED', refundProcessedAt: null } })` claim; loser → 409 `Already processed`.
  - Null-guard after the claim so a row disappearing between claim and read is answered 409, not a TypeError.
- **Regression Tests Added:** AREA 18 `REFUND_RACE` (concurrent pair → exactly one 200, loser 409, stamp exactly once, third attempt refused) + probe AREA 5 (independent fixture, same race).
- **Test Result:** PASSED (observed `409,200`).

### Fix 18: Cross-Table & Degenerate-Segment Seat Conflicts
- **Files Changed:** `src/lib/seat-availability.ts`, `src/app/api/seats/hold/route.ts`, `src/app/api/bookings/route.ts`, `src/app/api/company/bookings/route.ts`
- **Reason for Change:** The overlap test never matched `(1,1)` segments (trips with no stops) and did not consult `CompanyBooking` / `SeatHold` rows — one seat could be sold to a customer *and* a company, or booked straight through another customer's live hold.
- **Remediation Details:**
  - `segmentOverlap()` handles degenerate segments; `excludeHoldId` so a checkout consumes its own hold; company bookings and holds are checked as conflicts on every booking path.
- **Regression Tests Added:** AREA 19 (`SEAT_HOLD`, `CROSS_TABLE`, `DEGENERATE_SEG`, `HOLD_COMPANY_BLOCK`, plus a positive control proving a free seat still books) + probe AREA 6.
- **Test Result:** PASSED (409 `SEAT_TAKEN` on every conflict; 200 on the control).

### Fix 19: Seat-Hold Authentication, Per-User Cap and Rate Limit
- **Files Changed:** `src/app/api/seats/hold/route.ts`
- **Reason for Change:** Anonymous hold requests were accepted, and one account could reserve every seat for two minutes at a time with no throttle.
- **Remediation Details:**
  - Anonymous → 401; 10 active holds per user; `seat-hold` bucket 30 requests/60 s returning `Retry-After`.
- **Regression Tests Added:** AREA 19 (anon 401; 12-seat flood → 429 with `Retry-After`; active holds per user ≤ 10).
- **Test Result:** PASSED.

### Fix 20: FAQ Drafts Behind `?all=1`
- **Files Changed:** `src/app/api/faqs/route.ts`
- **Reason for Change:** `GET /api/faqs?all=1` returned inactive (draft) FAQs to anonymous callers — content disclosure of unpublished copy.
- **Remediation Details:** `?all=1` requires `SUPER_ADMIN`; the default public view is unchanged.
- **Regression Tests Added:** AREA 22 (anon `?all=1` excludes drafts, super admin sees them, default view excludes them) + probe AREA 4 (counts inactive FAQs in the DB vs both responses).
- **Test Result:** PASSED.

### Fix 21: Registration Validation, Throttling and Case-Insensitive Duplicates
- **Files Changed:** `src/app/api/register/route.ts`, `src/app/api/register/company/route.ts`
- **Reason for Change:** No input validation (500-character names, malformed emails, 3-character passwords), a case-sensitive duplicate-email check (`Admin@x.com` could sit beside `admin@x.com`), and no rate limit on either endpoint.
- **Remediation Details:**
  - Field validation (email format, password length, name length) → 400.
  - Case-insensitive duplicate check via `SELECT id FROM User WHERE LOWER(email) = ${mailbox}` (portable across SQLite and MySQL — Prisma's `mode: 'insensitive'` is unavailable on this datasource), with the unique index as race backstop (P2002).
  - Rate buckets: `register-company` 10/15 min, `register-customer` 20/15 min, charged before the body is read.
- **Regression Tests Added:** AREA 20 (six malformed/duplicate cases → 400 with `exists` where relevant; 11-request flood → 429).
- **Test Result:** PASSED (429 accepted as equivalent evidence on re-runs when the bucket is already spent — documented inline).

### Fix 22: Payment-Proof Upload Access Control
- **Files Changed:** `src/lib/upload-access.ts` (new), `src/app/api/uploads/[file]/route.ts`, `src/app/api/uploads/payment-proof/route.ts`
- **Reason for Change:** Run #4 residual #4 — any file under `/api/uploads/*` was world-readable to anyone holding the URL.
- **Remediation Details:**
  - DB-backed classification: a file referenced by a proof column (`Booking.paymentProofUrl`, `CompanyBooking.paymentProofUrl`, `DepositRequest.attachmentUrl`) is **private** — readable only by its owner, the owning company's admin, or a super admin; destination photos and avatars stay **public** (the public pages depend on them).
  - Private reads send `Cache-Control: no-store`; denials are JSON with no image bytes.
  - Upload of payment proofs requires a session.
- **Regression Tests Added:** AREA 21 `UPLOAD_AUTHZ` (anon upload 401; anon/other-customer GET 401/403; owner 200 + `no-store`; super admin 200; public destination image still 200) + probe AREA 3 (independent upload, body-leak check on denials).
- **Test Result:** PASSED.

### Fix 23: Signed Upload Links
- **Files Changed:** `src/app/api/uploads/sign/route.ts` (new), `src/lib/upload-access.ts`
- **Reason for Change:** Payment proofs must be shareable with a reviewer/accountant without a session, so a short-lived link mechanism was needed to replace "anyone with the URL".
- **Remediation Details:**
  - `POST /api/uploads/sign { file }` mints `?exp=&sig=` only for callers who may already read the file (anon → 401, other user → 403).
  - HMAC-SHA256 over `file|exp` with `AUTH_SECRET`, constant-time compare, TTL-limited; expired or mismatched signatures fall back to session auth (anonymous → 401).
- **Regression Tests Added:** AREA 21 `UPLOAD_SIGN` (mint matrix + fresh link works anonymously + expired/tampered/garbage signature → 401) + probe AREA 3.
- **Test Result:** PASSED.

### Fix 24: Shared Money-Input Rule on All Financial Endpoints
- **Files Changed:** `src/lib/validations.ts` (`parseMoneyAmount`), `src/app/api/company/deposit-requests/route.ts`, `src/app/api/company/wallet/route.ts`, `src/app/api/admin/platform-wallet/route.ts`, `src/app/api/admin/platform-wallet/adjust/route.ts`, `src/app/api/admin/companies/[id]/credit-limit/route.ts`
- **Reason for Change:** Financial endpoints accepted numeric strings (`"100"`), `Infinity` (`1e309` in JSON), 3+ decimals, negatives, and unbounded magnitudes; the platform adjustment had **no** magnitude cap at all and used raw `Number(amount)`.
- **Remediation Details:**
  - `parseMoneyAmount()`: must be a number, finite, ≥ 0.01, ≤ `MONEY_AMOUNT_MAX` (1,000,000 EGP — inherited from the existing piastres cap, not a new business rule), exactly 2 decimals; `{ allowNegative: true }` for signed platform adjustments (same bounds otherwise).
  - `creditLimitSchema` gains `.finite()` — deliberately **no ceiling** (business decision, options documented in the report §6).
- **Regression Tests Added:** AREA 23 `MONEY_BOUNDS` (7 negative cases + 4 positive controls proving no false denial) + probe AREA 7.
- **Test Result:** PASSED.

### Fix 25: No Internal Error Messages in Response Bodies
- **Files Changed:** `src/app/api/admin/deposit-requests/[id]/route.ts`, `src/app/api/admin/companies/[id]/credit-limit/route.ts`, `src/app/api/company/bookings/route.ts`, `src/app/api/company/bookings/[id]/route.ts`, `src/app/api/admin/company-bookings/[id]/route.ts`
- **Reason for Change:** `err.message` was returned as the response body on multiple routes — any internal failure (driver text, Prisma hints) became an answer for the caller; several caller mistakes surfaced as HTTP 500.
- **Remediation Details:**
  - Known conditions mapped: unknown trip → 404, unknown company/deposit → 404, invalid/reversed stations → 400; everything else → generic `{ error: 'Server error' }` with `console.error` server-side.
- **Regression Tests Added:** AREA 23 `ERROR_MAPPING`, AREA 24 (`TRIP_404`, unknown deposit → 404) + probe AREA 8 (leak scans for `prisma|stack|query` in bodies).
- **Test Result:** PASSED.

### Fix 26: `ATTACH_PROOF` URL Allowlist
- **Files Changed:** `src/app/api/admin/company-bookings/[id]/route.ts`
- **Reason for Change:** The admin endpoint wrote **any string** it was handed into `paymentProofUrl`; every page rendering the proof would then fetch an attacker-chosen origin while the reviewer looks at it (stored-XSS-adjacent).
- **Remediation Details:** `PROOF_RE = /^\/api\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i` — the same pattern as the two customer-facing proof paths; non-matching → 400.
- **Regression Tests Added:** AREA 24 `PROOF_URL` (external URL → 400, `javascript:` URL → 400, our own upload path → 200 and stored; fixture restored afterwards).
- **Test Result:** PASSED.

### Fix 27: Stored Deposit Amount Sanity Check at Approval
- **Files Changed:** `src/app/api/admin/deposit-requests/[id]/route.ts`
- **Reason for Change:** The approval path trusted the stored amount — a row predating the write-path validation (or edited out-of-band) holding `NaN`/negative could be credited to the ledger.
- **Remediation Details:** Inside the transaction: non-finite or `≤ 0` → `BAD_STORED_AMOUNT` (logged server-side) → generic 500, transaction rolled back, request stays `PENDING`.
- **Regression Tests Added:** AREA 24 `BAD_AMOUNT_GUARD` (corrupted row → generic 500 with no amount echo, row still PENDING; fixture deleted afterwards).
- **Test Result:** PASSED.

### Fix 28: Middleware Fails Closed in Production Without `AUTH_SECRET`
- **Files Changed:** `src/middleware.ts`
- **Reason for Change:** `hasValidSessionCookie` returned `true` when `AUTH_SECRET` was missing — a broken deployment would treat every cookie as valid instead of refusing.
- **Remediation Details:** No secret → fail **closed** in production (redirect to login), fail **open** in development (a developer without the variable is not locked out; the layout's `auth()` remains authoritative either way).
- **Regression Tests Added:** Probe AREA 1 — direct `middleware(new NextRequest(...))` invocation with the secret deleted: production + garbage cookie → 307 `/login`; development → 200; production + valid signed cookie → 200 (no lockout); production + forged cookie with secret present → 307; no cookie → 307. (The one behaviour unreachable over HTTP, exercised at the function boundary.)
- **Test Result:** PASSED (6/6).

### Fix 29: Login Timing Equalization (Account-Existence Oracle)
- **Files Changed:** `src/lib/auth.ts`
- **Reason for Change:** Unknown email → `return null` skipped the bcrypt compare, so "no such user" answered measurably faster than "wrong password" — enough signal to enumerate registered addresses against the login form.
- **Remediation Details:** `DUMMY_PASSWORD_HASH` (a real bcrypt-12 digest of a non-credential constant) is compared when the user is not found, spending the same work as a genuine check; nothing compares equal to it.
- **Regression Tests Added:** Source-verified only — live measurement needs a running login flow with many samples (documented limitation, report §5/§6).
- **Test Result:** Static verification; `tsc` + build clean.

### Fix 30: Test/Verification Infrastructure for Run #5
- **Files Changed:** `scripts/verify-security-suite.ts`, `scripts/route-matrix.ts`, `.scratch/verify-run5/probe.ts`
- **Reason for Change:** Every Run #5 fix needed reproducible, re-runnable evidence, and two Run #4 caveats had to be closed.
- **Remediation Details:**
  - Areas A18–A26 (68 → 136 assertions); idempotent fixtures (bus/layout/stations/trips/company/admin/holds/bookings/refunds, `createdAt` refreshed where policy windows measure from it); manual multipart helper; raw-JSON body support (`1e309` → `Infinity`); **future-dated station-trip fixture** closing Run #4's vacuity caveat.
  - Independent probe extended to 39 assertions including direct middleware invocation.
  - Route matrix regenerated for **90** route files (new `api/uploads/sign`).
- **Regression Tests Added:** n/a (this *is* the test infrastructure).
- **Test Result:** 136/136 ×2 consecutive suite runs; probe 39/39; `tsc` 0; lint clean; production build success.
