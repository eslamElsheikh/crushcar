-- Unpaid customer bookings hold their seat until the payment window passes.
--
-- paymentExpiresAt is the deadline written when a booking is created. A sweep
-- cancels PENDING bookings once it passes and no screenshot is attached, which
-- releases the seat. expiredAt records that the cancellation came from the
-- sweep, so an admin can tell a timed-out booking from a customer cancelling.
--
-- MySQL syntax: this database is MariaDB, and the prisma/migrations folder
-- otherwise holds SQLite-flavoured SQL that only runs against the local dev db.

ALTER TABLE `Booking` ADD COLUMN `paymentExpiresAt` DATETIME(3) NULL;
ALTER TABLE `Booking` ADD COLUMN `expiredAt` DATETIME(3) NULL;

-- The sweep filters on (status, paymentExpiresAt); without this it scans.
CREATE INDEX `Booking_status_paymentExpiresAt_idx` ON `Booking`(`status`, `paymentExpiresAt`);