<?php
// READ-ONLY schema diagnostic. Reports which pending-migration tables and
// columns are present in production. Prints no credentials.
//
//   https://safrotravel.com/diag-schema.php?key=...
//
// MUST NOT BE COMMITTED: contains the deploy key (see docs/deploy/DIAGNOSTICS.md).

declare(strict_types=1);

const DEPLOY_KEY = 'safro_extract_2026';
const APP_ROOT = '/home/safro/travel-app';
const STANDALONE = APP_ROOT . '/.next/standalone';

header('Content-Type: text/plain; charset=utf8');

function out(string $m): void { echo $m . "\n"; flush(); }

if (($_GET['key'] ?? '') !== DEPLOY_KEY) {
    http_response_code(403);
    out('FORBIDDEN');
    exit;
}

$mysqlUrl = null;
foreach ([STANDALONE . '/.env', STANDALONE . '/.env.production', APP_ROOT . '/.env', APP_ROOT . '/.env.production'] as $f) {
    if (is_file($f) && preg_match('/^DATABASE_URL=(mysql:\/\/.*)$/m', (string) file_get_contents($f), $m)) {
        $mysqlUrl = trim($m[1]);
        break;
    }
}
if (!$mysqlUrl) { out('no mysql DATABASE_URL'); exit; }
if (!preg_match('#^mysql://([^:]+):(.+)@([^/:?]+)/([^?]+)#', $mysqlUrl, $m)) { out('url parse failed'); exit; }
[, $user, $pass, $host, $dbname] = $m;

try {
    $db = new PDO("mysql:host={$host};dbname={$dbname};charset=utf8mb4", $user, rawurldecode($pass), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
} catch (Throwable $e) {
    out('connect FAILED: ' . $e->getMessage());
    exit;
}

out('target: ' . $dbname . '  server: ' . $db->query('SELECT VERSION()')->fetchColumn());
out('');

// --- tables required by the three pending migrations ---
$tables = [
    'ReferenceCounter'     => 'migration 20261015000000_add_reference_counter',
    'PlatformWallet'       => 'migration 20261016000000_platform_wallet_and_quotas',
    'PlatformTransaction'  => 'migration 20261016000000_platform_wallet_and_quotas',
    'CompanyRouteQuota'    => 'migration 20261021000000_route_quota_and_booking_creator',
    'Destination'          => 'deploy-fix.php baseline',
];
out('=== tables ===');
foreach ($tables as $t => $why) {
    $exists = $db->query("SHOW TABLES LIKE " . $db->quote($t))->fetchColumn();
    out(sprintf('  %-22s %s   (%s)', $t, $exists ? 'EXISTS' : 'ABSENT', $why));
}

// --- columns added by those migrations (incl. 20261022: daily cap + credit
//     reference + idempotency key — the columns the signed-in /api/trips
//     include of full CompanyBooking rows needs) ---
$cols = [
    'Trip'            => ['routeKey', 'travelDate'],
    'Booking'         => ['fundingSource'],
    'Company'         => ['autoPayEnabled', 'maxSeatsPerBooking', 'maxDailySeats'],
    'CreditLog'       => ['bookingReference'],
    'CompanyBooking'  => ['expiredAt', 'createdByUserId', 'idempotencyKey'],
    'WalletTransaction'=> ['idempotencyKey'],
];
out('');
out('=== columns ===');
foreach ($cols as $t => $wanted) {
    $existing = [];
    foreach ($db->query("SHOW COLUMNS FROM `$t`") as $row) {
        $existing[] = $row['Field'];
    }
    foreach ($wanted as $c) {
        $has = in_array($c, $existing, true);
        out(sprintf('  %-18s %-22s %s', $t, $c, $has ? 'PRESENT' : 'MISSING'));
    }
}

// --- indexes added by 20261022 ---
out('');
out('=== indexes ===');
foreach (['CompanyBooking' => ['CompanyBooking_idempotencyKey_idx']] as $t => $wanted) {
    $existing = [];
    foreach ($db->query("SHOW INDEX FROM `$t`") as $row) {
        $existing[] = $row['Key_name'];
    }
    foreach ($wanted as $i) {
        $has = in_array($i, $existing, true);
        out(sprintf('  %-18s %-36s %s', $t, $i, $has ? 'PRESENT' : 'MISSING'));
    }
}

// --- optional schema snapshot (&ddl=1): SHOW CREATE TABLE for the tables the
//     20261022 ALTERs touch. Purely read-only; kept locally as the pre-change
//     schema backup, since no SSH/mysqldump exists on this host.
if (($_GET['ddl'] ?? '') === '1') {
    out('');
    out('=== ddl snapshot ===');
    foreach (['Company', 'CreditLog', 'CompanyBooking'] as $t) {
        $create = $db->query("SHOW CREATE TABLE `$t`")->fetch();
        out('-- ' . $t);
        out(($create['Create Table'] ?? '') . ';');
        out('');
    }
}

out('');
out('DIAG2_DONE');
