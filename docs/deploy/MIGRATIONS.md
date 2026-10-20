# Database Migrations

How schema changes reach the production MariaDB database, and why they cannot
go through `prisma migrate deploy`.

## `prisma migrate deploy` does not work in this repo

`prisma/migrations/migration_lock.toml` declares `provider = "sqlite"`, and the
migrations in that folder are written in SQLite syntax — double-quoted
identifiers, `TEXT`, and `PRAGMA foreign_keys=OFF` in
`20261009120000_drop_invoice`. The production database is MariaDB. Replaying
the folder there fails on the first statement.

The folder is the **dev** history. Production is built from
`prisma/schema.mysql.prisma`.

## How to apply a change to production

Back up first, then pipe the SQL straight into the MySQL client:

```bash
mysqldump -u safro_user -p safro_travel_db > backup-before.sql

mysql -u safro_user -p safro_travel_db < prisma/migrations/<name>/migration.sql
```

A migration that ships with this repo must be written in MySQL syntax even
though it sits in a folder locked to SQLite — see
`20261010000000_add_booking_payment_expiry` and
`20261015000000_add_reference_counter` for the pattern, each with a comment
saying so.

## Order matters

**Apply the SQL before deploying the code that reads it.** The deploy script
uploads files and runs `prisma generate`, but it does not apply migrations.
Any release that adds a table or column will fail at runtime until the SQL has
run.

## Adding a model to the schema

A new model has to land in two tracked files:

| File | Used by |
|---|---|
| `prisma/schema.prisma` | SQLite, local dev |
| `prisma/schema.mysql.prisma` | MariaDB, production |

`prisma/schema.harness.prisma` and `scripts/parity/.generated/` are gitignored.
Regenerate both, and the harness Prisma client, with:

```bash
npm run check:parity:gen
```

## Pending

| Migration | Effect | Must land before |
|---|---|---|
| `20261015000000_add_reference_counter` | Creates `ReferenceCounter`, the per-year sequence behind `ST-…` ticket numbers | Any release containing `src/lib/booking-reference.ts` |
| `20261016000000_platform_wallet_and_quotas` | Creates `PlatformWallet` and `PlatformTransaction`, adds `CompanyTripQuota`, `Booking.fundingSource`, `Company.autoPayEnabled`, `Company.maxSeatsPerBooking`, `CompanyBooking.expiredAt` | Any release containing `src/lib/platform-wallet.ts` or `/api/platform/bookings` |
| `20261021000000_route_quota_and_booking_creator` | Adds `Trip.routeKey`, `Trip.travelDate`, `CompanyRouteQuota`, `WalletTransaction.idempotencyKey`, `CompanyBooking.createdByUserId` | Any release containing `src/lib/company-quota.ts` or `/api/admin/company-bookings` |

`ReferenceCounter` is read with raw SQL by `nextBookingSerial`. Until the table
exists, **every booking fails** — this is not a change that rolls out gradually.

The same is true of `20261021000000`: `CompanyRouteQuota` is read inside the
transaction that creates a booking, so a missing table fails the whole request
— every company-funded admin booking returns a 500.

## Backfilling `Trip.routeKey` and `Trip.travelDate`

The migration adds the columns as NULL. Existing trips keep NULL until the
backfill runs, and a trip with a NULL `routeKey` is not counted against any
route quota. That is the safe direction — a trip that is not counted cannot
block a booking — but the quota is not enforced for that trip until it is
filled in.

```bash
DATABASE_URL="mysql://…" npx tsx scripts/backfill-route-keys.ts
```

The script derives the route key from the trip's `TripStop` rows and reports
the trips it could not derive, with the reason. A trip with no stops has no
route identity and stays NULL by design.

## Verifying a migration before it reaches production

The pattern that proved the last two migrations: apply the new SQL to a copy
of the current schema, then diff the result against the schema the Prisma
client expects. The two must match exactly.

```bash
mysqldump --no-data --skip-add-drop-table safro_travel_db > before.sql
mysql -e "CREATE DATABASE migtest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql migtest < before.sql
# revert the new objects, so migtest is at the pre-migration state
mysql migtest < prisma/migrations/<name>/migration.sql
mysqldump --no-data --skip-add-drop-table migtest > after.sql
diff before.sql after.sql
```

An empty diff means the migration produces exactly the intended schema. The
same files, applied in reverse, must return the database to the pre-migration
state — that is what `rollback.sql` is for, and it is worth testing the same
way.

