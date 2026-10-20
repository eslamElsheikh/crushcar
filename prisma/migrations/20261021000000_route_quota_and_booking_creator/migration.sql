-- Route-level daily quotas, trip route identity, and the booking creator.
--
-- This migration is MySQL/MariaDB syntax. `prisma migrate deploy` cannot be
-- used for it: prisma/migrations/migration_lock.toml declares
-- `provider = "sqlite"` and the older migrations in this folder are written in
-- SQLite syntax. Production is MariaDB, so replaying the folder there fails on
-- the first statement. Apply this file directly:
--
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261021000000_route_quota_and_booking_creator/migration.sql
--
-- Apply it BEFORE deploying the code that reads these columns and tables.
--
-- Rollback: see rollback.sql in this folder. Read the warning in that file
-- first — after quota rows exist the schema must not be rolled back on its
-- own.

-- ── Trip: the route it runs and the day it runs ──────────────────────────
-- routeKey is the ordered station-id sequence of the trip, '|'-joined
-- ("s1|s2|s3"). It is the identity of the route, and it is order-sensitive:
-- the same stations in the other direction are a different route, because
-- they are a different journey with different stops and different prices.
--
-- travelDate is the travel day as a Cairo calendar day, "yyyy-mm-dd". It is
-- stored as text rather than a date because the quota is keyed by the
-- business day, and the business day is what Africa/Cairo says it is, not
-- what UTC says.
--
-- Both are NULL for trips that exist already; the backfill script
-- (scripts/backfill-route-keys.ts) fills them in from the trip's stops, and
-- lists the trips it could not derive. Until a trip is backfilled it is not
-- counted against any route quota, which is the safe direction: a trip that
-- is not counted cannot block a booking.
ALTER TABLE `Trip`
  ADD COLUMN `routeKey` VARCHAR(191) NULL,
  ADD COLUMN `travelDate` VARCHAR(191) NULL,
  ADD INDEX `Trip_routeKey_travelDate_idx`(`routeKey`, `travelDate`);

-- ── The daily allowance for a company on a route ─────────────────────────
-- One row per company, route and travel day. The same company may run
-- several buses on the same route on the same day, and this row caps all of
-- them together, which is the point: the cap is on the company, not on the
-- bus.
--
-- maxSeats NULL means no limit for that company on that route and day.
-- The count of used seats is made live from the bookings, so there is no
-- counter column here to drift out of step with the truth.
--
-- This table is additive. The per-trip CompanyTripQuota table stays as it
-- is: a company may have a tighter cap on one particular trip, and the
-- effective limit is the smallest of the two.
CREATE TABLE `CompanyRouteQuota` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `routeKey` VARCHAR(191) NOT NULL,
  `travelDate` VARCHAR(191) NOT NULL,
  `maxSeats` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CompanyRouteQuota_companyId_routeKey_travelDate_key`(`companyId`, `routeKey`, `travelDate`),
  INDEX `CompanyRouteQuota_routeKey_travelDate_idx`(`routeKey`, `travelDate`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CompanyRouteQuota_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── WalletTransaction: one charge per request ────────────────────────────
-- A unique key, so a retried request cannot record the same charge twice.
-- NULL for rows that are not tied to one specific request, and for every row
-- written before this column existed — NULLs do not collide in a MySQL
-- UNIQUE index, so the old rows are unaffected.
ALTER TABLE `WalletTransaction`
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `WalletTransaction_idempotencyKey_key`(`idempotencyKey`);

-- ── CompanyBooking: who made it ──────────────────────────────────────────
-- The booking belongs to the company (companyId); this column records the
-- person who made it. It is NULL for bookings a company made itself, and
-- set when a super admin books on the company's behalf.
--
-- ON DELETE SET NULL, not CASCADE: deleting a user must not delete the
-- company's bookings, which are the company's financial records.
ALTER TABLE `CompanyBooking`
  ADD COLUMN `createdByUserId` VARCHAR(191) NULL,
  ADD INDEX `CompanyBooking_createdByUserId_idx`(`createdByUserId`),
  ADD CONSTRAINT `CompanyBooking_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
