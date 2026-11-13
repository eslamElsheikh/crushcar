# SAFROTRAVEL — Independent Security Verification Report (Run #5)

**Date:** 2026-11-13 · **Branch:** `fix/seatmap-mobile` — **committed (`b4e62ac`) and deployed** via the push-to-deploy workflow (run `43351249283` green) · **Verifier:** independent re-verification; prior reports treated as claims, not facts.

---

## VERDICT: CODE FIXES VERIFIED — PRODUCTION NOT VERIFIED

**Why this status and not a stronger one:**

- Every code fix claimed in this run is verified by live HTTP assertions against a
  running server: **136/136 suite assertions pass on two consecutive full runs**, plus an
  independent **39/39 probe** (status *and* response-body leak scans, direct middleware
  invocation for the one behaviour HTTP cannot reach).
- `npx tsc --noEmit` → exit 0. `npx next build` (production build, separate distDir)
  → **compiled successfully** (90 s, middleware included), artifact removed and
  `tsconfig.json`/`next-env.d.ts` restored byte-identical afterwards.
- ESLint clean on every file modified in this run (23 API/lib files + the suite script).
- **The fixes are now deployed** (commit `b4e62ac`, workflow run `43351249283` green:
  build → FTP → migrations → deploy → verify live site, no rollback), and a
  **read-only production probe passes 15/15** (health, middleware 307s, CSP nonce,
  FAQ drafts, denial matrix, registration validation — no writes to production data).
- **But full production verification was not performed:** the 136-assertion suite
  creates fixtures *in the database it runs against* — running it against production
  would write test rows into the production database, which is out of scope without
  explicit approval — and the login/Turnstile flow still cannot be probed without real
  credentials and Turnstile keys.
- "100% secure" is never claimed. Residual risks remain (§6), including one **HIGH
  finding that is deliberately not fixed here** (FINDING-026, a hardcoded key in the
  deployment workflow).

---

## 1. What was executed (evidence)

| Check | Command / artifact | Result |
|---|---|---|
| Security regression suite | `npx tsx scripts/verify-security-suite.ts` (BASE_URL `127.0.0.1:3070`, scratch DB `.scratch/fix-feedback/.scratch-feedback.db`) | **136/136 PASSED** — two consecutive full runs in this session (earlier development runs: 125/125 ×2, 130/130) |
| Independent probe | `.scratch/verify-run5/probe.ts` (status **and** body leak scans; middleware invoked directly with `AUTH_SECRET` removed) | **39/39 PASSED** |
| Route inventory + static markers | `npx tsx scripts/route-matrix.ts` → `SECURITY_ROUTE_MATRIX.md` | **90/90 route files** classified (89 + new `api/uploads/sign`) |
| Type check | `npx tsc --noEmit` | exit **0** (whole project incl. `scripts/` and `.scratch/verify-run5/probe.ts`) |
| Production build | `NEXT_DIST_DIR=.next-build-verify npx next build` | **Success** (90 s; middleware 46.7 kB; only pre-existing `jose`/Edge-Runtime warning; artifact dir removed, `tsconfig.json`/`next-env.d.ts` restored — byte-identical diff 0) |
| Lint | `npx eslint <all files modified in Run #5>` | **0 errors** on every modified file (`npm run lint` still reports ~67k pre-existing errors in untouched files) |
| Session forging | signed next-auth JWTs via `encode(AUTH_SECRET, salt 'next-auth.session-token')` | exercises real signature/expiry verification; bypasses login form + Turnstile (documented limitation, §5) |
| Deploy | `git push origin fix/seatmap-mobile` → GitHub Actions run `43351249283` (build → FTP → migrations → deploy → verify live site) | **Success, no rollback** (commit `b4e62ac`, 55 files) |
| Production probe (read-only) | `npx tsx .scratch/verify-run5/prod-probe.ts` against `https://www.safrotravel.com` | **15/15 PASSED** — health 200, anon `/bookings/*` `/admin` `/company` → 307 `/login`, CSP nonce + nosniff, FAQ `?all=1` exposes 0 inactive, denial matrix 401/404 (uploads return JSON without image bytes), unknown station → 404, malformed register → 400; **no writes to production data** |

