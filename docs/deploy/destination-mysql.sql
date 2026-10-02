-- Safro V2: additive Destination table for MySQL / MariaDB production.
-- SAFE: creates one new table only. No ALTER, no DROP, no changes to existing tables.
-- Run with: mysql -u <user> -p <database> < docs/deploy/destination-mysql.sql
-- Requires: MySQL 8+ or MariaDB 10.5+ (utf8mb4). Uses IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS `Destination` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `slug` VARCHAR(191) NOT NULL,
  `nameAr` VARCHAR(191) NOT NULL,
  `nameEn` VARCHAR(191) NULL,
  `imageUrl` VARCHAR(191) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Destination_slug_key` (`slug`),
  INDEX `Destination_sortOrder_idx` (`sortOrder`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
