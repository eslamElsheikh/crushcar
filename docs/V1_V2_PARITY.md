# Parity Matrix: Safro Travel V1 (Baseline 8841972) vs V2 Redesign

## 1. Executive Summary & Methodology
This audit mechanically compares **Safro Travel V1** (commit `8841972`, running on `http://127.0.0.1:3001` with an isolated DB copy) against **V2 Redesign** (branch `feature/safro-v2-redesign`, running on `http://localhost:3000`).

- **UI Routes Analyzed**: 48 pages in V1 vs 48 pages in V2 (+3 new pages in V2: `admin/destinations`, `credits`, `destinations`). Zero missing page files.
- **UI API Calls Inspected**: 117 API calls in V1 vs 119 in V2.
- **Architectural Rules**:
  - `SUPER_ADMIN` exclusively manages fleet, trips, layouts, stations, and approval workflows.
  - Companies and customers only book and view tickets/invoices/credits.
  - Do NOT touch `api/`, `prisma/`, or `auth`. Backend gaps must be documented with file and line.
  - Do NOT restore intentional removals: fake KPI deltas (+12%/+8%), B2B search tab, company-side fleet management, demo accounts in production (`NODE_ENV === 'production'`), and V1 glass/dark styling (`#030303`, `glass`, `text-zinc-`).
  - Mobile responsiveness: 390px viewport stacking, no horizontal scroll.

---

## 2. Parity Table by Area & Role

| Area | Role | V1 Feature & Location | V2 Status | Decision | Reason / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Company Bookings** | `COMPANY_ADMIN` | **حجز الرحلة كاملة (Book Entire Trip / All Seats)**<br>`src/app/company/bookings/new/page.tsx` | **Missing** | **RESTORE** | Company users need the ability in Step 2 to select all available remaining seats at once with tiered pricing (`priceOf(seat)`), auto-populate company passenger defaults in Step 3, disable submit button during request (no double submit), and gracefully show seat conflicts if any fail. |
| **Company Charter Backend Gap** | `COMPANY_ADMIN` | Dedicated Charter Booking system (`src/app/company/charter/*`, `src/app/api/company/charter/*`) | **Backend Gap** | **DOCUMENT ONLY** | In the legacy prototype, a separate `CharterBooking` model existed. In the current branch schema (`prisma/schema.prisma`), `Trip.bookingMode` and `CharterBooking` are not present. Per rules, full-trip booking is implemented via `/api/company/bookings` multi-seat transaction. **Backend gap reported below**. |
| **Admin Dashboard** | `SUPER_ADMIN` | **Job Transition Trigger on Mount**<br>`fetch('/api/jobs/transition', { method: 'POST' })` in `src/app/admin/page.tsx:44` | **Missing** | **RESTORE** | Transitions past scheduled trips automatically when admin visits the dashboard. |
| **Admin Dashboard** | `SUPER_ADMIN` | **Recent Bookings Feed**<br>`data.recentBookings` list in `src/app/admin/page.tsx:244-291` | **Missing** | **RESTORE** | V1 showed latest 6 bookings with customer name/avatar, route, seat, amount, and status pill. V2 only showed stat cards and revenue chart. |
| **Admin Dashboard** | `SUPER_ADMIN` | **Quick Actions Grid**<br>Links to `/admin/buses`, `/admin/trips`, `/trips`, `/admin/companies/pending` with badge in `src/app/admin/page.tsx:295-363` | **Missing** | **RESTORE** | Quick access to manage buses, trips, public browse, and pending company approvals. |
| **Admin FAQs** | `SUPER_ADMIN` | **FAQ Reorder HTTP Method**<br>`src/app/admin/faqs/page.tsx:129` sends `POST /api/faqs/:id/reorder` | **Partial (Bug)** | **RESTORE (Fix)** | Backend endpoint `src/app/api/faqs/[id]/reorder/route.ts:5` requires `PATCH`. Calling `POST` returns 405 Method Not Allowed in V2. Fix UI method to `PATCH`. |
| **Admin Trip Seats** | `SUPER_ADMIN` | **Seat Details Drawer / Modal**<br>`src/app/admin/trips/[id]/seats/page.tsx:305-415` | **Missing** | **RESTORE** | V1 had a side panel showing seat details (label, type, price, passenger name, company name, reference, paid timestamp, boarding action). V2 only had direct boarding toggle without inspection. |
| **Admin Trip Requests** | `SUPER_ADMIN` | Company Trip Request approval & rejection modal<br>`src/app/admin/trip-requests/page.tsx` | **Present** | **KEEP** | Functionally identical in V2 with approve/reject modal and reason input. |
| **Admin Deposit Requests**| `SUPER_ADMIN` | Deposit requests review & approve/reject<br>`src/app/admin/deposit-requests/page.tsx` | **Present** | **KEEP** | Fully operational in V2. |
| **Admin Cancellations** | `SUPER_ADMIN` | Cancellation review, refund, and reject<br>`src/app/admin/cancellations/page.tsx` | **Present** | **KEEP** | Filter by type (customer/company) and actions intact in V2. |
| **Admin Buses & Layout** | `SUPER_ADMIN` | Bus creation, edit, layout designer, delete<br>`src/app/admin/buses/*` | **Present** | **KEEP** | Fully functional in V2. |
| **Admin Trips** | `SUPER_ADMIN` | Trip creation, stop configuration, passenger manifest<br>`src/app/admin/trips/*` | **Present** | **KEEP** | Intact in V2. |
| **Company Dashboard** | `COMPANY_ADMIN` | Wallet & credit cards, recent bookings, quick links<br>`src/app/company/dashboard/page.tsx` | **Present** | **KEEP** | Wallet balance, credit limit, outstanding balance, recent bookings intact. |
| **Company Invoices** | `COMPANY_ADMIN` | Invoice list, pay invoice with wallet<br>`src/app/company/invoices/page.tsx` | **Present** | **KEEP** | Intact in V2. |
| **Company Credit / Wallet**| `COMPANY_ADMIN` | Wallet transactions & deposit request submission<br>`src/app/company/credit/page.tsx` | **Present** | **KEEP** | Intact in V2. |
| **Customer & Public** | `CUSTOMER` / Guest | Trip search, round-trip booking, seat selection, booking details, cancellations, profile, print ticket | **Present** | **KEEP** | Complete in V2 with round-trip step wizard and responsive layout. |

