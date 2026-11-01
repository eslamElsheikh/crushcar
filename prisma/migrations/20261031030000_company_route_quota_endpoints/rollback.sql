-- Company Route Quota Endpoints Rollback
-- Drops index and columns added by migration.

ALTER TABLE `CompanyRouteQuota`
  DROP INDEX `CompanyRouteQuota_originStationId_destinationStationId_idx`,
  DROP COLUMN `destinationStationId`,
  DROP COLUMN `originStationId`;
