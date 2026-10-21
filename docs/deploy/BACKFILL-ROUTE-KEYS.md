# Backfilling the route keys — production runbook

**Nothing in this runbook has been run against production. Every step below
waits for explicit approval.** The approvals each step needs are listed in
§7.

The `20261021000000_route_quota_and_booking_creator` migration adds two
columns to `Trip`:

| Column | What it is |
|---|---|
| `routeKey` | the ordered station-id sequence of the trip, `'\|'`-joined |
| `travelDate` | the travel day as a Cairo calendar day, `yyyy-mm-dd` |

They start empty. Until they are filled, a trip has no route identity, and
the daily allowance for a route cannot be counted against it — a trip with no
identity is a trip outside every bucket, which is the one thing an allowance
must not allow. The code refuses such a booking with `UNRESOLVED_ROUTE`
rather than letting it through, so **the backfill is what makes company
bookings work at all on the existing trips**, not a tidy-up afterwards.

The keys are derived from the trip's own `TripStop` rows, which are foreign
keys to `Station.id` with an explicit order. Nothing is derived from the
origin and destination text, which is a display snapshot and disagrees with
the stop list on some trips.

---

## 0. The three pending migrations

Three migrations are ready and none has been applied to production. They touch
different tables and columns, so they are **independent**: a partially applied
release can be completed in any order. The order below is by convention.

| Migration | What it adds | Must land before |
|---|---|---|
| `20261016000000_platform_wallet_and_quotas` | `PlatformWallet`, `PlatformTransaction`, `CompanyTripQuota`, `Booking.fundingSource`, `Company.autoPayEnabled`, `Company.maxSeatsPerBooking`, `CompanyBooking.expiredAt` | any release containing `/api/platform/bookings` |
| `20261021000000_route_quota_and_booking_creator` | `Trip.routeKey`, `Trip.travelDate`, `CompanyRouteQuota`, `WalletTransaction.idempotencyKey`, `CompanyBooking.createdByUserId` | any release containing `/api/admin/company-bookings` |
| `20261022000000_daily_company_cap_and_credit_reference` | `Company.maxDailySeats`, `CreditLog.bookingReference`, `CompanyBooking.idempotencyKey` | any release containing the daily cap or the credit top-up |

Each one was rehearsed against a copy of the production schema: applied, it
reproduces the target structure exactly, and rolled back it returns to the
pre-migration state exactly.


---

## 1. What the rehearsal found

Rehearsed against `data_live/safro_travel_db.sql`, a dump of the production
database, loaded into a throwaway schema with both pending migrations
applied in order. The dump is from 2026-10-05.

| | |
|---|---|
| trips | 120 |
| trips whose key could be derived | 119 |
| trips left unresolved | **1** — and it is a test row (`cmtesttrip…`), with no stops |
| distinct routes | 23 |
| distinct route+day buckets | 117 |
| routes that run more than one day | 9 (the busiest runs 70 days) |
| routes that run both ways | 4, each with its own key |
| buckets holding a journey and its reverse | **0** |
| distinct stop sequences vs distinct route keys | **23 vs 23 — nothing merged** |
| trips whose Cairo day differs from their UTC day | **5** |
| journeys whose label matches but whose stops differ, same day | **2** |

The five trips whose Cairo day differs from their UTC day are the reason the
day is computed in Cairo time: a trip leaving at 23:00 UTC on the 23rd is
already the 24th in Cairo, and the allowance belongs to the day the
passenger travels, not to the day the server happened to start on.

The two ambiguous journeys are the same thing in both cases: the same
`origin → destination` label is run on the same day with different
intermediate stops. The key keeps them apart, which is correct, but the
label does not — see the finding below.

### Verification on the copy

`npx tsx scripts/verify-backfill-rehearsal.ts` against the rehearsed copy:

```
  PASS  every trip with stops has a key equal to its own stops
  PASS  no trip with stops was left without a key
  PASS  the trips left without a key are the ones with no stops
  PASS  every travel date is the Cairo day of the departure
  PASS  no bucket holds a journey and its reverse
  PASS  the routes that run both ways have separate keys
  PASS  one key per stop sequence — nothing merged
  PASS  four seats fit under a daily allowance of four
  PASS  the second trip on the same route and day is refused by the same allowance
  PASS  with a larger allowance the second trip is allowed
```

An independent check in SQL — comparing every stored key against the
`GROUP_CONCAT` of that trip's own stops — agrees: 119 of 119 match, 1 key
without stops, 0 stops without a key.

---

## 2. The run

### Before anything

