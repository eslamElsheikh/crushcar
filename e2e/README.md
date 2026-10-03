# Safro V2 — End-to-End (E2E) Test Suite

Comprehensive automated test suite for Safro V2 travel platform covering Page Health, Golden Journeys, Worst-Case Scenarios, and Production Smoke verification.

---

## 1. Safety & Architecture Guardrails

- **Database Isolation:** All E2E tests strictly target dedicated scratch databases (e.g. `.scratch/e2e.db`, `.scratch/empty.db`, `.scratch/big.db`).
- **Safety Lock:** Scripts and fixtures enforce assertions preventing execution against `prisma/dev.db`.
- **Dedicated Port:** The E2E test server runs on port **3002** (`http://127.0.0.1:3002`), leaving default dev ports (3000, 3001) completely untouched.
- **Node Memory Allocation:** The test server starts with `--max-old-space-size=4096` to prevent heap exhaustion during Next.js App Router on-demand route compilation.

---

## 2. Scratch Database Seeding

The test suite provides three seeding modes via [`e2e/fixtures/seed.ts`](file:///d:/saas/desing/d%202/e2e/fixtures/seed.ts):

### A. Standard Fixture Seeding (Default)
Populates stations, buses, bus layouts, normal and VIP trips, test users across all roles, company accounts, deposits, and bookings.
```bash
npx tsx e2e/fixtures/seed.ts
```

### B. Empty State Seeding (`--empty`)
Wipes records and seeds only essential site settings and initial admin credentials. Used to verify empty-state UI patterns and zero-state messaging.
```bash
npx tsx e2e/fixtures/seed.ts --empty
```

### C. Big Data & Stress Seeding (`--big`)
Seeds 200 trips and 500 bookings with extreme edge-case data: ultra-long Arabic passenger names, emoji strings, and varied booking statuses. Used to stress-test pagination, layout wrapping, and horizontal scrolling.
```bash
npx tsx e2e/fixtures/seed.ts --big
```

---

## 3. Running the Test Server

Start the isolated test daemon pointing to the scratch database on port 3002:

```bash
node scripts/start-e2e-server.mjs
```

Verify server availability at `http://127.0.0.1:3002`.

---

## 4. Test Suite Phases & Execution Commands

### Phase A: Page Health (Zero-Defect Scan)
Audits 45 distinct URLs across Desktop (1280x800) and Mobile (390x844) viewports:
- HTTP 200 / valid redirects
- Brand logos, main landmarks, page headings
- Zero console exceptions (`TypeError`, `ReferenceError`, unhandled rejections)
- Zero layout overflow (`scrollWidth <= clientWidth`)

```bash
# Desktop 1280x800 (45 tests)
npx playwright test e2e/phase-a-page-health.spec.ts --project="Chromium desktop 1280"

# Mobile 390x844 (45 tests)
npx playwright test e2e/phase-a-page-health.spec.ts --project="Mobile Chrome (Pixel 5)"
```

### Phase B: Golden Journeys (Role Scenarios)
Verifies multi-step critical user journeys across all authenticated roles and cross-role interaction:
1. **Customer Journey:** Registration, login, seat booking, ticket print view, booking cancellation, profile update, sign-out.
2. **Company Manager Journey:** Dashboard metrics, company customer CRUD, credit deposit request, invoice overview, trip request submission, booking via company wallet.
3. **Super Admin Journey:** KPI tabs, bus fleet creation, single trip scheduling, payment approval, passenger boarding verification, company approval, reports CSV export, destinations/stations management.
4. **Cross-Role Synchronized Interaction:** Multi-context lifecycle across Super Admin, Customer, and Company Manager.

```bash
npx playwright test e2e/phase-b-golden-journeys.spec.ts --project="Chromium desktop 1280"
```

### Phase C: Worst-Case & Edge Scenarios
Tests 16 defensive scenarios:
- **C1:** 500 Server error & network drop handling on mutating routes (re-enabled buttons, zero infinite spinners).
- **C2:** Rapid double-clicks / debounce protection.
- **C3:** Session expiry mid-flow with clean redirection.
- **C4:** Concurrent seat booking conflict handling.
- **C5:** Browser navigation resilience (back, forward, refresh in flow).
- **C6:** Throttled network and clean loading state rendering.
- **C7:** Empty state views (no `NaN` or `undefined`).
- **C8:** Layout stability with long Arabic text and emojis.
- **C9:** XSS scripts and HTML input escaping.
- **C10 & C10-b:** Role permissions enforcement (customer cannot access admin, bus-less company has no fleet UI).
- **C11:** Cairo timezone formatting (`Africa/Cairo`).
- **C12:** Financial balance calculations & formatting.
- **C13:** Ticket print styling and QR code rendering.
- **C14:** Image upload error handling with Arabic feedback.
- **C15:** Axe-core accessibility audit on Home, `/trips`, and `/admin`.

```bash
npx playwright test e2e/phase-c-worst-cases.spec.ts --project="Chromium desktop 1280"
```

---

## 5. Phase D: Production Smoke Suite (Read-Only)

A lightweight, non-mutating smoke test suite safe to run against production or staging environments:
- Confirms public home page, header, and footer.
- Validates trips search page responsiveness.
- Confirms destinations and credits pages load.
- Validates login form inputs and submit trigger.
- Verifies protected routes reject unauthenticated requests.
- Validates internal navigational links integrity.

### Execution against Staging or Production:
```bash
# Point to live URL (defaults to http://127.0.0.1:3002 if unset)
BASE_URL="https://safrotravel.com" npx playwright test e2e/smoke-prod.spec.ts --project="Chromium desktop 1280"
```
