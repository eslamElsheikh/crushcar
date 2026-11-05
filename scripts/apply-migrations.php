<?php
// Production migration runner and verification for safrotravel.com
// Idempotent: checks table/column/index existence and executes with duplicate-error safety.
//
// Preview:  https://www.safrotravel.com/apply-migrations.php?key=safro_extract_2026
// Execute:  https://www.safrotravel.com/apply-migrations.php?key=safro_extract_2026&go=1

declare(strict_types=1);

const DEPLOY_KEY = 'safro_extract_2026';
const APP_ROOT = '/home/safro/travel-app';
const STANDALONE = APP_ROOT . '/.next/standalone';

// Errors that mean "this exact thing already exists" -> safe skip.
// 1050 table exists, 1060 duplicate column, 1061 duplicate index/key name,
// 1022 duplicate key, 1826 duplicate FK (MySQL), 121 duplicate FK name.
const DUP_ERRNOS = [1050, 1060, 1061, 1022, 1826, 121];

header('Content-Type: text/plain; charset=utf-8');
@set_time_limit(300);

function out(string $m): void { echo $m . "\n"; flush(); }

if (($_GET['key'] ?? '') !== DEPLOY_KEY) {
    http_response_code(403);
    out('FORBIDDEN');
    exit;
}
$go = ($_GET['go'] ?? '') === '1';

// ---- database connection ----
$mysqlUrl = null;
foreach ([STANDALONE . '/.env', STANDALONE . '/.env.production', APP_ROOT . '/.env', APP_ROOT . '/.env.production'] as $f) {
    if (is_file($f) && preg_match('/^DATABASE_URL=(mysql:\/\/.*)$/m', (string) file_get_contents($f), $m)) {
        $mysqlUrl = trim($m[1]);
        break;
    }
}
if (!$mysqlUrl) { out('FATAL: no mysql DATABASE_URL in any .env'); exit(1); }
if (!preg_match('#^mysql:\/\/([^:]+):(.+)@([^/:?]+)\/([^?]+)#', $mysqlUrl, $m)) { out('FATAL: url parse failed'); exit(1); }
[, $user, $pass, $host, $dbname] = $m;