1. **Take a backup.** The whole `Trip` table, at minimum.

   ```bash
   mysqldump -u safro_user -p safro_travel_db Trip > backup-trip-$(date +%F).sql
   mysqldump -u safro_user -p safro_travel_db Station TripStop > backup-stops-$(date +%F).sql
   ```

2. **Apply the two pending migrations**, in order:

   ```bash
   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261016000000_platform_wallet_and_quotas/migration.sql
   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261021000000_route_quota_and_booking_creator/migration.sql
   ```

   `prisma migrate deploy` does not work here: `migration_lock.toml` declares
   the `sqlite` provider. See `docs/deploy/MIGRATIONS.md`.

3. **Dry run.** Read the output. It writes nothing.

   ```bash
   DATABASE_URL="mysql://safro_user:…@localhost/safro_travel_db" \
     npx tsx scripts/backfill-route-keys.ts
   ```

   Check the numbers against §1 above. They will not match exactly — the
   production data has moved since the dump — but the shape should be the
   same: every trip with stops derivable, and the unresolved ones listed by
   id.

   **Read the "journeys whose text matches but whose stops differ" section.**
   Those are the ones a person has to look at.

4. **Write.**

   ```bash
   DATABASE_URL="mysql://safro_user:…@localhost/safro_travel_db" \
     SAFRO_BACKFILL_APPLY_PRODUCTION=1 \
     npx tsx scripts/backfill-route-keys.ts --apply
   ```

   The script refuses to write to a database it does not recognise as a test
   one, unless `SAFRO_BACKFILL_APPLY_PRODUCTION=1` is also set. Two explicit
   decisions, not one flag typed from memory.

5. **Verify.**

   ```bash
   # Nothing should be left unresolved that has stops.
   mysql -u safro_user -p safro_travel_db -e "
     SELECT COUNT(*) AS still_missing FROM Trip
     WHERE (routeKey IS NULL OR travelDate IS NULL)
       AND EXISTS (SELECT 1 FROM TripStop s WHERE s.tripId = Trip.id);"

   # Every stored key must equal the trip's own stops.
   mysql -u safro_user -p safro_travel_db -e "
     SET SESSION group_concat_max_len = 100000;
     SELECT COUNT(*) AS mismatched FROM Trip t
     LEFT JOIN (SELECT tripId, GROUP_CONCAT(stationId ORDER BY stopOrder SEPARATOR '|') seq
                FROM TripStop GROUP BY tripId) d ON d.tripId = t.id
     WHERE t.routeKey IS NOT NULL AND t.routeKey <> d.seq;"
   ```

   Both must be `0`.

6. **Deploy the code** that reads the columns. Until then the application
   still derives the keys itself and the columns are simply unused.

---

## 3. Recovery

The backfill writes two columns on `Trip` and nothing else. It writes each
row on its own and it is idempotent: running it again on a trip that already
has a key changes nothing.

**To undo it**, put the columns back to null:

```sql
UPDATE Trip SET routeKey = NULL, travelDate = NULL;
```

The application then behaves exactly as it does before the backfill: a trip
with no key is refused for company bookings with `UNRESOLVED_ROUTE` and
carries no daily allowance. Nothing is corrupted, because the keys are
derived — the stops are the truth and they are untouched.

**To undo one trip**, set that trip's columns to null. The other trips are
unaffected, and the allowance for that route counts the trips that still
have keys.

**To undo everything properly**, restore the backup:

```bash
mysql -u safro_user -p safro_travel_db Trip < backup-trip-2026-XX-XX.sql
```

The `Trip` table holds no bookings — those are in `Booking` and
`CompanyBooking`, which the backfill does not touch — so restoring it alone
is safe. It does hold `SeatHold` and `SeatBlock` references by `tripId`,
which survive a restore of the table's contents.

**If a key is wrong** — say a trip's stops were edited after the backfill
without the route key being re-derived — the application refuses the booking
with `STORED_MISMATCH` and names the trip. The fix is to re-derive that one
trip:

```bash
# The trip edit screen re-derives the key when the stops are saved.
# From the API, as a super admin:
curl -X PUT …/api/trips/<tripId> -d '{"stops":[…]}'
```

A trip edited *without* stops no longer has its stops replaced, and no longer
has its key nulled — that was fixed alongside this work.

---

## 4. The finding from the rehearsal

**The route allowance editor cannot list a route for any company in the
production data.**

The editor offers the routes the company's **own buses** run, and it reads
them from `Bus.companyId`. In the production copy **no bus has a
`companyId` at all** — all four are null — while the one real company
("Safro Travel") has 16 company bookings spread across many routes on
buses that belong to nobody.

