-- Company Route Quota Endpoints Migration
-- Adds originStationId and destinationStationId columns to CompanyRouteQuota
-- for endpoint-based route identity and querying.

ALTER TABLE `CompanyRouteQuota`
  ADD COLUMN `originStationId` VARCHAR(191) NULL,
  ADD COLUMN `destinationStationId` VARCHAR(191) NULL,
  ADD INDEX `CompanyRouteQuota_originStationId_destinationStationId_idx`(`originStationId`, `destinationStationId`);
