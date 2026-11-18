<?php
// Production Database Reset for safrotravel.com
// Drops operational/user data while preserving Stations, Destinations, and Migrations,
// and provisions the new Super Admin account.
//
// Preview:  https://www.safrotravel.com/reset-production-data.php?key=safro_extract_2026
// Execute:  https://www.safrotravel.com/reset-production-data.php?key=safro_extract_2026&confirm=CONFIRM_RESET_PRODUCTION

declare(strict_types=1);

const DEPLOY_KEY = 'safro_extract_2026';
const APP_ROOT = '/home/safro/travel-app';
const STANDALONE = APP_ROOT . '/.next/standalone';

header('Content-Type: text/plain; charset=utf-8');
@set_time_limit(300);

function out(string $m): void { echo $m . "\n"; flush(); }

if (($_GET['key'] ?? '') !== DEPLOY_KEY) {
    http_response_code(403);
    out('FORBIDDEN');
    exit;
}

$confirm = ($_GET['confirm'] ?? '') === 'CONFIRM_RESET_PRODUCTION';

// 1. Connect to MySQL DB via env
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
out('mode: ' . ($confirm ? 'EXECUTE RESET' : 'PREVIEW ONLY (add &confirm=CONFIRM_RESET_PRODUCTION to execute)'));
out('');

// 2. Discover all tables
$tables = $db->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN);
out('Found ' . count($tables) . " base tables in $dbname:\n");

// Preserved tables (case-insensitive check)
// Preserving Stations, Destinations, Prisma migrations history, Site Settings, Payment Methods, and FAQs
$preserved = ['_prisma_migrations', 'station', 'destination', 'paymentmethod', 'sitesetting', 'faq'];

$toWipe = [];
foreach ($tables as $t) {
    if (in_array(strtolower($t), $preserved, true)) {
        out("  [PRESERVE] $t");
    } else {
        $toWipe[] = $t;
        out("  [TO WIPE]  $t");
    }
}

if (!$confirm) {
    out("\nAborting: Execution confirmation not provided. No changes made.");
    exit(0);
}

out("\n>>> PROCEEDING WITH DATABASE RESET <<<");

$db->exec("SET FOREIGN_KEY_CHECKS = 0;");

try {
    // 3. Clear data from all tables to wipe
    foreach ($toWipe as $t) {
        $qt = '`' . str_replace('`', '``', $t) . '`';
        $db->exec("DELETE FROM $qt;");
        try {
            $db->exec("ALTER TABLE $qt AUTO_INCREMENT = 1;");
        } catch (Throwable $ignored) {}
        out("  Deleted rows from: $t");
    }

    // 4. Create new Super Admin
    $userTable = null;
    foreach ($tables as $t) {
        if (strtolower($t) === 'user') {
            $userTable = $t;
            break;
        }
    }
    if (!$userTable) {
        throw new RuntimeException("User table not found!");
    }

    $qtUser = '`' . str_replace('`', '``', $userTable) . '`';
    $userCols = [];
    foreach ($db->query("SHOW COLUMNS FROM $qtUser") as $row) {
        $userCols[] = $row['Field'];
    }

    $adminId = 'c' . bin2hex(random_bytes(12));
    $adminEmail = 'admin@safrotravel.com';
    $adminName = 'Super Admin';
    $adminRole = 'SUPER_ADMIN';
    $adminPasswordHash = password_hash('Super@ad4125', PASSWORD_BCRYPT, ['cost' => 12]);
    $now = date('Y-m-d H:i:s');

    $colsToInsert = ['id', 'email', 'password', 'name', 'role'];
    $valsToInsert = [$adminId, $adminEmail, $adminPasswordHash, $adminName, $adminRole];

    if (in_array('permissions', $userCols, true)) {
        $colsToInsert[] = 'permissions';
        $valsToInsert[] = '';
    }
    if (in_array('isActive', $userCols, true)) {
        $colsToInsert[] = 'isActive';
        $valsToInsert[] = 1;
    }
    if (in_array('createdAt', $userCols, true)) {
        $colsToInsert[] = 'createdAt';
        $valsToInsert[] = $now;
    }

    $colSql = implode(', ', array_map(fn($c) => "`$c`", $colsToInsert));
    $placeholders = implode(', ', array_fill(0, count($colsToInsert), '?'));

    $stmt = $db->prepare("INSERT INTO $qtUser ($colSql) VALUES ($placeholders)");
    $stmt->execute($valsToInsert);
    out("\n✅ Super Admin created: $adminEmail ($adminRole)");

    // 5. Initialize PlatformWallet
    $walletTable = null;
    foreach ($tables as $t) {
        if (strtolower($t) === 'platformwallet') {
            $walletTable = $t;
            break;
        }
    }
    if ($walletTable) {
        $qtWallet = '`' . str_replace('`', '``', $walletTable) . '`';
        $wCols = [];
        foreach ($db->query("SHOW COLUMNS FROM $qtWallet") as $row) {
            $wCols[] = $row['Field'];
        }
        $wColList = ['id'];
        $wValList = ['main'];
        if (in_array('balancePiastres', $wCols, true)) {
            $wColList[] = 'balancePiastres';
            $wValList[] = 0;
        }
        if (in_array('balance', $wCols, true)) {
            $wColList[] = 'balance';
            $wValList[] = 0;
        }
        if (in_array('createdAt', $wCols, true)) {
            $wColList[] = 'createdAt';
            $wValList[] = $now;
        }
        if (in_array('updatedAt', $wCols, true)) {
            $wColList[] = 'updatedAt';
            $wValList[] = $now;
        }
        $wColSql = implode(', ', array_map(fn($c) => "`$c`", $wColList));
        $wPh = implode(', ', array_fill(0, count($wColList), '?'));
        $stmtW = $db->prepare("INSERT INTO $qtWallet ($wColSql) VALUES ($wPh)");
        $stmtW->execute($wValList);
        out("✅ PlatformWallet initialized ('main': balance 0)");
    }

} finally {
    $db->exec("SET FOREIGN_KEY_CHECKS = 1;");
}

out("\n=== POST-RESET ROW COUNTS ===");
foreach ($tables as $t) {
    $qt = '`' . str_replace('`', '``', $t) . '`';
    $count = (int)$db->query("SELECT COUNT(*) FROM $qt")->fetchColumn();
    out(sprintf("  %-25s : %d", $t, $count));
}

out("\nRESET_COMPLETED_SUCCESSFULLY");
