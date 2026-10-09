-- =============================================================
-- Safro Travel — production data repair
-- Run ONCE on the live database, after taking a mysqldump backup.
-- Every statement is idempotent. Read the output of each
-- SELECT before running the corresponding UPDATE.
--
-- Target: MySQL 8.0 / MariaDB 10.6+
-- =============================================================

-- -------------------------------------------------------------
-- STEP 0 — verify what is actually missing (read only)
-- -------------------------------------------------------------
SELECT 'Destination table' AS check_name,
       COUNT(*) AS present
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Destination';

SELECT 'Booking payment columns' AS check_name,
       COLUMN_NAME
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking'
   AND COLUMN_NAME IN ('paymentStatus','paymentProofUrl','paymentNotes',
                       'paymentMethod','paymentRejectReason','groupId');

-- -------------------------------------------------------------
-- STEP 1 — Dashboard stops counting stale trips as "active"
-- A trip left SCHEDULED after its departure, so "active trips"
-- reported trips that already ran. The transition cron fixes the
-- row; this catches up anything older than the last cron run.
-- -------------------------------------------------------------
UPDATE `Trip`
   SET `status` = 'IN_PROGRESS'
 WHERE `status` = 'SCHEDULED'
   AND `departure` <= NOW()
   AND `arrival` > NOW();

UPDATE `Trip`
   SET `status` = 'COMPLETED'
 WHERE `status` IN ('SCHEDULED','IN_PROGRESS')
   AND `arrival` <= NOW();

SELECT `status`, COUNT(*) AS trips FROM `Trip` GROUP BY `status`;

