-- Rollback for 20261022000000_daily_company_cap_and_credit_reference.
--
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261022000000_daily_company_cap_and_credit_reference/rollback.sql
--
-- ══ READ THIS BEFORE RUNNING ══
--
-- Dropping Company.maxDailySeats removes the overall daily cap. Every
-- company that had one set goes back to having no daily cap, so it can hold
-- more seats on a date than it was allowed to. If the cap is still wanted,
-- write the values down first:
--
--   mysql -u safro_user -p safro_travel_db -e \
--     "SELECT id, name, maxDailySeats FROM Company WHERE maxDailySeats IS NOT NULL"
--
-- Dropping CreditLog.bookingReference loses the link between an automatic
-- credit increase and the booking that caused it. The limit changes
-- themselves survive — previousLimit, newLimit, changeAmount, reason, the
-- actor and the timestamp are all still there — but the booking reference is
-- gone, and a reason string is not something you can query on. Once
-- automatic credit increases have been granted, the rows written for them
-- cannot be traced back to their booking after this rollback.
--
-- So the order is: deploy the code back to a version that does not use
-- either column, THEN roll the schema back. And take a dump first.
--
-- This file removes the columns. It does not restore data that was created
-- after the migration.

-- The idempotency key on the booking rows. Dropping it means a retried
-- request can no longer be recognised as a replay, so the protection against
-- a double booking has to go with it.
ALTER TABLE `CompanyBooking`
  DROP INDEX `CompanyBooking_idempotencyKey_idx`,
  DROP COLUMN `idempotencyKey`;

ALTER TABLE `CreditLog`
  DROP COLUMN `bookingReference`;

ALTER TABLE `Company`
  DROP COLUMN `maxDailySeats`;
