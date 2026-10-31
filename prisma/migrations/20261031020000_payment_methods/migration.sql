-- CreateTable PaymentMethod
CREATE TABLE IF NOT EXISTS `PaymentMethod` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `accountHolder` VARCHAR(191) NOT NULL DEFAULT '',
    `accountNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `instructions` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Booking` ADD COLUMN `paymentMethodId` VARCHAR(191) NULL;
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `DepositRequest` ADD COLUMN `paymentMethodId` VARCHAR(191) NULL;
ALTER TABLE `DepositRequest` ADD CONSTRAINT `DepositRequest_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
