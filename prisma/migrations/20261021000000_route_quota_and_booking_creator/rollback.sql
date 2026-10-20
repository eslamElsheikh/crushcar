-- Rollback for 20261021000000_route_quota_and_booking_creator.
--
--   mysql -u safro_user -p safro_travel_db < prisma/migrations/20261021000000_route_quota_and_booking_creator/rollback.sql
--
-- ══ READ THIS BEFORE RUNNING ══
--
-- Rolling the schema back while the code that uses it is still deployed will
-- break booking creation for super admins:
--   * The booking endpoint reads CompanyRouteQuota inside the same
--     transaction that creates the booking. A missing table fails the whole
--     request — every company-funded admin booking returns a 500.
--   * The quota counters read Trip.routeKey and Trip.travelDate. Without
--     those columns the query fails, and a failure inside the transaction
--     rolls back the booking.
--
-- Rolling the schema back AFTER the data exists is worse than leaving it in
-- place:
--   * DROP TABLE CompanyRouteQuota destroys the daily allowances. The
--     company's seat caps on each route and day are gone, and there is no
--     record of what they were. The caps that matter are the ones a company
--     negotiated, so this is the data that cannot be reconstructed.
--   * DROP COLUMN WalletTransaction.idempotencyKey removes the guarantee that
--     a retried request cannot charge twice. Existing rows keep their values
--     in the column until the column is dropped, so this is a silent
--     weakening, not a visible error.
--   * DROP COLUMN CompanyBooking.createdByUserId erases who created each
--     booking. The bookings stay; the record of who made them does not.
--
-- So the order is: deploy the code back to a version that does not use these
-- features, THEN roll the schema back. Take a dump first.
--
-- This file removes the table and the columns. It does not restore data that
-- was created after the migration.

-- The daily allowances. Read the warning above before running this: this
-- table holds the negotiated per-company seat caps, and dropping it cannot
-- be undone.
DROP TABLE IF EXISTS `CompanyRouteQuota`;

-- The creator of each company booking. The bookings themselves are not
-- touched; only the record of who made them is lost.
ALTER TABLE `CompanyBooking`
  DROP FOREIGN KEY `CompanyBooking_createdByUserId_fkey`,
  DROP INDEX `CompanyBooking_createdByUserId_idx`,
  DROP COLUMN `createdByUserId`;

-- The unique key that makes a retried charge harmless. The rows keep their
-- idempotencyKey values in the data; only the constraint is removed, so
-- nothing is lost — but a retry can now record a second charge.
ALTER TABLE `WalletTransaction`
  DROP INDEX `WalletTransaction_idempotencyKey_key`,
  DROP COLUMN `idempotencyKey`;

-- The route identity of each trip. The backfilled values are lost, but they
-- can be derived again from the TripStop rows with
-- scripts/backfill-route-keys.ts, so this one is recoverable.
ALTER TABLE `Trip`
  DROP INDEX `Trip_routeKey_travelDate_idx`,
  DROP COLUMN `travelDate`,
  DROP COLUMN `routeKey`;
