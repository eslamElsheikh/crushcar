-- Sequential booking references.
--
-- ReferenceCounter holds one row per calendar year. `value` is the last serial
-- handed out; the next ticket number reads it and bumps it inside the same
-- transaction that creates the booking, so a rolled-back booking does not burn
-- a number.
--
-- The bump is INSERT ... ON DUPLICATE KEY UPDATE, not a Prisma upsert. Prisma
-- only emits a single atomic statement for native upsert on PostgreSQL and
-- SQLite; on MySQL/MariaDB it emulates one as a read followed by a write, so
-- the first two bookings of a year would race on the insert. See
-- src/lib/booking-reference.ts.
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the code that writes
-- references. The code path does a raw SELECT on this table, and until the
-- table exists the first booking of the day fails.
--
-- MySQL syntax: this database is MariaDB, and the prisma/migrations folder
-- otherwise holds SQLite-flavoured SQL that only runs against the local dev db.
--
-- The primary key is `id`, not `key`: KEY is reserved in MySQL.

CREATE TABLE `ReferenceCounter` (
  `id` VARCHAR(191) NOT NULL,
  `value` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;