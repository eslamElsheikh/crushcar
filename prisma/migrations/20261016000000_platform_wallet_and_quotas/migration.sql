-- Platform wallet, per-trip company quotas, and the funding/limits columns.
--
-- This migration is MySQL/MariaDB syntax. `prisma migrate deploy` cannot be
-- used for it: prisma/migrations/migration_lock.toml declares
-- `provider = "sqlite"` and the older migrations in this folder are written in
-- SQLite syntax. Production is MariaDB, so replaying the folder there fails on
-- the first statement. Apply this file directly:
--
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261016000000_platform_wallet_and_quotas/migration.sql
--
-- Apply it BEFORE deploying the code that reads these tables. Booking
-- creation reads ReferenceCounter-style rows with raw SQL, and the platform
-- booking endpoint reads PlatformWallet in the same transaction.
--
-- Rollback: see rollback.sql in this folder. Read the warning in that file
-- first — after a platform booking exists the schema must not be rolled back
-- on its own.

-- ── Company: automatic payment and the per-booking seat cap ────────────
-- autoPayEnabled: charge the company's wallet/credit when the booking is
-- created instead of waiting for someone to press "confirm payment".
-- maxSeatsPerBooking: ceiling on seats in one company booking. NULL means
-- use the application default (10). Not a foreign key, so no lock is taken.
ALTER TABLE `Company`
  ADD COLUMN `autoPayEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `maxSeatsPerBooking` INTEGER NULL;

-- ── Booking: who paid ──────────────────────────────────────────────────
-- 'CUSTOMER' (the default, and the value every existing row already has) or
-- 'PLATFORM' when the platform's own wallet covered the seat. The default
-- backfills the existing rows, so no historical booking changes meaning.
ALTER TABLE `Booking`
  ADD COLUMN `fundingSource` VARCHAR(191) NOT NULL DEFAULT 'CUSTOMER';

-- ── CompanyBooking: expiry bookkeeping ──────────────────────────────────
-- Set when the sweep cancels an unpaid company booking, so an admin can tell
-- a timed-out booking from one a person cancelled. Mirrors Booking.expiredAt.
ALTER TABLE `CompanyBooking`
  ADD COLUMN `expiredAt` DATETIME(3) NULL;

-- ── Per-company seat quota on a trip ───────────────────────────────────
-- No row means the company has no limit on that trip. The count is made live
-- from the bookings, so there is no counter column to drift.
--
-- The two foreign keys cascade: a quota belongs to its company and to its
-- trip, so deleting either takes the quota with it rather than leaving an
-- orphan row behind. This matches prisma/schema.mysql.prisma exactly, which
-- is what `prisma db push` produces — a schema that disagrees with the
-- migration is a schema that drifts the first time anything rebuilds it.
--
-- There is no separate index on companyId: the foreign key creates the
-- supporting index itself, and naming it after the constraint is what
-- `db push` produces.
CREATE TABLE `CompanyTripQuota` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `tripId` VARCHAR(191) NOT NULL,
  `maxSeats` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `CompanyTripQuota_tripId_idx`(`tripId`),
  UNIQUE INDEX `CompanyTripQuota_companyId_tripId_key`(`companyId`, `tripId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CompanyTripQuota_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CompanyTripQuota_tripId_fkey`
    FOREIGN KEY (`tripId`) REFERENCES `Trip` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── The platform's own cash ─────────────────────────────────────────────
-- One row, id = 'main'. Integer piastres, not a float: the ledger has to
-- reconcile exactly (SUM(amountPiastres) == balancePiastres, no tolerance),
-- and Company.walletBalance is a Float that has drifted before.
CREATE TABLE `PlatformWallet` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'main',
  `balancePiastres` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Append-only ledger for the platform wallet ──────────────────────────
-- balanceAfterPiastres is the balance right after this row, so a broken chain
-- points at the exact row that disagrees.
-- idempotencyKey is unique: a replayed request cannot produce a second charge
-- or a second refund for the same booking. NULL for manual funding.
CREATE TABLE `PlatformTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `amountPiastres` INTEGER NOT NULL,
  `balanceAfterPiastres` INTEGER NOT NULL,
  `description` VARCHAR(191) NOT NULL DEFAULT '',
  `reference` VARCHAR(191) NOT NULL DEFAULT '',
  `idempotencyKey` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NULL,
  `actorEmail` VARCHAR(191) NOT NULL DEFAULT '',
  `method` VARCHAR(191) NOT NULL DEFAULT '',
  `attachmentUrl` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `PlatformTransaction_createdAt_idx`(`createdAt`),
  INDEX `PlatformTransaction_reference_idx`(`reference`),
  UNIQUE INDEX `PlatformTransaction_idempotencyKey_key`(`idempotencyKey`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
