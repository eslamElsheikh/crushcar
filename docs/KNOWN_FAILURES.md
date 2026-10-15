# Known Test Failures

Failures in the e2e suite that are **not** caused by the current work. Each one
was reproduced on a clean tree at commit `c2cdbee` before any of the booking,
charter or navigation changes landed, so it is a pre-existing defect rather
than a regression.

Run the suites against the isolated server, never against `prisma/dev.db`:

```bash
npx tsx e2e/fixtures/seed.ts
node scripts/start-e2e-server.mjs        # port 3002
npx playwright test e2e/phase-b-golden-journeys.spec.ts --project="Chromium mobile 390x844"
```

---

## 1. Phase B, cross-role chain — approve button never appears

**Test:** `e2e/phase-b-golden-journeys.spec.ts:575` — *Cross-Role Chain: Complete
end-to-end chain across Admin, Customer, and Company*
**Project:** fails on both mobile and desktop.

**Failure:**

```
expect(locator).toBeVisible() failed
Locator: locator('button:has-text("موافقة")').first()
Error: element(s) not found
```

**Where:** `e2e/phase-b-golden-journeys.spec.ts:692`

**What happens:** the company admin fills a deposit amount on `/company/credit`
and submits. The test then opens `/admin/deposit-requests` as the super admin
and looks for the approve button. The button is not there, so the deposit
request the company just created never reached the admin queue.

**Reproduced on clean tree:** yes — `git stash` back to `c2cdbee` and the same
step fails with the identical locator error.

**Not yet diagnosed.** The two candidates are that the submit on
`/company/credit` does not actually create a `DepositRequest`, or that the admin
queue does not list it. `/company/credit` and `/admin/deposit-requests` are
both untouched by the current work.

**Blocks:** the second half of the cross-role test, so the wallet-increase
assertion after it never runs.

---

## 2. Phase C, C14 — upload error feedback

**Test:** `e2e/phase-c-worst-cases.spec.ts:402` — *C14: Upload errors fail
gracefully with Arabic feedback*

**Symptom:** fails intermittently in a full-suite run and passes when run alone:

```bash
npx playwright test e2e/phase-c-worst-cases.spec.ts:402 --project="Chromium mobile 390x844"
# 1 passed
```

**Cause:** timing on the upload rejection path, not a product defect. The upload
code (`localizeUploadError` in `src/lib/utils.ts`, the Arabic messages in
`src/lib/validations.ts`) is untouched by the current work.

**Workaround until fixed:** run the phase C suite serially as documented, or
re-run any failure in isolation before treating it as a regression.

---

## Passing baseline

Everything else is green. Measured on the final commit:

| Suite | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run build` | clean |
| `npm run check:lang` | 415 keys, all defined |
| `npm run check:routes` | 205 files, direction-correct |
| `npm run check:charter` | all pass |
| `npm run check:ref` | all pass |
| `npm run check:users` | all pass |
| Phase A, mobile 390x844 | 44/44 |
| Phase A, desktop 1280 | 44/44 |
| Phase B, mobile 390x844 | 23/24 (the failure above) |
| Phase C, mobile 390x844 | 16/17 (the flake above) |

---

## Environment gotcha

`npx tsx e2e/fixtures/seed.ts` fails with a foreign-key error on
`company.deleteMany` if `.scratch/e2e.db` predates a model in the schema: the
wipe step reaches for tables through optional chaining, so a model the
generated client does not know about is skipped and its rows survive to block
the delete.

Delete the file and recreate it before seeding:

```bash
rm .scratch/e2e.db
DATABASE_URL="file:../.scratch/e2e.db" npx prisma db push --schema prisma/schema.prisma
npx tsx e2e/fixtures/seed.ts
```
