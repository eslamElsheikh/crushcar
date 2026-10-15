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

`ReferenceCounter` is read with raw SQL by `nextBookingSerial`. Until the table
exists, **every booking fails** — this is not a change that rolls out gradually.