---

## 3. Discovered Backend Gaps (Report Only — Do Not Alter Backend)

Per instructions, no backend (`api/`, `prisma/`, or `auth`) files may be touched. The following backend gaps were identified:

1. **Charter Booking Model & Endpoint Absence**:
   - **Legacy reference**: Separate charter system was explored in `safrotravel` (`src/app/api/company/charter/bookings/route.ts`, schema `CharterBooking`).
   - **Current branch state**: `prisma/schema.prisma` does not define `model CharterBooking` and `Trip` has no `bookingMode` or `busPrice` field.
   - **Handling**: V2 provides full-trip booking ("حجز الرحلة كاملة") via the standard, transactional `POST /api/company/bookings` endpoint, selecting all seats on scheduled trips with tiered pricing.
2. **FAQ Reorder Route Expects PATCH**:
   - **File & Line**: `src/app/api/faqs/[id]/reorder/route.ts:5` exports `export async function PATCH(...)`.
   - **UI Impact**: V2 UI sent `POST`. The fix is entirely in the UI (`src/app/admin/faqs/page.tsx:129`). No backend modification needed.
3. **Trip Transition Endpoint**:
   - **File & Line**: `src/app/api/jobs/transition/route.ts:4`.
   - **State**: The endpoint exists and accepts `POST`. V1 called it on admin dashboard mount to transition past scheduled trips to `IN_PROGRESS` or `COMPLETED`. V2 had omitted this call. Restored in `src/app/admin/page.tsx`.

---

## 4. Intentional Removals (Preserved as Intended)

The following items from V1 were intentionally removed and are **NOT** restored:
- **Hardcoded Fake KPI Deltas**: `+12% vs last month` and `+8% vs last month` in admin analytics.
- **B2B Search Tab**: On the public homepage search widget.
- **Company Fleet Management**: Company users managing buses or scheduled trips directly (restricted strictly to `SUPER_ADMIN`).
- **Demo Accounts in Production**: Demo accounts pill shown only when `process.env.NODE_ENV !== 'production'`.
- **V1 Legacy Styling**: Glassmorphic panels, `#030303` background, and `text-zinc-*` color palette. Replaced by V2 design system tokens.
