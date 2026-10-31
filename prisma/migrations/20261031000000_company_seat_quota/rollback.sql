-- Rollback for 20261031000000_company_seat_quota.
--
-- Drops Company.seatQuota.
--
-- Apply directly to MariaDB/MySQL:
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261031000000_company_seat_quota/rollback.sql

ALTER TABLE `Company`
  DROP COLUMN `seatQuota`;