-- -------------------------------------------------------------
-- STEP 2 — Destination table
-- The code queries prisma.destination; without this table
-- /api/destinations throws and the homepage destinations
-- section disappears entirely.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Destination` (
  `id`        VARCHAR(191) NOT NULL,
  `slug`      VARCHAR(191) NOT NULL,
  `nameAr`    VARCHAR(191) NOT NULL,
  `nameEn`    VARCHAR(191) DEFAULT NULL,
  `imageUrl`  VARCHAR(191) DEFAULT NULL,
  `city`      VARCHAR(191) DEFAULT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive`  TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `Destination_slug_key` (`slug`),
  KEY `Destination_isActive_sortOrder_idx` (`isActive`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Run once after the table exists (upsert, safe to re-run):
--   npx tsx scripts/seed-destinations.ts

-- -------------------------------------------------------------
-- STEP 3 — Booking payment columns
-- The manual-transfer-proof flow writes these. If they are
-- missing, PATCH /api/bookings/:id with a proof 500s and the
-- proof image never reaches the admin bookings table.
--
-- MySQL 8.0 has no ADD COLUMN IF NOT EXISTS (MariaDB does), so
-- each column is added through a guarded dynamic statement.
-- -------------------------------------------------------------
SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND COLUMN_NAME='paymentMethod') = 0,
  'ALTER TABLE `Booking` ADD COLUMN `paymentMethod` VARCHAR(191) DEFAULT NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND COLUMN_NAME='paymentProofUrl') = 0,
  'ALTER TABLE `Booking` ADD COLUMN `paymentProofUrl` VARCHAR(191) DEFAULT NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND COLUMN_NAME='paymentNotes') = 0,
  'ALTER TABLE `Booking` ADD COLUMN `paymentNotes` VARCHAR(191) NOT NULL DEFAULT ''''',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND COLUMN_NAME='paymentStatus') = 0,
  'ALTER TABLE `Booking` ADD COLUMN `paymentStatus` VARCHAR(191) NOT NULL DEFAULT ''NONE''',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND COLUMN_NAME='paymentRejectReason') = 0,
  'ALTER TABLE `Booking` ADD COLUMN `paymentRejectReason` VARCHAR(191) NOT NULL DEFAULT ''''',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND COLUMN_NAME='groupId') = 0,
  'ALTER TABLE `Booking` ADD COLUMN `groupId` VARCHAR(191) DEFAULT NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- STEP 3b — User.image
-- src/lib/auth.ts reads user.image on every sign-in, so a missing column
-- breaks login for everyone, not just the profile page.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='User' AND COLUMN_NAME='image') = 0,
  'ALTER TABLE `User` ADD COLUMN `image` VARCHAR(191) DEFAULT NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- STEP 3c — DepositRequest.method / .notes
-- POST /api/company/deposit-requests writes both; without them a company
-- cannot submit a deposit request at all.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='DepositRequest' AND COLUMN_NAME='method') = 0,
  'ALTER TABLE `DepositRequest` ADD COLUMN `method` VARCHAR(191) DEFAULT NULL',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='DepositRequest' AND COLUMN_NAME='notes') = 0,
  'ALTER TABLE `DepositRequest` ADD COLUMN `notes` TEXT',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- -------------------------------------------------------------
-- STEP 4 — Indexes for the dashboard queries
-- Every aggregate the admin dashboard runs filters on these
-- columns; without indexes each page load scans the whole table.
-- -------------------------------------------------------------
-- Same MySQL 8.0 constraint: no ADD INDEX IF NOT EXISTS.
SET @db := DATABASE();

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND INDEX_NAME='Booking_status_createdAt_idx')=0,
  'ALTER TABLE `Booking` ADD INDEX `Booking_status_createdAt_idx` (`status`,`createdAt`)','DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND INDEX_NAME='Booking_tripId_status_idx')=0,
  'ALTER TABLE `Booking` ADD INDEX `Booking_tripId_status_idx` (`tripId`,`status`)','DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Booking' AND INDEX_NAME='Booking_userId_status_idx')=0,
  'ALTER TABLE `Booking` ADD INDEX `Booking_userId_status_idx` (`userId`,`status`)','DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='CompanyBooking' AND INDEX_NAME='CompanyBooking_companyId_status_idx')=0,
  'ALTER TABLE `CompanyBooking` ADD INDEX `CompanyBooking_companyId_status_idx` (`companyId`,`status`)','DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='CompanyBooking' AND INDEX_NAME='CompanyBooking_createdAt_status_idx')=0,
  'ALTER TABLE `CompanyBooking` ADD INDEX `CompanyBooking_createdAt_status_idx` (`createdAt`,`status`)','DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='Trip' AND INDEX_NAME='Trip_status_departure_idx')=0,
  'ALTER TABLE `Trip` ADD INDEX `Trip_status_departure_idx` (`status`,`departure`)','DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='CharterBooking' AND INDEX_NAME='CharterBooking_status_createdAt_idx')=0,
  'ALTER TABLE `CharterBooking` ADD INDEX `CharterBooking_status_createdAt_idx` (`status`,`createdAt`)','DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- -------------------------------------------------------------
-- STEP 5 — Bus ownership
-- Every Bus had companyId = NULL, so any query scoped by
-- trip.bus.companyId returned zero rows for every company.
-- Pick the owning company id before running the UPDATE.
-- -------------------------------------------------------------
SELECT `id`, `name`, `subdomain`, `isActive` FROM `Company`;

SELECT b.`id`, b.`name`, b.`companyId`, COUNT(t.`id`) AS trips
  FROM `Bus` b
  LEFT JOIN `Trip` t ON t.`busId` = b.`id`
 GROUP BY b.`id`, b.`name`, b.`companyId`;

-- Substitute the real company id, then run:
-- UPDATE `Bus` SET `companyId` = '<company-id>' WHERE `companyId` IS NULL;

-- -------------------------------------------------------------
-- STEP 6 — Balance reconciliation
-- walletBalance and outstandingBalance are denormalized columns
-- written from six call sites with no reconciliation, so they
-- drifted away from the ledger. Inspect first, then repair.
-- -------------------------------------------------------------

-- 6a. Wallet: stored balance vs the sum of its ledger rows.
SELECT c.`id`, c.`name`,
       c.`walletBalance`                                          AS storedVal,
       COALESCE((SELECT SUM(w.`amount`) FROM `WalletTransaction` w
                  WHERE w.`companyId` = c.`id`), 0)               AS ledger,
       c.`walletBalance` - COALESCE((SELECT SUM(w.`amount`) FROM `WalletTransaction` w
                  WHERE w.`companyId` = c.`id`), 0)               AS driftVal
  FROM `Company` c
HAVING ABS(driftVal) > 0.01;

-- 6b. Credit: stored outstanding vs what bookings actually put on credit.
--     Refunds already decremented outstandingBalance, so this is the
--     net figure: paid on credit, minus what has been settled.
SELECT c.`id`, c.`name`,
       c.`outstandingBalance`                                     AS storedVal,
       COALESCE((SELECT SUM(cb.`paidOnCredit`) FROM `CompanyBooking` cb
                  WHERE cb.`companyId` = c.`id`
                    AND cb.`status` IN ('PAID','BOARDED')), 0)    AS fromBookings,
       c.`outstandingBalance` - COALESCE((SELECT SUM(cb.`paidOnCredit`)
                  FROM `CompanyBooking` cb
                  WHERE cb.`companyId` = c.`id`
                    AND cb.`status` IN ('PAID','BOARDED')), 0)    AS driftVal
  FROM `Company` c
HAVING ABS(driftVal) > 0.01;

-- Repair, once you have confirmed the drift is real and not a
-- settlement recorded outside the ledger. Take a backup first:
-- UPDATE `Company` c
--    SET c.`walletBalance` = COALESCE((SELECT SUM(w.`amount`)
--          FROM `WalletTransaction` w WHERE w.`companyId` = c.`id`), 0)
--  WHERE ABS(c.`walletBalance` - COALESCE((SELECT SUM(w.`amount`)
--          FROM `WalletTransaction` w WHERE w.`companyId` = c.`id`), 0)) > 0.01;

-- -------------------------------------------------------------
-- STEP 7 — Confirm
-- Expected: no drift rows, every trip with arrival <= now is
-- COMPLETED, Destination exists, Booking has the payment columns.
-- -------------------------------------------------------------
-- MySQL 8 does not allow qualified names in HAVING, so the drift
-- comparison goes in WHERE.
SELECT 'wallet drift remaining' AS check_name, COUNT(*) AS bad
  FROM `Company` c
 WHERE ABS(c.`walletBalance` - COALESCE((SELECT SUM(w.`amount`)
        FROM `WalletTransaction` w WHERE w.`companyId` = c.`id`), 0)) > 0.01;

SELECT 'credit drift remaining' AS check_name, COUNT(*) AS bad
  FROM `Company` c
 WHERE ABS(c.`outstandingBalance` - COALESCE((SELECT SUM(cb.`paidOnCredit`)
        FROM `CompanyBooking` cb WHERE cb.`companyId` = c.`id`
          AND cb.`status` IN ('PAID','BOARDED')), 0)) > 0.01;

SELECT 'stale SCHEDULED trips' AS check_name, COUNT(*) AS bad
  FROM `Trip` WHERE `status` = 'SCHEDULED' AND `departure` <= NOW();
