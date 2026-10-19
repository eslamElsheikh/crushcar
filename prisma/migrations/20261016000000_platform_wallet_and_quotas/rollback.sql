-- Rollback for 20261016000000_platform_wallet_and_quotas.
--
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261016000000_platform_wallet_and_quotas/rollback.sql
--
-- ══ READ THIS BEFORE RUNNING ══
--
-- Rolling the schema back while the code that uses it is still deployed will
-- break every platform booking: the endpoint reads PlatformWallet in the same
-- transaction that creates the booking, and a missing table fails the whole
-- request.
--
-- Rolling the schema back AFTER platform bookings exist is worse than leaving
-- it in place:
--   * DROP COLUMN fundingSource turns platform bookings back into 'CUSTOMER',
--     so they start counting as customer revenue again.
--   * DROP TABLE PlatformTransaction destroys the cash record. The money that
--     was spent cannot be reconciled against anything afterwards.
--
-- So the order is: deploy the code back to a version that does not use the
-- feature, THEN roll the schema back. After a platform booking has been made,
-- leave the schema alone.
--
-- This file removes the tables and columns. It does not restore data that
-- was created after the migration.

DROP TABLE IF EXISTS `PlatformTransaction`;
DROP TABLE IF EXISTS `PlatformWallet`;
DROP TABLE IF EXISTS `CompanyTripQuota`;

-- Restore the default so a booking created by an older build still reads
-- 'CUSTOMER' after the column is gone.
ALTER TABLE `CompanyBooking`
  DROP COLUMN `expiredAt`;

ALTER TABLE `Booking`
  DROP COLUMN `fundingSource`;

ALTER TABLE `Company`
  DROP COLUMN `maxSeatsPerBooking`,
  DROP COLUMN `autoPayEnabled`;