try {
    $db = new PDO("mysql:host={$host};dbname={$dbname};charset=utf8mb4", $user, rawurldecode($pass), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
} catch (Throwable $e) {
    out('FATAL: connect failed: ' . $e->getMessage());
    exit(1);
}
out('target: ' . $dbname . '  server: ' . $db->query('SELECT VERSION()')->fetchColumn());
out('mode: ' . ($go ? 'EXECUTE' : 'PREVIEW (add &go=1 to execute)'));
out('');

function table_exists(PDO $db, string $t): bool {
    return (bool) $db->query("SHOW TABLES LIKE " . $db->quote($t))->fetchColumn();
}
function column_exists(PDO $db, string $t, string $c): bool {
    if (!table_exists($db, $t)) return false;
    foreach ($db->query("SHOW COLUMNS FROM `$t`") as $row) {
        if ($row['Field'] === $c) return true;
    }
    return false;
}
function index_exists(PDO $db, string $t, string $i): bool {
    if (!table_exists($db, $t)) return false;
    foreach ($db->query("SHOW INDEX FROM `$t`") as $row) {
        if ($row['Key_name'] === $i) return true;
    }
    return false;
}

$state = [
    '20261016000000_platform_wallet_and_quotas' => [
        'tables'  => ['CompanyTripQuota', 'PlatformWallet', 'PlatformTransaction'],
        'columns' => [
            'Company'        => ['autoPayEnabled', 'maxSeatsPerBooking'],
            'Booking'        => ['fundingSource'],
            'CompanyBooking' => ['expiredAt'],
        ],
        'indexes' => [],
        'sql' => "
            CREATE TABLE IF NOT EXISTS `CompanyTripQuota` (
                `id` VARCHAR(191) NOT NULL,
                `companyId` VARCHAR(191) NOT NULL,
                `tripId` VARCHAR(191) NOT NULL,
                `maxSeats` INT NULL,
                `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                `updatedAt` DATETIME(3) NOT NULL,
                PRIMARY KEY (`id`)
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `PlatformWallet` (
                `id` VARCHAR(191) NOT NULL,
                `balance` INT NOT NULL DEFAULT 0,
                `updatedAt` DATETIME(3) NOT NULL,
                PRIMARY KEY (`id`)
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `PlatformTransaction` (
                `id` VARCHAR(191) NOT NULL,
                `type` VARCHAR(191) NOT NULL,
                `amount` INT NOT NULL,
                `balanceAfter` INT NOT NULL,
                `description` TEXT NOT NULL,
                `reference` VARCHAR(191) NULL,
                `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (`id`)
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

            ALTER TABLE `Company` ADD COLUMN IF NOT EXISTS `autoPayEnabled` BOOLEAN NOT NULL DEFAULT true;
            ALTER TABLE `Company` ADD COLUMN IF NOT EXISTS `maxSeatsPerBooking` INT NULL;
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `fundingSource` VARCHAR(191) NOT NULL DEFAULT 'CUSTOMER';
            ALTER TABLE `CompanyBooking` ADD COLUMN IF NOT EXISTS `expiredAt` DATETIME(3) NULL;
        ",
    ],
    '20261021000000_route_quota_and_booking_creator' => [
        'tables'  => ['CompanyRouteQuota'],
        'columns' => [
            'Trip'            => ['routeKey', 'travelDate'],
            'CompanyBooking'  => ['createdByUserId'],
            'WalletTransaction' => ['idempotencyKey'],
        ],
        'indexes' => [
            'Trip'              => ['Trip_routeKey_travelDate_idx'],
            'WalletTransaction' => ['WalletTransaction_idempotencyKey_key'],
            'CompanyBooking'    => ['CompanyBooking_createdByUserId_idx'],
        ],
        'sql' => "
            CREATE TABLE IF NOT EXISTS `CompanyRouteQuota` (
                `id` VARCHAR(191) NOT NULL,
                `companyId` VARCHAR(191) NOT NULL,
                `routeKey` VARCHAR(191) NOT NULL,
                `travelDate` VARCHAR(191) NOT NULL,
                `maxSeats` INT NULL,
                `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                `updatedAt` DATETIME(3) NOT NULL,
                PRIMARY KEY (`id`)
            ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

            ALTER TABLE `Trip` ADD COLUMN IF NOT EXISTS `routeKey` VARCHAR(191) NULL;
            ALTER TABLE `Trip` ADD COLUMN IF NOT EXISTS `travelDate` VARCHAR(191) NULL;
            ALTER TABLE `CompanyBooking` ADD COLUMN IF NOT EXISTS `createdByUserId` VARCHAR(191) NULL;
            ALTER TABLE `WalletTransaction` ADD COLUMN IF NOT EXISTS `idempotencyKey` VARCHAR(191) NULL;
            ALTER TABLE `Trip` ADD INDEX IF NOT EXISTS `Trip_routeKey_travelDate_idx` (`routeKey`, `travelDate`);
            ALTER TABLE `CompanyBooking` ADD INDEX IF NOT EXISTS `CompanyBooking_createdByUserId_idx` (`createdByUserId`);
        ",
    ],
    '20261022000000_daily_company_cap_and_credit_reference' => [
        'tables'  => [],
        'columns' => [
            'Company'        => ['maxDailySeats'],
            'CreditLog'      => ['bookingReference'],
            'CompanyBooking' => ['idempotencyKey'],
        ],
        'indexes' => [
            'CompanyBooking' => ['CompanyBooking_idempotencyKey_idx'],
        ],
        'sql' => "
            ALTER TABLE `Company` ADD COLUMN IF NOT EXISTS `maxDailySeats` INT NULL;
            ALTER TABLE `CreditLog` ADD COLUMN IF NOT EXISTS `bookingReference` VARCHAR(191) NULL;
            ALTER TABLE `CompanyBooking` ADD COLUMN IF NOT EXISTS `idempotencyKey` VARCHAR(191) NULL;
            ALTER TABLE `CompanyBooking` ADD INDEX IF NOT EXISTS `CompanyBooking_idempotencyKey_idx` (`idempotencyKey`);
        ",
    ],
    '20261031000000_company_seat_quota' => [
        'tables'  => [],
        'columns' => [
            'Company' => ['seatQuota'],
        ],
        'indexes' => [],
        'sql' => "ALTER TABLE `Company` ADD COLUMN IF NOT EXISTS `seatQuota` INT NULL;",
    ],
    '20261031010000_company_booking_payment_proof' => [
        'tables'  => [],
        'columns' => [
            'CompanyBooking' => ['paymentProofUrl'],
        ],
        'indexes' => [],
        'sql' => "ALTER TABLE `CompanyBooking` ADD COLUMN IF NOT EXISTS `paymentProofUrl` VARCHAR(191) NULL;",
    ],
    '20261031020000_payment_methods' => [
        'tables'  => ['PaymentMethod'],
        'columns' => [
            'Booking'        => ['paymentMethodId'],
            'DepositRequest' => ['paymentMethodId'],
        ],
        'indexes' => [],
        'sql' => "
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

            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `paymentMethodId` VARCHAR(191) NULL;
            ALTER TABLE `DepositRequest` ADD COLUMN IF NOT EXISTS `paymentMethodId` VARCHAR(191) NULL;
        ",
    ],
    '20261031030000_company_route_quota_endpoints' => [
        'tables'  => [],
        'columns' => [
            'CompanyRouteQuota' => ['originStationId', 'destinationStationId'],
        ],
        'indexes' => [
            'CompanyRouteQuota' => ['CompanyRouteQuota_originStationId_destinationStationId_idx'],
        ],
        'sql' => "
            ALTER TABLE `CompanyRouteQuota` ADD COLUMN IF NOT EXISTS `originStationId` VARCHAR(191) NULL;
            ALTER TABLE `CompanyRouteQuota` ADD COLUMN IF NOT EXISTS `destinationStationId` VARCHAR(191) NULL;
            ALTER TABLE `CompanyRouteQuota` ADD INDEX IF NOT EXISTS `CompanyRouteQuota_originStationId_destinationStationId_idx` (`originStationId`, `destinationStationId`);
        ",
    ],
    'repair_booking_payment_columns' => [
        'tables'  => [],
        'columns' => [
            'Booking' => [
                'paymentMethod', 'paymentProofUrl', 'paymentNotes',
                'paymentStatus', 'paymentRejectReason', 'groupId',
                'refundProcessedAt', 'refundProcessedBy',
            ],
        ],
        'indexes' => [],
        'sql' => "
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `paymentMethod` VARCHAR(191) NULL;
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `paymentProofUrl` VARCHAR(191) NULL;
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `paymentNotes` VARCHAR(191) NOT NULL DEFAULT '';
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'NONE';
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `paymentRejectReason` VARCHAR(191) NOT NULL DEFAULT '';
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `groupId` VARCHAR(191) NULL;
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `refundProcessedAt` DATETIME(3) NULL;
            ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `refundProcessedBy` VARCHAR(191) NULL;
        ",
    ],
    '20261102000000_trip_company_price' => [
        'tables'  => [],
        'columns' => [
            'Trip'     => ['companyPrice'],
            'TripStop' => ['companyPriceFromOrigin'],
        ],
        'indexes' => [],
        'sql' => "
            ALTER TABLE `Trip` ADD COLUMN IF NOT EXISTS `companyPrice` DOUBLE NULL;
            ALTER TABLE `TripStop` ADD COLUMN IF NOT EXISTS `companyPriceFromOrigin` DOUBLE NULL;
        ",
    ],
];

$failed = false;

foreach ($state as $id => $st) {
    out("=== $id ===");

    $pending = [];
    foreach ($st['tables'] as $t) if (!table_exists($db, $t)) $pending[] = "CREATE TABLE $t";
    foreach ($st['columns'] as $t => $cs) foreach ($cs as $c) if (!column_exists($db, $t, $c)) $pending[] = "ADD COLUMN $t.$c";
    foreach ($st['indexes'] as $t => $is) foreach ($is as $i) if (!index_exists($db, $t, $i)) $pending[] = "ADD INDEX $t.$i";

    if (!$pending) {
        out('  already fully applied — nothing to do');
        out('');
        continue;
    }
    out('  pending items (' . count($pending) . '):');
    foreach ($pending as $p) out("    - $p");

    if (!$go) {
        out('  PREVIEW only — not executing');
        out('');
        continue;
    }

    $sql = $st['sql'];

    // Split statements on semicolon
    $lines = preg_split('/\r?\n/', $sql);
    $clean = [];
    foreach ($lines as $ln) {
        $t = trim($ln);
        if ($t === '' || str_starts_with($t, '--')) continue;
        $clean[] = $ln;
    }
    $statements = [];
    $buf = '';
    foreach (preg_split('/\r?\n/', implode("\n", $clean)) as $ln) {
        $buf .= $ln . "\n";
        if (str_ends_with(rtrim($ln), ';')) {
            $s = trim($buf);
            if ($s !== '') $statements[] = $s;
            $buf = '';
        }
    }
    if (trim($buf) !== '') $statements[] = trim($buf);

    out('  executing ' . count($statements) . ' statements...');
    $n = 0;
    foreach ($statements as $stmt) {
        $n++;
        $head = preg_replace('/\s+/', ' ', substr($stmt, 0, 72));
        try {
            $db->exec($stmt);
            out("  [$n] OK      $head");
        } catch (PDOException $e) {
            $errno = (int) ($e->errorInfo[1] ?? 0);
            if (in_array($errno, DUP_ERRNOS, true)) {
                out("  [$n] SKIP    already exists (errno $errno)  $head");
                continue;
            }
            out("  [$n] FAILED  errno $errno: " . $e->getMessage());
            $failed = true;
            break;
        }
    }
    out('');
}

out('=== postflight ===');
$allok = true;
foreach ($state as $id => $st) {
    foreach ($st['tables'] as $t) {
        $ok = table_exists($db, $t);
        $allok = $allok && $ok;
        out(sprintf('  %-22s %s', $t, $ok ? 'EXISTS' : 'ABSENT'));
    }
}
foreach ($state as $id => $st) {
    foreach ($st['columns'] as $t => $cs) foreach ($cs as $c) {
        $ok = column_exists($db, $t, $c);
        $allok = $allok && $ok;
        out(sprintf('  %-18s %-22s %s', $t, $c, $ok ? 'PRESENT' : 'MISSING'));
    }
}
foreach ($state as $id => $st) {
    foreach ($st['indexes'] as $t => $is) foreach ($is as $i) {
        $ok = index_exists($db, $t, $i);
        $allok = $allok && $ok;
        out(sprintf('  %-18s %-36s %s', $t, $i, $ok ? 'PRESENT' : 'MISSING'));
    }
}
out('');
out($allok && !$failed ? 'APPLY_DONE' : ($go ? 'APPLY_INCOMPLETE' : 'PREVIEW_DONE'));