Areas added in Run #5 (suite): A18 refund claim race · A19 seat holds + cross-table +
degenerate segments + hold cap · A20 registration validation/flood · A21 upload authz +
signed links · A22 FAQ `?all=1` · A23 money bounds + error mapping · A24 invalid ids /
segments / PROOF_URL / stored-amount guard · A25 station trips with a **future-dated
fixture** (the Run #4 vacuity caveat is closed) · A26 concurrent company-booking EDIT.

---

## 2. Run #4 residual risks (the 8): disposition

| # | Run #4 residual | Disposition | Evidence |
|---|---|---|---|
| 1 | EDIT-path refund not conditionally claimed (money could move twice under concurrency) | **FIXED** — conditional claim (`WHERE` pins seat/total/status to the state the transaction read) before any money moves; deterministic ledger key replaces `edit-refund:${id}:${Date.now()}`, which was unique per call and could never dedupe | A26: concurrent edits → only edit outcomes (200/409, never 5xx), **exactly one** refund ledger row, money adjusted once; direct stale-predicate check (claim pinned to pre-edit state matches **0** rows) |
| 2 | Seat holds ignored by the company booking path | **FIXED** — hold conflicts checked on every booking path | A19 `HOLD_COMPANY_BLOCK` |
| 3 | No rate limit on `POST /api/register/company` | **FIXED** — IP bucket 10/15 min, charged before the body is read; customer register also limited (20/15 min) | A20 flood → 429 with `Retry-After` |
| 4 | Payment-proof uploads readable by anyone with the URL | **FIXED** — DB-backed access classification (`src/lib/upload-access.ts`): files referenced by proof columns are private (owner/operating-company/super-admin), destination photos and avatars stay public; `no-store` on private reads; signed links (`?exp=&sig=`) with HMAC + constant-time compare | A21 (authz matrix + mint/expired/tampered/garbage signature) · P-A3 |
| 5 | `/api/faqs?all=1` readable anonymously | **FIXED** — `?all=1` requires super admin; default view unchanged | A22 · P-A4 |
| 6 | `creditLimit` / deposit amounts unbounded (no max) | **PARTIAL** — one shared money rule now applies to deposits, manual wallet credits, platform funding and adjustments: number, finite, ≥ 0.01, ≤ 1,000,000 EGP (inherited from the existing piastres cap), exactly 2 decimals; `creditLimit` gained `.finite()` but **no ceiling** — the ceiling is a business decision, options documented in §6 | A23 · P-A7 |
| 7 | Login/Turnstile flow not re-probed live; middleware login throttle source-only | **UNCHANGED (still not live-verified)** — needs real credentials and real Turnstile keys; forged-JWT tests cover session verification only. Source review in Run #5 additionally found and fixed a login **timing oracle** (see N17) | §5, §6 |
| 8 | Unknown/invalid `tripId` → HTTP 500 | **FIXED** — mapped: unknown trip → 404, invalid/reversed stations → 400, unknown deposit/company ids → 404; all other failures → generic 500 with details only in server logs | A24 · P-A8 |

---

## 3. New issues discovered and fixed in Run #5

Found by re-reading the source for the Run #5 audit (not in prior reports). All fixed in
code, all with regression assertions, all type-checked and production-build-checked.
None committed, none deployed.

| # | Issue | Fix | Regression test |
|---|---|---|---|
| N8 | **Cross-table double booking.** The seat-overlap test matched neither `(1,1)` degenerate segments (trips with no stops) nor conflicts across `Booking` / `CompanyBooking` / `SeatHold` tables — one seat could be sold to a customer *and* a company, or walked through another customer's live hold | `src/lib/seat-availability.ts` (`segmentOverlap`, `excludeHoldId`, company + hold conflict checks) consulted by customer checkout, company checkout and the hold endpoint | A19 (cross-table ×3, degenerate ×1, positive control) · P-A6 |
| N9 | Seat holds: **no authentication**, no per-user cap, no rate limit — one account could squat every seat for two minutes at a time | 401 for anonymous; 10 active holds per user; `seat-hold` bucket 30/60 s with `Retry-After` | A19 (anon 401, flood 429, cap ≤ 10) |
| N10 | **Payment-proof uploads had no authorization at all** (residual #4) | Access model in `src/lib/upload-access.ts` + enforcement in `src/app/api/uploads/[file]/route.ts`; private reads `no-store` | A21 · P-A3 (anon 401, other-customer 403, owner/super-admin 200, no image bytes in denial bodies) |
| N11 | Signed-link minting endpoint added for proofs (`src/app/api/uploads/sign/route.ts`): mint restricted to whoever may already read; HMAC-SHA256 over `file\|exp`, constant-time compare, expiry falls back to session auth | as stated | A21 (anon 401, wrong user 403, owner 200, expired/tampered/garbage → 401) · P-A3 |
| N12 | Registration: no input validation (500-char names, malformed emails, 3-char passwords), **case-sensitive** duplicate check (`Admin@x.com` beside `admin@x.com`), no rate limit | zod-style validation in both register routes; case-insensitive duplicate check via `LOWER(email)` SQL (portable, SQLite + MySQL) with the unique index as race backstop; rate buckets | A20 (all malformed inputs → 400, case-variant dup → 400, flood → 429) |
| N13 | Financial inputs accepted **strings** (`"100"`), `Infinity` (`1e309` parses in JSON), 3+ decimals, negatives on adjustments, and unbounded magnitudes | One `parseMoneyAmount()` rule shared by deposit, wallet, platform-fund and platform-adjust routes; `creditLimitSchema` gains `.finite()` | A23 (4 deposit cases + Infinity + platform/adjust/wallet/credit-limit bounds + positive controls) · P-A7 |
| N14 | **Internal error messages echoed to clients**: `err.message` was the response body on deposit approval, credit-limit change, company booking create/update and admin company-booking PATCH/DELETE — any driver/Prisma failure answered with its own detail | Known conditions mapped to proper statuses (404/400/409); everything else → generic `{error:'Server error'}` with `console.error` server-side | A23 `ERROR_MAPPING`, A24 · P-A8 (leak scans: no `prisma`/`stack`/`query` in bodies) |
| N15 | `ATTACH_PROOF` wrote **any string** into `paymentProofUrl` — an attacker-chosen origin the reviewer's browser would fetch while looking at the proof | `PROOF_RE` allowlist (`/api/uploads/<uuid>.(jpg|jpeg|png|webp)`), kept in sync with the other two proof paths | A24 `PROOF_URL` (external → 400, `javascript:` → 400, own path → 200 + stored) |
| N16 | Stored deposit amount was never re-checked at approval — a row holding `NaN`/negative could credit the ledger | `BAD_STORED_AMOUNT` guard inside the transaction (rollback) → generic 500 | A24 `BAD_AMOUNT_GUARD` (500, no detail leaked, row stays PENDING) |
| N17 | Login **timing oracle**: unknown email skipped the bcrypt compare, so "no such user" answered measurably faster than "wrong password" — an account-existence oracle | `DUMMY_PASSWORD_HASH` (valid bcrypt-12 digest of a non-credential) compared when the user is not found | source-verified only (live login probing not possible here — §5) |
| N18 | Middleware session check **failed open** when `AUTH_SECRET` was unset in production: an unverifiable cookie was treated as valid | Fails closed in production (dev keeps fail-open so a developer without the variable is not locked out) | P-A1: direct `middleware()` invocation with the secret removed — prod + garbage cookie → **307 to /login**; dev → 200; valid cookie in prod → 200 (no lockout); forged with secret → 307 |
| N19 | Customer refund processing had **no conditional claim**: two administrators processing the same refund could both stamp it | `updateMany({id, status:'CANCELLED', refundProcessedAt:null})` claim; loser → 409; null-guard after claim | A18: concurrent pair → exactly one winner, loser refused, stamp once, third attempt refused · P-A5 |
| N20 | **Deployment workflow ships a hardcoded key in a query string**: `.github/workflows/deploy.yml` uploads `scripts/apply-migrations.php` (containing `DEPLOY_KEY = 'safro_extract_2026'`) to the public web root and calls it with `?key=safro_extract_2026&go=1`, deleting it `|| true` (deletion failure is ignored) | **Not fixed here** — changing the deploy pipeline is out of scope for this engagement and needs an operator decision; documented as FINDING-026 (§6) | n/a (static finding) |

Test-infrastructure work (not product code): suite fixtures extended to be idempotent and
re-runnable back-to-back (bus/layout/stations/trips/company/admin/holds/bookings/refunds
created or reset per run, `createdAt` refreshed where policy windows measure from it);
manual multipart helper for uploads; raw-JSON body support (`1e309` → `Infinity`);
future-dated station-trip fixture (closes Run #4's vacuity caveat); route-matrix script
re-run for 90 routes.

---

## 4. Route coverage

Full route-by-route matrix: **`SECURITY_ROUTE_MATRIX.md`** — all **90 API route files**
(path, methods, auth markers, roles, tenant/ownership scope, validation/rate-limit,
live evidence code, status) plus the private page trees. Statuses are honest:
`LIVE` = asserted by real HTTP in this run; `STATIC` = guards confirmed in source but not
probed; `PUBLIC` = intentionally unauthenticated; `GAP` = known residual issue.

---

## 5. Test-integrity assessment (critique of prior claims)

| Claim | Source | Reality |
|---|---|---|
| "37-scenario regression suite" | `SECURITY_AUDIT.md` L17, L27 | The same document embeds output showing **`RESULTS: 32/32 PASSED`** (L166) — embedded evidence contradicts its own prose. Neither number matches any run reproducible from this tree (Run #4: 68, Run #5: 136) |
| "15 fixes" | `SECURITY_FIX_LOG.md` (Fix 1–15) | One more than the 14 numbered findings — the extra is Fix 8 (analytics hardening), which never got a finding number. **Now 30 fixes vs 28 findings**; the two extras are Fix 8 and Fix 23 (signed upload links, part of FINDING-017) |
| "14 findings, all RESOLVED" | `SECURITY_FINDINGS.md` summary table | True as of Run #4. Run #5 adds FINDING-015…028 (14 more): 13 resolved, **1 OPEN** (FINDING-026, deployment key) |
| "production validated" (prior docs) | earlier reports | Could not be reproduced from this tree in Run #4; unchanged in Run #5 — production was never probed |

Integrity observations:

1. **No evidence of fake passes.** Assertions compare real HTTP statuses/bodies against a
   live server; deliberate negative *and* positive (no-false-denial) cases exist; failing
   runs exit non-zero (observed during Run #5 development when two assertions failed —
   both were test-expectation bugs, diagnosed and fixed rather than masked: the
   company-wallet endpoint is super-admin-only by design, and the owner-cancel fixture
   aged out of the policy's 1-hour free window because `createdAt` was not reset).
2. **A vacuous-claim caveat from Run #4 is now closed:** AREA 25 books against a
   future-dated, `SCHEDULED`, two-stop fixture trip, so the "future + scheduled" filter on
   the public station endpoint is exercised with real data, not inferred from an all-past
   database.
3. **Known limitation — the EDIT race's 409 is not observable on this database.** Prisma
   serialises interactive transactions on SQLite, so two concurrent EDIT requests never
   produce a stale read here (debug run: 6/6 concurrent edits returned 200 with money
   moved exactly once). A26 therefore asserts the achievable invariants (no 5xx, exactly
   one refund row, money adjusted once) plus a direct check that the route's claim
   predicate rejects a row pinned to its pre-edit state. On production MySQL (READ
   COMMITTED) the overlapping-read case is exactly what the `WHERE` clause rejects; the
   analogous absolute-state claim in A18 *does* produce an observable loser 409 here.
4. **Forged sessions** exercise signature verification but not the login form, CSRF, or
   Turnstile. Those paths were verified in source only (unchanged from Run #4; the timing
   fix N17 is source-verified).
5. **Rate-limit buckets are shared per server process.** Re-runs inside a window can see
   429s where an assertion expects 400; the suite accepts 429 as equivalent evidence for
   those rows (documented inline), because a spent bucket is not a bypass.

---

## 6. Residual risks (documented, deliberately not fixed in this run)

| # | Risk | Severity | Why not fixed now |
|---|---|---|---|
| 1 | **FINDING-026: hardcoded deployment key.** `scripts/apply-migrations.php` ships with `DEPLOY_KEY = 'safro_extract_2026'`, uploaded to the public web root and invoked via `?key=safro_extract_2026&go=1`; the cleanup `curl … \|\| true` ignores deletion failure. Anyone who obtains the key (repo access, logs, referrer leakage of the query string) can trigger the migration endpoint until deletion succeeds | **HIGH** | Workflow/deployment changes are out of scope for this engagement; requires an operator decision (rotate the key, move it to a secret, fail the job if deletion fails) |
| 2 | **`creditLimit` has no ceiling** (only `.finite()`). Options for the business owner, in increasing strictness: (a) no cap — current behaviour, super-admin-only endpoint; (b) soft cap at the existing money ceiling (1,000,000 EGP) like deposits; (c) per-plan caps (`STARTER`/`PRO`/`ENTERPRISE`); (d) require a second approver above a threshold. **No cap is invented here** — inventing a financial limit would change business policy | Low | Business decision; endpoints are super-admin-only (the risk is a typo, not an attacker) |
| 3 | **Login/Turnstile flow not live-verified.** Session forging skips the login form, CSRF on credentials, and Turnstile enforcement; the middleware login throttle (15/15 min) and the timing fix (N17) are source-verified only | Info | Needs real test credentials and real `TURNSTILE_*` keys in a test deployment |
| 4 | **Orphaned uploads stay public.** The access model classifies by DB reference: a proof file no record references any more (row deleted, URL overwritten) falls back to public. Destination photos and avatars must stay public by design, so "default private" would break the public site; the fallback was chosen deliberately | Low | Fixing it needs a reference-count/garbage-collection scheme, not a flag |
| 5 | **DB index recommendations** (performance-adjacent, affects abuse resistance under load): `Booking(tripId, seatLabel)`, `CompanyBooking(tripId, seatLabel)`, `SeatHold(tripId, seatLabel, expiresAt)` would turn the cross-table conflict scans into index lookups; current scans are table walks that degrade as bookings grow | Low | Schema migration on production data; needs its own change window |
| 6 | **SQLite-vs-MySQL concurrency semantics.** The EDIT-claim stale-read rejection (A26) is proven at predicate level, not observed over HTTP, because SQLite serialises interactive transactions (§5.3). Production behaviour under true overlap rests on the `WHERE` clause being correct — reviewed, but not raced on a production-equivalent engine | Low | Reproducing it needs a MySQL instance identical to production |
| 7 | Residuals carried from Run #4 that remain: login throttle source-only (see #3), charter EDIT-path money movement reviewed but not raced live (its claims/idempotency keys were verified in source in Run #4) | Low | Same live-verification constraint |

---

## 7. Deployment status

- Deploy pipeline: `.github/workflows/deploy.yml` — on **push** to `fix/seatmap-mobile`:
  build → FTP `app.zip` → run migrations (the endpoint carrying FINDING-026) → agent
  deploy → health/build-id check → automatic rollback on failure. `DEPLOY.md` manual steps
  are fallback only.
- **Deployed.** Commit `b4e62ac` (55 files, Run #4 + Run #5 fixes, suite, matrix, docs)
  was pushed and workflow run **`43351249283` completed green** on 2026-11-13 — build,
  FTP upload, DB migrations, server-side deploy and live-site verification all passed;
  rollback was not triggered.
- **Post-deploy production probe: 15/15 passed, read-only** (`.scratch/verify-run5/prod-probe.ts`).
  It touches only public/read endpoints and denial paths that write nothing.
- **No production data was modified** by this engagement. All 136 suite assertions ran
  against the local scratch DB (`.scratch/fix-feedback/.scratch-feedback.db`).
- **What production verification still lacks:** (a) the full 136-assertion suite against
  the deployed URL — it creates fixtures in whatever DB it targets, so running it against
  production needs explicit approval; (b) login/Turnstile flow (needs real credentials
  and `TURNSTILE_*` keys); (c) FINDING-026 (HIGH) remains open by design — see §6.

**To reach `PRODUCTION SECURITY VERIFICATION PASSED`, the next operator must:**
1. Rotate/close FINDING-026 (hardcoded key in the deploy workflow);
2. Re-run `npx tsx scripts/verify-security-suite.ts` **against the deployed URL**
   (`BASE_URL` env) **with explicit approval** — the suite is environment-agnostic but
   writes fixtures into the target DB;
3. Probe login/Turnstile once with real credentials and keys;
4. Optionally close residual #6 by racing the EDIT-claim path on a MySQL instance
   identical to production.

---

## 8. Reproduction

```bash
# terminal 1 — local dev server on the scratch DB (already running on 3070 in this session)
npx next dev -p 3070
# terminal 2
npx tsx scripts/verify-security-suite.ts     # expect 136/136 (twice back-to-back)
npx tsx .scratch/verify-run5/probe.ts        # expect 39/39 — the process keeps the
                                             # event loop alive after SUMMARY (the
                                             # middleware import); kill it after the
                                             # summary prints
npx tsc --noEmit                             # expect exit 0
npx eslint <modified files>                  # expect 0 errors
npx tsx scripts/route-matrix.ts              # 90 routes → SECURITY_ROUTE_MATRIX.md
npx tsx .scratch/verify-run5/prod-probe.ts    # read-only vs https://www.safrotravel.com
                                             # expect 15/15 (writes nothing)
NEXT_DIST_DIR=.next-build-verify npx next build   # expect success; then remove
                                             # .next-build-verify and restore
                                             # tsconfig.json / next-env.d.ts
```

**Related artifacts:** `SECURITY_ROUTE_MATRIX.md` (route matrix), `scripts/verify-security-suite.ts`
(136 assertions), `.scratch/verify-run5/` (probe, route-matrix output, build log, backups),
`SECURITY_AUDIT.md` / `SECURITY_FINDINGS.md` / `SECURITY_FIX_LOG.md` (prior claims,
reconciled in §5).
