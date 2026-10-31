-- Task 2: Company seat quota semantics.
--
-- Adds the per-route daily seat quota set by super admin for the company.
-- Evaluated on the outbound date per route; round-trip counts as 1 seat.
-- NULL means no quota limit.
--
-- Apply directly to MariaDB/MySQL:
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261031000000_company_seat_quota/migration.sql

ALTER TABLE `Company`
  ADD COLUMN `seatQuota` INTEGER NULL;
