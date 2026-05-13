-- CreateInitialSchema
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL
);

CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Bus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT
);

CREATE TABLE "BusLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "busId" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "aisleAfter" INTEGER NOT NULL DEFAULT 2,
    "colsPerRow" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "BusLayout_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus" ("id") ON DELETE CASCADE
);

CREATE TABLE "Seat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "layoutId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NORMAL',
    "price" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Seat_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "BusLayout" ("id") ON DELETE CASCADE
);

CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "busId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departure" DATETIME NOT NULL,
    "arrival" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus" ("id") ON DELETE RESTRICT
);

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seatLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    "boarded" INTEGER NOT NULL DEFAULT 0,
    "boardedAt" DATETIME,
    "total" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT,
    CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Company_subdomain_key" ON "Company"("subdomain");
CREATE UNIQUE INDEX "BusLayout_busId_key" ON "BusLayout"("busId");
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "Bus_companyId_idx" ON "Bus"("companyId");
CREATE INDEX "Trip_busId_idx" ON "Trip"("busId");
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX "Booking_tripId_idx" ON "Booking"("tripId");