-- =====================================================================
-- Safro Travel — DASHBOARD AUDIT (READ ONLY)
--
-- Paste this whole block into phpMyAdmin → SQL tab → Run.
-- It changes NOTHING. It only prints what the database actually contains,
-- so you can compare it against what the dashboard shows you.
--
-- Run this BEFORE and AFTER the repair script and keep both outputs.
-- =====================================================================

SELECT '1. BOOKINGS BY STATUS' AS section;

SELECT 'customer' AS kind, status, COUNT(*) AS bookings, SUM(total) AS value
  FROM Booking GROUP BY status
UNION ALL
SELECT 'company', status, COUNT(*), SUM(total)
  FROM CompanyBooking GROUP BY status
UNION ALL
SELECT 'charter', status, COUNT(*), SUM(price)
  FROM CharterBooking GROUP BY status;


SELECT '2. WHAT THE REVENUE KPI SHOULD SHOW' AS section;

SELECT
  (SELECT COALESCE(SUM(total),0) FROM Booking
     WHERE status IN ('PAID','BOARDED'))            AS revenue_customer,
  (SELECT COALESCE(SUM(total),0) FROM CompanyBooking
     WHERE status IN ('PAID','BOARDED'))            AS revenue_company,
  (SELECT COALESCE(SUM(price),0) FROM CharterBooking
     WHERE status='confirmed')                      AS revenue_charter,
  (SELECT COALESCE(SUM(total),0) FROM Booking
     WHERE status IN ('PAID','BOARDED'))
  + (SELECT COALESCE(SUM(total),0) FROM CompanyBooking
     WHERE status IN ('PAID','BOARDED'))
  + (SELECT COALESCE(SUM(price),0) FROM CharterBooking
     WHERE status='confirmed')                      AS revenue_total;


SELECT '3. WHAT THE TOTAL BOOKINGS KPI SHOULD SHOW' AS section;

SELECT
  (SELECT COUNT(*) FROM Booking)          AS customer_bookings,
  (SELECT COUNT(*) FROM CompanyBooking)   AS company_bookings,
  (SELECT COUNT(*) FROM Booking) + (SELECT COUNT(*) FROM CompanyBooking) AS total_bookings;


SELECT '4. ACTIVE TRIPS — must exclude trips that already departed' AS section;

SELECT
  (SELECT COUNT(*) FROM Trip WHERE status='SCHEDULED')                        AS all_scheduled,
  (SELECT COUNT(*) FROM Trip WHERE status='SCHEDULED' AND departure>=NOW())   AS truly_active,
  (SELECT COUNT(*) FROM Trip WHERE status='SCHEDULED' AND departure< NOW())   AS stale_leaked_in,
  (SELECT COUNT(*) FROM Trip)                                                 AS total_routes;


SELECT '5. BALANCE DRIFT — stored column vs its source rows' AS section;

SELECT c.name,
       c.walletBalance                                        AS wallet_stored,
       COALESCE((SELECT SUM(w.amount) FROM WalletTransaction w
                  WHERE w.companyId=c.id),0)                   AS wallet_ledger,
       (c.walletBalance
        - COALESCE((SELECT SUM(w.amount) FROM WalletTransaction w
                     WHERE w.companyId=c.id),0))              AS wallet_drift,
       c.outstandingBalance                                   AS credit_stored,
       COALESCE((SELECT SUM(cb.paidOnCredit) FROM CompanyBooking cb
                  WHERE cb.companyId=c.id
                    AND cb.status IN ('PAID','BOARDED')),0)   AS credit_expected,
       (c.outstandingBalance
        - COALESCE((SELECT SUM(cb.paidOnCredit) FROM CompanyBooking cb
                     WHERE cb.companyId=c.id
                       AND cb.status IN ('PAID','BOARDED')),0)) AS credit_drift
  FROM Company c
 ORDER BY ABS(c.walletBalance) DESC;


SELECT '6. LEDGER ACTIVITY PER COMPANY (explains any drift above)' AS section;

SELECT c.name, w.type, COUNT(*) AS rows_n, SUM(w.amount) AS total,
       MIN(w.createdAt) AS first_at, MAX(w.createdAt) AS last_at
  FROM WalletTransaction w JOIN Company c ON c.id = w.companyId
 GROUP BY c.name, w.type
 ORDER BY c.name, w.type;


SELECT '6b. OVERSPEND — a charge larger than the wallet held at the time.' AS section;
SELECT 'ANY ROW HERE MEANS DO NOT TRUST THE LEDGER — fix by hand first.' AS warning;

SELECT ch.id, ch.price, ch.paidFromWallet, ch.paidOnCredit, ch.createdAt,
       (SELECT COALESCE(SUM(w.amount),0) FROM WalletTransaction w
         WHERE w.companyId = ch.companyId AND w.createdAt <= ch.createdAt) AS wallet_before
  FROM CharterBooking ch
 WHERE ch.status = 'confirmed'
   AND ch.id IN (SELECT reference FROM WalletTransaction WHERE type='BOOKING_CHARGE')
HAVING ch.paidFromWallet > GREATEST(wallet_before, 0);


SELECT '7. PIECE-BY-PIECE PRESENCE CHECK' AS section;
SELECT 'These counts are HOW MANY ARE PRESENT, not how many are missing.' AS note;
SELECT 'For the first four rows you WANT the number shown. For the last two you WANT 0.' AS note2;

SELECT 'Destination table (want 1)' AS item,
       (SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Destination') AS present
UNION ALL
SELECT 'Booking payment cols (want 6)',
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Booking'
           AND COLUMN_NAME IN ('paymentMethod','paymentProofUrl','paymentNotes',
                               'paymentStatus','paymentRejectReason','groupId'))
UNION ALL
SELECT 'User.image (want 1)',
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='User' AND COLUMN_NAME='image')
UNION ALL
SELECT 'DepositRequest cols (want 2)',
       (SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='DepositRequest'
           AND COLUMN_NAME IN ('method','notes'))
UNION ALL
SELECT 'Buses with NULL companyId (want 0)',
       (SELECT COUNT(*) FROM Bus WHERE companyId IS NULL)
UNION ALL
SELECT 'Dashboard indexes missing (want 0)',
       7 - (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA=DATABASE() AND INDEX_NAME IN (
           'Booking_status_createdAt_idx','Booking_tripId_status_idx','Booking_userId_status_idx',
           'CompanyBooking_companyId_status_idx','CompanyBooking_createdAt_status_idx',
           'Trip_status_departure_idx','CharterBooking_status_createdAt_idx'));

SELECT '8. DASHBOARD INDEXES — should be 7' AS section;

SELECT INDEX_NAME, TABLE_NAME
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA=DATABASE() AND INDEX_NAME IN (
       'Booking_status_createdAt_idx','Booking_tripId_status_idx','Booking_userId_status_idx',
       'CompanyBooking_companyId_status_idx','CompanyBooking_createdAt_status_idx',
       'Trip_status_departure_idx','CharterBooking_status_createdAt_idx')
 GROUP BY INDEX_NAME, TABLE_NAME
 ORDER BY INDEX_NAME;