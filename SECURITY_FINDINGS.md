# SAFROTRAVEL — SECURITY FINDINGS REGISTER

**Last Updated:** 2026-11-13 (Run #5)  
**Audit Scope:** Full Application Source Code Audit, API Endpoints, Server Actions, Route Handlers, Role-Based Access Control, IDOR, Multi-Tenant Data Isolation, Financial Ledger Consistency, and Authentication/Authorization Architecture.

---

## Findings Summary by Severity

| Severity | Total Discovered | Resolved / Fixed | Unresolved | Status |
| :--- | :---: | :---: | :---: | :---: |
| **CRITICAL** | 2 | 2 | 0 | **RESOLVED** |
| **HIGH** | 6 | 5 | 1 | **1 OPEN — FINDING-026 (deployment key)** |
| **MEDIUM** | 11 | 11 | 0 | **RESOLVED** |
| **LOW** | 9 | 9 | 0 | **RESOLVED** |
| **TOTAL** | **28** | **27** | **1** | **ALL CODE FIXES VERIFIED; 1 OPERATIONAL FINDING OPEN** |

FINDING-001…014 are the original register (verified fixed in Runs #4/#5).
FINDING-015…028 were discovered by the Run #5 re-audit; 13 are fixed and regression-tested,
1 (FINDING-026) is documented but deliberately not fixed in this engagement.

---

## Detailed Findings Register

### FINDING-001 [CRITICAL]: Unauthenticated Ticket Disclosure & IDOR on Customer Ticket Endpoint
- **Severity:** CRITICAL
- **CWE:** CWE-306 (Missing Authentication for Critical Function), CWE-639 (Authorization Bypass Through User-Controlled Key / IDOR)
- **Affected Route:** `GET /api/bookings/[id]/ticket`
- **Affected Files:**
  - `src/app/api/bookings/[id]/ticket/route.ts`
  - `src/app/bookings/[id]/print/page.tsx`
  - `src/app/bookings/[id]/page.tsx`
- **Reported Incident:** `https://safrotravel.com/bookings/cmwc7iqde000b3rv3o85cso73/print` opened in an Incognito window without authentication and revealed full customer details.
- **Root Cause:**
  `src/app/api/bookings/[id]/ticket/route.ts` imported `@/lib/auth` as a side-effect (`import '@/lib/auth'`) without calling `auth()`. The route returned 200 OK with full ticket details, passenger name, contact phone, reference, stops, and QR code to unauthenticated callers. Furthermore, no ownership or role check was performed, allowing cross-user data scraping.
- **Remediation:**
  1. Enforced session check via `const session = await auth()`; returns 401 Unauthorized for unauthenticated callers.
  2. Implemented strict authorization matrix:
     - Customer can only access their own booking (`booking.userId === session.user.id`).
     - Company Admin can only access bookings on buses operated by their company (`booking.trip.bus.companyId === session.user.companyId`).
     - Super Admin can access all tickets.
     - All other callers receive 403 Forbidden.
  3. Added server-side layout (`src/app/bookings/layout.tsx`) that redirects unauthenticated visitors to `/login`.
- **Status:** **RESOLVED**
- **Verification:** Automated tests verify 401 for anonymous callers, 403 for Customer B accessing Customer A's ticket, and 200 for owner and Super Admin.

---

### FINDING-002 [CRITICAL]: Unauthenticated Ticket Disclosure & Cross-Tenant IDOR on Company Ticket Endpoint
- **Severity:** CRITICAL
- **CWE:** CWE-306 (Missing Authentication), CWE-639 (Authorization Bypass Through User-Controlled Key)
- **Affected Route:** `GET /api/company/bookings/[id]/ticket`
- **Affected Files:**
  - `src/app/api/company/bookings/[id]/ticket/route.ts`
  - `src/app/company/bookings/[id]/print/page.tsx`
- **Root Cause:**
  `src/app/api/company/bookings/[id]/ticket/route.ts` lacked `auth()` verification. Anyone with a company booking ID could view corporate client tickets, passenger names, phone numbers, notes, hotel details, collection amounts, and corporate logos without signing in. Company A could also access Company B's tickets.
- **Remediation:**
  1. Enforced session check via `auth()`; returns 401 for anonymous callers.
  2. Blocked role `CUSTOMER` (returns 403 Forbidden).
  3. Enforced tenant boundary: `booking.companyId === session.user.companyId` for `COMPANY_ADMIN`.
  4. Allowed `SUPER_ADMIN` access.
- **Status:** **RESOLVED**
- **Verification:** Automated tests verify 401 for anonymous callers, 403 for individual customers, 403 for cross-company access (Company B -> Company A), and 200 for owning company admin and Super Admin.

---

### FINDING-003 [HIGH]: Broken Object Level Authorization & Privilege Escalation in Booking Operations
- **Severity:** HIGH
- **CWE:** CWE-639 (Insecure Direct Object Reference), CWE-285 (Improper Authorization)
- **Affected Route:** `GET /api/bookings/[id]`, `PATCH /api/bookings/[id]`
- **Affected File:** `src/app/api/bookings/[id]/route.ts`
- **Root Cause:**
  The check `if (booking.userId !== session.user.id && session.user.role !== 'COMPANY_ADMIN' && session.user.role !== 'SUPER_ADMIN')` allowed ANY `COMPANY_ADMIN` to read and mutate (mark PAID, reactivate, cancel, update passenger info) ANY customer booking across the entire system, regardless of whether their company operated the bus.
- **Remediation:**
  1. In GET: Allowed access only if caller is the owner (`booking.userId === session.user.id`), `SUPER_ADMIN`, or the company operating that trip's bus (`session.user.role === 'COMPANY_ADMIN' && booking.trip.bus?.companyId === session.user.companyId`).
  2. In PATCH: Defined strict role capabilities:
     - Customer can only submit proof, update passenger details, or cancel their own booking.
     - Customers CANNOT mark status as `PAID`, `BOARDED`, or trigger admin actions (`REQUEST_PROOF`, `REACTIVATE`).
     - Only `SUPER_ADMIN` or the operating company's admin can confirm payments, request proof, reactivate, or mark boarded.
     - Unrelated company admins receive 403 Forbidden.
- **Status:** **RESOLVED**
- **Verification:** Automated tests verify Customer B gets 403 modifying Customer A's booking, Customer A gets 403 attempting to mark status to PAID, Company B admin gets 403 attempting to confirm Customer A's booking, and Customer A gets 200 updating their own passenger details.

---

### FINDING-004 [HIGH]: Missing Server-Side Route Guard for Private `/bookings/**` Pages
- **Severity:** HIGH
- **CWE:** CWE-284 (Improper Access Control)
- **Affected Routes:**
  - `/bookings`
  - `/bookings/[id]`
  - `/bookings/[id]/print`
  - `/bookings/[id]/pay`
- **Affected Files:**
  - `src/app/bookings/layout.tsx` (new)
  - `src/app/bookings/[id]/print/page.tsx`
  - `src/app/bookings/[id]/page.tsx`
- **Root Cause:**
  Unlike `/company` and `/admin`, the `/bookings` directory lacked a server-side layout. Unauthenticated browser visits loaded the full client component JavaScript bundle and executed client-side fetch requests before redirecting.
- **Remediation:**
  Created server-side `src/app/bookings/layout.tsx` that calls `await auth()` and issues a server-side HTTP 307 redirect to `/login` if unauthenticated.
- **Status:** **RESOLVED**
- **Verification:** Direct HTTP GET `/bookings/[id]/print` returns 307 redirect to `/login`.

---

### FINDING-005 [HIGH]: Multi-Tenant Isolation Weakness in Booking Listing API
- **Severity:** HIGH
- **CWE:** CWE-284 (Improper Access Control / Multi-Tenant Isolation)
- **Affected Route:** `GET /api/bookings`
- **Affected File:** `src/app/api/bookings/route.ts`
- **Root Cause:**
  When a `COMPANY_ADMIN` supplied `?type=customer`, the route bypassed the company booking block and evaluated:
  `if (session.user.role === 'CUSTOMER') where.userId = ... else if (companyId) where.trip = ...`
  If the `companyId` query parameter was omitted or altered, `where` defaulted to unconstrained `{}` or trusted the client query parameter, leaking customer bookings platform-wide.
- **Remediation:**
  For `COMPANY_ADMIN`, strictly enforced `session.user.companyId` from the session token:
  `where.trip = { bus: { companyId: session.user.companyId } }`.
  Rejected company admins without a linked company with 400.
- **Status:** **RESOLVED**
- **Verification:** Automated test verified `GET /api/bookings` with customer session returns only bookings owned by that customer, and company admin requests are strictly scoped.

---

### FINDING-006 [HIGH]: Cross-Tenant Data Leak in Booking Export Endpoint
- **Severity:** HIGH
- **CWE:** CWE-284 (Improper Access Control)
- **Affected Route:** `GET /api/bookings/export`
- **Affected File:** `src/app/api/bookings/export/route.ts`
- **Root Cause:**
  Export filtered by `trip.bus.companyId === session.user.companyId` for both customer and company bookings. This caused two flaws:
  1. If `companyId` was null on the session, no filter was applied, exporting all platform bookings.
  2. For company bookings, filtering by bus owner rather than booking owner exposed Company B's passenger manifest to Company A if Company A operated the bus, while preventing Company B from exporting their own corporate bookings on third-party buses.
- **Remediation:**
  1. Enforced `session.user.companyId` validation (rejects with 400 if null).
  2. Scoped `companyWhere` to bookings where `companyId === session.user.companyId OR trip.bus.companyId === session.user.companyId`.
  3. Scoped `customerWhere` strictly to buses owned by the authenticated company.
- **Status:** **RESOLVED**
- **Verification:** Verified that unlinked company admins cannot export, and tenant boundaries are strictly respected.

---

### FINDING-007 [MEDIUM]: Cross-Tenant Data Exposure on Customers List Endpoint
- **Severity:** MEDIUM
- **CWE:** CWE-284 (Improper Access Control)
- **Affected Route:** `GET /api/customers`
- **Affected File:** `src/app/api/customers/route.ts`
- **Root Cause:**
  `const companyId = session.user.role === 'COMPANY_ADMIN' ? session.user.companyId ?? undefined : undefined`.
  If a user with role `COMPANY_ADMIN` had null `companyId`, `where` became `{ role: 'CUSTOMER' }`, dumping all customers across all tenants.
- **Remediation:**
  Added guard: `if (session.user.role === 'COMPANY_ADMIN' && !session.user.companyId) return 400 'No company linked'`.
- **Status:** **RESOLVED**
- **Verification:** Automated test confirms company admin with null `companyId` receives 400.

---

### FINDING-008 [MEDIUM]: Global FAQ Content Mutation Privilege Escalation
- **Severity:** MEDIUM
- **CWE:** CWE-285 (Improper Authorization)
- **Affected Routes:**
  - `POST /api/faqs`
  - `PATCH /api/faqs/[id]`
  - `DELETE /api/faqs/[id]`
  - `PATCH /api/faqs/[id]/reorder`
  - `POST /api/faqs/seed`
- **Affected Files:**
  - `src/app/api/faqs/route.ts`
  - `src/app/api/faqs/[id]/route.ts`
  - `src/app/api/faqs/[id]/reorder/route.ts`
  - `src/app/api/faqs/seed/route.ts`
- **Root Cause:**
  Routes used `if (!session?.user || session.user.role === 'CUSTOMER') return 403`. This inadvertently allowed `COMPANY_ADMIN` accounts to create, modify, reorder, and delete global public website FAQs.
- **Remediation:**
  Restricted all mutations to `session.user.role === 'SUPER_ADMIN'`.
- **Status:** **RESOLVED**
- **Verification:** Automated tests verify Customers and Company Admins receive 403 on FAQ creation and mutation.

---

### FINDING-009 [MEDIUM]: Information Disclosure via Trip Metrics Endpoint
- **Severity:** MEDIUM
- **CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
- **Affected Route:** `GET /api/trips/counts`
- **Affected File:** `src/app/api/trips/counts/route.ts`
- **Root Cause:**
  Endpoint returned platform-wide trip counts (scheduled, completed, cancelled) to any signed-in user, including regular customers.
- **Remediation:**
  Added role check: `if (session.user.role !== 'SUPER_ADMIN') return 403`.
- **Status:** **RESOLVED**
- **Verification:** Automated tests verify anonymous callers get 401, Customers get 403, Company Admins get 403, and Super Admin gets 200.

---

### FINDING-010 [LOW]: Super Admin Account Mutation by Company Admin
- **Severity:** LOW
- **CWE:** CWE-285 (Improper Authorization)
- **Affected Route:** `PUT /api/admin/users/[id]`
- **Affected File:** `src/app/api/admin/users/[id]/route.ts`
- **Root Cause:**
  Defense-in-depth weakness: did not explicitly guard against `user.role === 'SUPER_ADMIN'` in the `COMPANY_ADMIN` authorization branch.
- **Remediation:**
  Explicitly verified: `if (session.user.role === 'COMPANY_ADMIN') { if (!session.user.companyId || user.companyId !== session.user.companyId || user.role === 'SUPER_ADMIN') return 403 }`.
- **Status:** **RESOLVED**
- **Verification:** Verified by code inspection and typecheck.

---

### FINDING-011 [LOW]: Stale / Cancelled / Charter Trip Disclosure on Public Station Endpoint
- **Severity:** LOW
- **CWE:** CWE-200 (Exposure of Sensitive Information)
- **Affected Route:** `GET /api/stations/[id]/trips`
- **Affected File:** `src/app/api/stations/[id]/trips/route.ts`
- **Root Cause:**
  The endpoint fetched all `tripStop` records for the station without filtering the parent `trip` status or booking mode. This resulted in cancelled trips, departed trips, and private charter trips reserved for specific companies being returned to public visitors viewing station pages.
- **Remediation:**
  Added filters on parent trip relation: `trip: { status: 'SCHEDULED', departure: { gte: new Date() }, bookingMode: 'SEAT', reservedByCompanyId: null }`.
- **Status:** **RESOLVED**
- **Verification:** Verified by TypeScript typecheck and endpoint query inspection.

---

### FINDING-012 [LOW]: Inconsistent Password Length Enforcement & Hashing Cost in Profile
- **Severity:** LOW
- **CWE:** CWE-521 (Weak Password Requirements), CWE-916 (Use of Password Hash With Insufficient Computational Effort)
- **Affected Route:** `PUT /api/profile`
- **Affected File:** `src/app/api/profile/route.ts`
- **Root Cause:**
  Unlike registration and admin user provisioning which strictly enforce a 6-character minimum and 12-round bcrypt cost, `/api/profile` permitted short passwords and used 10-round bcrypt hashing.
- **Remediation:**
  Enforced `typeof newPassword === 'string' && newPassword.length >= 6` and upgraded bcrypt hashing cost to 12 rounds.
- **Status:** **RESOLVED**
- **Verification:** Automated regression test verifies password shorter than 6 characters returns 400.

---

### FINDING-013 [LOW]: Unrestricted Resource Consumption on Error Logging Endpoint
- **Severity:** LOW
- **CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
- **Affected Route:** `POST /api/log-error`
- **Affected File:** `src/app/api/log-error/route.ts`
- **Root Cause:**
  The client error logging route had no rate limiting or payload field size truncation, permitting log flooding.
- **Remediation:**
  Applied `rateLimitRequest(req, 'client-log-error', 30, 60_000)` and bounded string field lengths (`message`, `stack`, `url`).
- **Status:** **RESOLVED**
- **Verification:** Automated regression test verifies valid payloads log with 200 and rate limiting is active.

---

### FINDING-014 [LOW]: Missing Explicit Role Guard on Company Metadata Endpoint
- **Severity:** LOW
- **CWE:** CWE-285 (Improper Authorization)
- **Affected Route:** `GET /api/company/info`
- **Affected File:** `src/app/api/company/info/route.ts`
- **Root Cause:**
  The endpoint checked `!session?.user || !session.user.companyId`, but did not check `session.user.role !== 'CUSTOMER'`, potentially allowing a customer linked to a company to read internal company seat quotas and settings.
- **Remediation:**
  Added explicit role guard: `if (session.user.role === 'CUSTOMER') return 403 Forbidden`.
- **Status:** **RESOLVED**
- **Verification:** Automated regression test verifies customers are denied and company admins are allowed.

---

*The following findings were discovered by the Run #5 re-audit (2026-11-13).*

---

### FINDING-015 [HIGH]: Cross-Table Double Booking & Degenerate-Segment Overlap Bypass
- **Severity:** HIGH
- **CWE:** CWE-362 (Race Condition), CWE-841 (Improper Enforcement of Behavioral Workflow)
- **Affected Routes:** `POST /api/bookings`, `POST /api/company/bookings`, `POST/DELETE /api/seats/hold`
- **Affected Files:**
  - `src/lib/seat-availability.ts`
  - `src/app/api/bookings/route.ts`
  - `src/app/api/company/bookings/route.ts`
  - `src/app/api/seats/hold/route.ts`
- **Root Cause:**
  The seat-overlap predicate never matched degenerate segments (`fromStopOrder === toStopOrder`, produced by trips with no intermediate stops), and each booking path only consulted its own table. A seat could therefore be held by one customer while another customer or a company booked it, or a checkout could walk straight through another customer's live hold — a double sale of the same physical seat.
- **Remediation:**
  1. `segmentOverlap()` now handles degenerate segments correctly.
  2. Company bookings and `SeatHold` rows are checked as conflicts on every path; `excludeHoldId` lets a checkout consume its own hold.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 19 (cross-table customer-vs-company → 409 `SEAT_TAKEN`, customer-vs-hold → 409, company-vs-hold → 409, second booking on a no-stop trip → 409, plus a positive control proving a free seat still books with 200) and independent probe AREA 6.

---

### FINDING-016 [MEDIUM]: Unauthenticated and Unbounded Seat Holds
- **Severity:** MEDIUM
- **CWE:** CWE-770 (Allocation of Resources Without Limits), CWE-306 (Missing Authentication)
- **Affected Route:** `POST /api/seats/hold`
- **Affected File:** `src/app/api/seats/hold/route.ts`
- **Root Cause:**
  Hold requests were accepted without a session, with no per-user cap and no rate limit — one scripted account could reserve every seat on a trip for two minutes at a time, indefinitely (denial of service against legitimate buyers).
- **Remediation:**
  Anonymous requests → 401; maximum 10 active holds per user; `seat-hold` rate bucket (30 requests/60 s) returning `Retry-After`.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 19 (anonymous → 401; 12-seat flood → 429 with `Retry-After`; active holds per user ≤ 10).

---

### FINDING-017 [MEDIUM]: Payment-Proof Uploads Readable Without Authorization
- **Severity:** MEDIUM
- **CWE:** CWE-284 (Improper Access Control), CWE-200 (Exposure of Sensitive Information)
- **Affected Routes:** `GET /api/uploads/[...path]`, `GET /api/uploads/[file]`, `POST /api/uploads/payment-proof`
- **Affected Files:**
  - `src/lib/upload-access.ts` (new)
  - `src/app/api/uploads/[file]/route.ts`
  - `src/app/api/uploads/payment-proof/route.ts`
  - `src/app/api/uploads/sign/route.ts` (new)
- **Root Cause:**
  Any file under `/api/uploads/*` was served to anyone holding the URL. Payment proofs contain transfer references, amounts and payer details; the URLs were unguessable but appeared in logs, referrers and shared review workflows — possession of a link was the only "authorization".
- **Remediation:**
  1. DB-backed classification: files referenced by proof columns are private (owner, owning-company admin, super admin); destination photos and avatars stay public because the public pages depend on them. Private reads send `Cache-Control: no-store`.
  2. Signed links: `POST /api/uploads/sign` mints an HMAC-SHA256 `?exp=&sig=` URL only for callers who may already read the file; expired/tampered signatures fall back to session auth.
  3. Proof uploads require a session.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 21 (full authz matrix + mint/expired/tampered/garbage signatures + public image still 200) and independent probe AREA 3 (fresh independent upload; denial bodies carry no image bytes).
- **Residual note:** files no record references any more (orphans) fall back to public by design — see report §6.

---

### FINDING-018 [MEDIUM]: Registration Endpoints Unvalidated, Unthrottled and Case-Sensitive
- **Severity:** MEDIUM
- **CWE:** CWE-20 (Improper Input Validation), CWE-770 (Allocation of Resources Without Limits), CWE-178 (Case Sensitivity)
- **Affected Routes:** `POST /api/register`, `POST /api/register/company`
- **Affected Files:** `src/app/api/register/route.ts`, `src/app/api/register/company/route.ts`
- **Root Cause:**
  Neither endpoint validated input (500-character company names, malformed emails, 3-character passwords reached the database), the duplicate-email check was case-sensitive (`Admin@x.com` could coexist with `admin@x.com` — two accounts for one mailbox), and neither path had a rate limit: scripted signup floods were unthrottled.
- **Remediation:**
  1. Field validation → 400 on malformed email / short password / oversized name.
  2. Case-insensitive duplicate check via `SELECT id FROM User WHERE LOWER(email) = ${mailbox}` (works on SQLite and MySQL; Prisma's `mode: 'insensitive'` is unavailable on this datasource), unique index as race backstop.
  3. Rate buckets: `register-company` 10/15 min, `register-customer` 20/15 min, charged before the body is read.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 20 (six malformed/duplicate cases → 400 including both case-variant duplicates; 11-request flood → 429).

---

### FINDING-019 [MEDIUM]: Financial Inputs Accepted as Strings, Infinity or Unbounded Values
- **Severity:** MEDIUM
- **CWE:** CWE-20 (Improper Input Validation), CWE-682 (Incorrect Calculation)
- **Affected Routes:** `POST /api/company/deposit-requests`, `POST /api/company/wallet`, `POST /api/admin/platform-wallet`, `POST /api/admin/platform-wallet/adjust`, `POST /api/admin/companies/:id/credit-limit`
- **Affected Files:**
  - `src/lib/validations.ts` (`parseMoneyAmount`)
  - the five route files above
- **Root Cause:**
  Guards of the shape `!amount || amount <= 0` accepted the string `"100"` and let `Infinity` through (`1e309` parses to `Infinity` in JSON), allowed three-or-more decimal places, and the manual platform adjustment had **no magnitude cap at all** (`toPiastres(Number(amount))` — one super-admin request could write an unbounded ledger row).
- **Remediation:**
  One shared rule `parseMoneyAmount()`: number, finite, ≥ 0.01, ≤ 1,000,000 EGP (inherited from the existing piastres cap — not a new business limit), exactly 2 decimals; `{ allowNegative: true }` for signed platform adjustments with all other bounds. `creditLimitSchema` gained `.finite()`; its ceiling is a business decision documented in the report (options a–d), deliberately not invented.
- **Status:** **RESOLVED** (credit-limit ceiling: business decision documented, report §6)
- **Verification:** Suite AREA 23 (seven negative cases refused with 400 + four positive controls proving no false denial) and independent probe AREA 7.

---

### FINDING-020 [MEDIUM]: Internal Error Messages Echoed in Response Bodies
- **Severity:** MEDIUM
- **CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)
- **Affected Routes:** `PATCH /api/admin/deposit-requests/:id`, `POST /api/admin/companies/:id/credit-limit`, `POST/PATCH /api/company/bookings(/:id)`, `PATCH/DELETE /api/admin/company-bookings/:id`
- **Affected Files:** the five route files above
- **Root Cause:**
  Several catch blocks returned `err.message` (or `{ error: 'Server error', message: err.message }`) as the response body. Any internal failure — driver text, Prisma schema hints, connection details — was handed to the caller; caller mistakes (unknown trip, unknown company) surfaced as HTTP 500 instead of 404/400.
- **Remediation:**
  Known conditions mapped to proper statuses (unknown trip/company/deposit → 404, invalid stations → 400, reversed segment → 400); everything else → generic `{ error: 'Server error' }` with `console.error` server-side.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 23 `ERROR_MAPPING` + AREA 24 `TRIP_404`; independent probe AREA 8 scans response bodies for `prisma|stack|query` — none found.

---

### FINDING-021 [MEDIUM]: Middleware Session Check Fails Open in Production Without `AUTH_SECRET`
- **Severity:** MEDIUM
- **CWE:** CWE-306 (Missing Authentication), CWE-656 (Reliance on Security Through Obscurity)
- **Affected Route:** all private page trees (`/bookings/*`, `/company/*`, `/admin/*`)
- **Affected File:** `src/middleware.ts`
- **Root Cause:**
  `hasValidSessionCookie()` returned `true` when `process.env.AUTH_SECRET` was unset — a deployment missing the secret (already broken, since Auth.js cannot sign sessions) would treat **every** cookie, including garbage, as a valid session cookie and let unauthenticated requests start rendering private trees.
- **Remediation:**
  Fails **closed** in production (unverifiable cookie → redirect to `/login`); fails **open** in development so a developer without the variable is not locked out (the layout's `auth()` check remains authoritative in both cases).
- **Status:** **RESOLVED**
- **Verification:** Independent probe AREA 1 — direct `middleware()` invocation with the secret deleted: production + garbage cookie → 307 `/login`, development → 200, production + valid signed cookie → 200 (no lockout), production + forged cookie with secret present → 307, no cookie → 307 (6/6).

---

### FINDING-022 [LOW]: FAQ Drafts Readable Anonymously via `?all=1`
- **Severity:** LOW
- **CWE:** CWE-200 (Exposure of Sensitive Information)
- **Affected Route:** `GET /api/faqs?all=1`
- **Affected File:** `src/app/api/faqs/route.ts`
- **Root Cause:**
  The `all=1` query parameter, intended for the admin FAQ manager, was not gated — anonymous visitors could read unpublished/draft FAQ content.
- **Remediation:** `?all=1` requires `SUPER_ADMIN`; the default public view (active FAQs only) is unchanged.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 22 (anon `?all=1` excludes the inactive fixture, super admin sees it, default view excludes it) and independent probe AREA 4 (counts actual inactive rows vs both responses).

---

### FINDING-023 [LOW]: Login Timing Oracle Allows Account-Existence Enumeration
- **Severity:** LOW
- **CWE:** CWE-208 (Observable Timing Discrepancy), CWE-204 (Observable Response Discrepancy)
- **Affected Route:** `POST /api/auth/[...nextauth]` (credentials `authorize()`)
- **Affected File:** `src/lib/auth.ts`
- **Root Cause:**
  An unknown email returned `null` immediately, skipping the bcrypt comparison — "no such user" answered measurably faster than "wrong password", turning the login form into an account-existence oracle for scripted callers.
- **Remediation:**
  A fixed `DUMMY_PASSWORD_HASH` (a genuine bcrypt-12 digest of a non-credential constant; nothing compares equal to it) is compared when the user is not found, spending the same work as a real check.
- **Status:** **RESOLVED** (source-verified; a live statistical measurement needs a running login flow — report §5/§6)
- **Verification:** Static verification + `tsc --noEmit` + production build; not measured over HTTP in this run.

---

### FINDING-024 [LOW]: Admin `ATTACH_PROOF` Accepted Arbitrary URLs
- **Severity:** LOW
- **CWE:** CWE-918 (Server-Side Request Forgery / Stored Content Injection)
- **Affected Route:** `PATCH /api/admin/company-bookings/:id` (`action: ATTACH_PROOF`)
- **Affected File:** `src/app/api/admin/company-bookings/[id]/route.ts`
- **Root Cause:**
  The endpoint wrote any string it was handed into `paymentProofUrl`. Every page that renders the proof would then fetch an attacker-chosen origin (including `javascript:`-style values in older render paths) from the reviewer's browser while they review the payment.
- **Remediation:**
  `PROOF_RE = /^\/api\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i` — identical to the two customer-facing proof paths; non-matching → 400.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 24 `PROOF_URL` (external URL → 400, `javascript:` URL → 400, our own upload path → 200 and stored, fixture restored).

---

### FINDING-025 [LOW]: Unmapped Failures Answer with HTTP 500 (Invalid IDs, Reversed Segments)
- **Severity:** LOW
- **CWE:** CWE-755 (Improper Handling of Exceptional Conditions)
- **Affected Routes:** `POST /api/bookings`, `POST /api/company/bookings`, `PATCH /api/admin/deposit-requests/:id`
- **Affected Files:** `src/app/api/bookings/route.ts`, `src/app/api/company/bookings/route.ts`, `src/app/api/admin/deposit-requests/[id]/route.ts`
- **Root Cause:**
  Unknown `tripId`, back-to-front station ids and unknown deposit ids were thrown as generic errors and surfaced as HTTP 500 — noisy for operators and misleading for callers (observed in the server logs of every Run #4 suite run).
- **Remediation:**
  Unknown trip → 404 `Trip not found`; reversed/invalid stations → 400 with a mapped sentence; unknown deposit → 404; unknown company on credit-limit change → 404. Everything else stays generic.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 24 (404/400 assertions) and independent probe AREA 8.

---

### FINDING-026 [HIGH]: Hardcoded Deployment Key Shipped in the Migration Endpoint
- **Severity:** HIGH
- **CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-598 (Use of GET Request Method With Sensitive Query Strings)
- **Affected Files:**
  - `.github/workflows/deploy.yml` (calls `apply-migrations.php?key=safro_extract_2026&go=1`)
  - `scripts/apply-migrations.php` (`const DEPLOY_KEY = 'safro_extract_2026'`)
- **Root Cause:**
  The deploy workflow uploads a PHP script containing a **hard-coded key** to the public web root, invokes it with the key in the query string (query strings leak via logs, proxies, referrers and browser history), and removes it with `curl … || true` — deletion failure is ignored, so the endpoint may remain live and callable with a publicly known key. The key is also visible to anyone with repository access, in plaintext.
- **Remediation:**
  **Not fixed in this engagement** — changing the deployment pipeline and rotating the key are operational decisions outside the agreed scope (code fixes only). Recommended: move the key to a CI secret/runner environment, use a POST with the header instead of a query string, make the cleanup step fail the job if deletion fails, and rotate `safro_extract_2026` since it has been committed in plaintext.
- **Status:** **OPEN — documented, deliberately not fixed (report §6, §7)**
- **Verification:** Static finding (workflow + script read directly); no live probing of the production migration endpoint was performed.

---

### FINDING-027 [MEDIUM]: Concurrent Company-Booking EDIT Could Move Money Twice
- **Severity:** MEDIUM
- **CWE:** CWE-362 (Race Condition), CWE-841 (Improper Enforcement of Behavioral Workflow)
- **Affected Route:** `PATCH /api/admin/company-bookings/:id` (`action: EDIT`)
- **Affected File:** `src/app/api/admin/company-bookings/[id]/route.ts`
- **Root Cause:**
  The seat-change price adjustment (charge or refund of the difference) ran without any claim on the row: two concurrent EDITs reading the same old seat would each compute and each apply the same difference, and the ledger key `edit-refund:${id}:${Date.now()}` was unique per call, so it could never dedupe anything. (Carried over as Run #4 residual risk #1.)
- **Remediation:**
  The row update is now the claim — `updateMany({ where: { id, seatLabel: <as-read>, total: <as-read>, status: <as-read> } })` runs **before** any money moves; `count === 0` → 409 `BOOKING_CHANGED`. Ledger key made deterministic: `edit-refund:${id}:${old}->${new}`.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 26 `EDIT_RACE`: concurrent edits produce only 200/409 (never 5xx), **exactly one** refund ledger row, money adjusted once (300 → 200), plus a direct predicate check that a claim pinned to the pre-edit state matches 0 rows while the current state matches 1. Limitation documented: SQLite serialises interactive transactions, so the stale-read 409 cannot be produced over HTTP here (report §5).

---

### FINDING-028 [MEDIUM]: Concurrent Customer Refund Processing Could Stamp Twice
- **Severity:** MEDIUM
- **CWE:** CWE-362 (Race Condition), CWE-841 (Improper Enforcement of Behavioral Workflow)
- **Affected Route:** `PATCH /api/admin/cancellations/:id` (`type: customer`)
- **Affected File:** `src/app/api/admin/cancellations/[id]/route.ts`
- **Root Cause:**
  Refund processing read the booking, checked it was unprocessed, then stamped it unconditionally — two administrators clicking at the same time could both pass the check and both stamp `refundProcessedAt`, the exact pattern that turns a single refund into a double one on paths that move money.
- **Remediation:**
  Conditional claim `updateMany({ where: { id, status: 'CANCELLED', refundProcessedAt: null } })`; the database picks one winner, the loser gets 409; null-guard after the claim.
- **Status:** **RESOLVED**
- **Verification:** Suite AREA 18 `REFUND_RACE` (concurrent pair → exactly one 200, loser 409, stamp exactly once, third attempt refused) and independent probe AREA 5 with its own fixture (observed one winner both runs).