So the list an admin sees is empty, and there is no way to choose a route to
cap. The allowance itself is enforced correctly by the code; it simply
cannot be set from the page.

The fix is small and identified: the list should be the routes the company
**books on**, from its own bookings, plus the routes it operates — the
second for setting an allowance before the first booking, the first because
that is where the company's seats actually are.

This is not fixed in the three commits above, because it is a different
concern from the quota counting and the seat validation, and it was found by
the rehearsal rather than by the tests. It needs a fourth commit and its own
approval.

**While it is unfixed, the allowance can be set with SQL**, which is
adequate until the page is fixed:

```sql
INSERT INTO CompanyRouteQuota (id, companyId, routeKey, travelDate, maxSeats, createdAt, updatedAt)
VALUES (UUID(), '<companyId>', '<routeKey>', '<travelDate>', 15, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE maxSeats = 15;
```

The `routeKey` and `travelDate` come from the backfill's dry-run output.

---

## 5. What is left after the backfill

- The one trip with no stops stays unresolved, and company bookings on it
  are refused with a message that says why. In the copy it is a test row. If
  a real trip like that appears, it needs its stops filled in, or it should
  not be offered to companies.
- The two ambiguous journeys need a person to look at them. The key keeps
  them apart; the label does not, so the quota editor should show the stop
  sequence and not only the origin and destination text.

> **This is now done.** The quota editor shows the ordered stops and names
> the intermediate ones, so the two journeys no longer read the same. The
> canonical key is untouched, and the allowance set against it still applies
> to the same journey. A stop whose name is gone is reported as unknown
> rather than given an invented one.

---

## 6. The operational items, and the approval each one needs

None of these has been done. They are listed with the approval that would
let them happen, so the order is clear and nothing is done by accident.

| # | Item | What it involves | Approval needed |
|---|---|---|---|
| 1 | **Apply the three migrations** | A schema change on the production database | Explicit approval naming the three migrations, after a verified backup |
| 2 | **Run the route-key backfill** | A data change on every trip | Explicit approval, after the dry run has been read and the unresolved trips checked |
| 3 | **Configure the cPanel cron** | A cron entry and `JOB_CRON_KEY` in the production environment | The account owner's action; the key is theirs to set |
| 4 | **Remove `deploy-fix.php` from the production server** | Deleting a file from `public_html` | Explicit approval; it is the only one of the nine still up there |
| 5 | **Rotate the deploy credential** | The key the nine diagnostic files carry | Explicit approval; the key is live and accepting requests |

The in-request sweep now releases expired company bookings as well as
customer ones, so step 3 is no longer a blocker for the quotas — it is
still wanted, because the scheduled sweep is what keeps the numbers right
when nobody is looking at a trip.

## 7. The order the production steps should happen in

Each step says what it needs, so nothing is done out of order.

```
1. BACKUP                    approval: none needed, but do it anyway
     mysqldump -u safro_user -p safro_travel_db > backup-$(date +%F).sql
     verify: the file is not empty and the row counts look right

2. MIGRATIONS                approval: explicit, naming the three migrations
     mysql -u safro_user -p safro_travel_db < .../20261016000000_.../migration.sql
     mysql -u safro_user -p safro_travel_db < .../20261021000000_.../migration.sql
     mysql -u safro_user -p safro_travel_db < .../20261022000000_.../migration.sql
     verify: SHOW CREATE TABLE Company; Trip; CompanyRouteQuota; CreditLog

3. BACKFILL DRY RUN          approval: none needed, it writes nothing
     DATABASE_URL=... npx tsx scripts/backfill-route-keys.ts
     read: the unresolved trips, and the journeys whose text matches but
           whose stops differ

4. BACKFILL APPLY            approval: explicit, after step 3 has been read
     DATABASE_URL=... SAFRO_BACKFILL_APPLY_PRODUCTION=1 \
       npx tsx scripts/backfill-route-keys.ts --apply
     verify: the query in §2 of this runbook returns 0

5. DEPLOY THE CODE           approval: explicit
     verify: npm run check:company-limits, check:daily-quota,
             check:credit-policy, check:credit-audit, check:charter-isolation,
             check:quota-editor, check:seats, check:backfill

6. CRON                      approval: the account owner's action
7. REMOVE deploy-fix.php     approval: explicit
8. ROTATE THE CREDENTIAL     approval: explicit
```

**The order matters in one place:** step 5 needs steps 1 to 4 to have
happened, because the code reads columns the migrations add and keys the
quotas the backfill writes. Deploying the code first means every company
booking on an existing trip is refused with `UNRESOLVED_ROUTE`.

