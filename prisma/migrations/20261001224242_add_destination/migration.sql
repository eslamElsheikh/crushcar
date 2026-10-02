-- CreateTable
CREATE TABLE "TripRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "fromStationId" TEXT NOT NULL,
    "toStationId" TEXT NOT NULL,
    "passengerCount" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripRequest_fromStationId_fkey" FOREIGN KEY ("fromStationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TripRequest_toStationId_fkey" FOREIGN KEY ("toStationId") REFERENCES "Station" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepositRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seatLabel" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL DEFAULT '',
    "passengerPhone" TEXT NOT NULL DEFAULT '',
    "passengerHotel" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    "boarded" BOOLEAN NOT NULL DEFAULT false,
    "boardedAt" DATETIME,
    "total" REAL NOT NULL,
    "roundTripGroupId" TEXT,
    "returnForId" TEXT,
    "fromStopOrder" INTEGER NOT NULL DEFAULT 1,
    "toStopOrder" INTEGER NOT NULL DEFAULT 1,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "cancellationReason" TEXT DEFAULT '',
    "refundAmount" REAL,
    "cancellationFee" REAL,
    "refundProcessedAt" DATETIME,
    "refundProcessedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("boarded", "boardedAt", "cancellationFee", "cancellationReason", "cancelledAt", "cancelledBy", "createdAt", "fromStopOrder", "id", "paidAt", "passengerName", "passengerPhone", "reference", "refundAmount", "returnForId", "roundTripGroupId", "seatLabel", "status", "toStopOrder", "total", "tripId", "userId") SELECT "boarded", "boardedAt", "cancellationFee", "cancellationReason", "cancelledAt", "cancelledBy", "createdAt", "fromStopOrder", "id", "paidAt", "passengerName", "passengerPhone", "reference", "refundAmount", "returnForId", "roundTripGroupId", "seatLabel", "status", "toStopOrder", "total", "tripId", "userId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");
CREATE TABLE "new_Bus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bus" ("companyId", "createdAt", "id", "name", "seatCount", "type") SELECT "companyId", "createdAt", "id", "name", "seatCount", "type" FROM "Bus";
DROP TABLE "Bus";
ALTER TABLE "new_Bus" RENAME TO "Bus";
CREATE TABLE "new_CompanyBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "tripId" TEXT NOT NULL,
    "seatLabel" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL DEFAULT '',
    "passengerPhone" TEXT NOT NULL DEFAULT '',
    "passengerHotel" TEXT NOT NULL DEFAULT '',
    "bookingType" TEXT NOT NULL DEFAULT 'FOR_EMPLOYEE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "total" REAL NOT NULL,
    "paidFromWallet" REAL NOT NULL DEFAULT 0,
    "paidOnCredit" REAL NOT NULL DEFAULT 0,
    "fromStopOrder" INTEGER NOT NULL DEFAULT 1,
    "toStopOrder" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "cancellationReason" TEXT DEFAULT '',
    "refundAmount" REAL,
    "cancellationFee" REAL,
    "refundProcessedAt" DATETIME,
    "refundProcessedBy" TEXT,
    "boardedAt" DATETIME,
    "roundTripGroupId" TEXT,
    CONSTRAINT "CompanyBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompanyBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CompanyCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CompanyBooking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CompanyBooking" ("boardedAt", "bookingType", "cancelledAt", "companyId", "createdAt", "customerId", "fromStopOrder", "id", "paidAt", "paidFromWallet", "paidOnCredit", "passengerName", "passengerPhone", "reference", "seatLabel", "status", "toStopOrder", "total", "tripId") SELECT "boardedAt", "bookingType", "cancelledAt", "companyId", "createdAt", "customerId", "fromStopOrder", "id", "paidAt", "paidFromWallet", "paidOnCredit", "passengerName", "passengerPhone", "reference", "seatLabel", "status", "toStopOrder", "total", "tripId" FROM "CompanyBooking";
DROP TABLE "CompanyBooking";
ALTER TABLE "new_CompanyBooking" RENAME TO "CompanyBooking";
CREATE UNIQUE INDEX "CompanyBooking_reference_key" ON "CompanyBooking"("reference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");
