-- The overall daily company cap, and the booking a credit change belongs to.
--
-- This migration is MySQL/MariaDB syntax. `prisma migrate deploy` cannot be
-- used for it: prisma/migrations/migration_lock.toml declares
-- `provider = "sqlite"` and the older migrations in this folder are written in
-- SQLite syntax. Production is MariaDB, so replaying the folder there fails on
-- the first statement. Apply this file directly:
--
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261022000000_daily_company_cap_and_credit_reference/migration.sql
--
-- Apply it AFTER 20261016000000 and 20261021000000, and BEFORE deploying the
-- code that reads these columns. The daily-cap check reads
-- Company.maxDailySeats inside the booking transaction, so a missing column
-- fails every company booking.
--
-- Nothing here has been applied to production.

-- ── The overall daily seat cap ─────────────────────────────────────────
-- How many seats a company may hold on ONE travel date, counted across every
-- trip, route, direction and bus on that date.
--
-- NULL means no overall daily cap, which is the same as no limit. That is
-- what every company has today, so nothing changes for any of them until an
-- administrator sets a value.
--
-- It is not the same as Company.maxSeatsPerBooking, which is per booking
-- request. The smaller of the two is what applies, and the two are checked
-- independently.
ALTER TABLE `Company`
  ADD COLUMN `maxDailySeats` INTEGER NULL;

-- ── The booking a credit change belongs to ─────────────────────────────
-- A credit limit raised automatically, to cover a booking that the company's
-- own funds could not, must be traceable to that booking. The reason field is
-- free text and cannot be queried on, so the reference gets its own column.
--
-- NULL for a limit a person changed by hand.
ALTER TABLE `CreditLog`
  ADD COLUMN `bookingReference` VARCHAR(191) NULL;

-- ── Why there is no index on Trip.travelDate ───────────────────────────
-- The daily cap counts a company's bookings on a date, and that count is
-- driven from CompanyBooking, which already has @@index([companyId, status]).
-- The joined Trip.travelDate is a predicate on a joined primary-key row, not
-- a search key, so an index on it would not be used by this query.
--
-- The scan for legacy trips with no stored route key uses
-- `WHERE routeKey IS NULL`, and the existing @@index([routeKey, travelDate])
-- serves that as its leftmost column. So no new index is added.
