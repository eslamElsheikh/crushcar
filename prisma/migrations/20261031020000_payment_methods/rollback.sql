ALTER TABLE `Booking` DROP FOREIGN KEY `Booking_paymentMethodId_fkey`;
ALTER TABLE `Booking` DROP COLUMN `paymentMethodId`;

ALTER TABLE `DepositRequest` DROP FOREIGN KEY `DepositRequest_paymentMethodId_fkey`;
ALTER TABLE `DepositRequest` DROP COLUMN `paymentMethodId`;

DROP TABLE IF EXISTS `PaymentMethod`;
