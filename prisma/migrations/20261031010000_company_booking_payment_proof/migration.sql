-- Pre-check: verify column does not exist yet
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CompanyBooking' AND COLUMN_NAME = 'paymentProofUrl';

ALTER TABLE `CompanyBooking` ADD COLUMN `paymentProofUrl` VARCHAR(191) NULL;
