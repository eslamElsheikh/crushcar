-- Drop Invoice table (invoices feature removed; payments are Vodafone Cash + InstaPay only).
-- Wallet/credit-balance columns on Company are untouched.
PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS "Invoice";
PRAGMA foreign_keys=ON;
