<?php
/**
 * SafroTravel hardened deploy agent (GitHub Actions pipeline endpoint).
 *
 * Replaces public_html/deploy-fix.php. The server layout it targets (from the
 * production .htaccess + the proven deploy-fix.php):
 *
 *   PassengerAppRoot        /home/safro/travel-app          (APP_ROOT)
 *   PassengerStartupFile    .next/standalone/server.js      (STANDALONE = APP_ROOT/.next/standalone)
 *   Apache/LiteSpeed static /home/safro/public_html/_next/static   (PUBLIC_HTML)
 *
 * So a deploy writes to TWO places: the Node server tree (STANDALONE) and the
 * Apache-served static assets (PUBLIC_HTML/_next/static). Failing to update the
 * second leaves /api/health green while every page's JS/CSS 404s or serves a
 * stale BUILD_ID — which is why the old agent cross-checks both BUILD_IDs.
 *
 * Hardening vs deploy-fix.php:
 *   - Auth: 32+ char key in deploy-agent.key (never in git), hash_equals.
 *     No key file -> agent is inert (deploy-fix.php shipped a guessable key).
 *   - Single artifact app.zip (assembled in CI), not 3 zips that can desync.
 *   - Zip markers validated BEFORE extracting; a bad zip is rejected while the
 *     site still runs.
 *   - Never writes: .env*, .htaccess, .user.ini, other *.php, the agent itself,
 *     uploads/, backup(s)/, tmp/, logs/. A rollback never reverts user uploads
 *     or deletes newer DB dumps.
 *   - Keeps the previous artifact as a release zip for rollback.
 *
 * Steps (all need key=; POST keeps the key out of access logs):
 *   status       php/env/build info + both BUILD_IDs
 *   deploy       validate + extract app.zip to both targets + restart
 *   rollback     restore the newest (or named) release + restart
 *   snapshot     zip the CURRENT standalone tree -> releases/ (initial rollback source)
 *   build-check  both BUILD_IDs + markers
 *   dbdump       dump every base table -> backup/db-<ts>.sql (pure PHP, no mysqldump)
 *   dbverify     restore a dump into rt_-prefixed scratch tables, compare row
 *                counts, then drop the scratch tables (never touches live data)
 */
declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store');

// --- Paths. Overridable via DEPLOY_TEST_ROOT so the local test harness can
// point all three at a temp tree; production needs no env var at all. -------
$TEST_ROOT = getenv('DEPLOY_TEST_ROOT');
define('APP_ROOT',     $TEST_ROOT ? $TEST_ROOT . '/travel-app'      : '/home/safro/travel-app');
define('STANDALONE',   APP_ROOT . '/.next/standalone');
define('PUBLIC_HTML',  $TEST_ROOT ? $TEST_ROOT . '/public_html'     : '/home/safro/public_html');
// RELEASES_DIR lives inside APP_ROOT (not web-accessible: DocumentRoot is
// public_html, travel-app is only reachable by Passenger). APP_ROOT is
// definitionally writable — Passenger touches restart.txt there — so this
// avoids depending on /home/safro being writable.
define('RELEASES_DIR', $TEST_ROOT ? $TEST_ROOT . '/releases'        : APP_ROOT . '/releases');
define('KEY_FILE',     APP_ROOT . '/deploy-agent.key');
define('ZIP_FILE',     APP_ROOT . '/app.zip');
define('LOG_FILE',     APP_ROOT . '/logs/deploy-agent.log');
// DB dumps land here. In production this is /www/backup (the SAME shared dir the
// old agent's dumps went to — already writable by the web user, already
// web-protected by the .htaccess). It sits OUTSIDE APP_ROOT, so a deploy/rollback
// (which only touches APP_ROOT + PUBLIC_HTML) can never clobber a backup.
define('BACKUP_DIR',   $TEST_ROOT ? $TEST_ROOT . '/backup' : '/home/safro/backup');
define('MAX_LOG_BYTES', 524288); // 512KB rotation

// Exact filenames never written, even if a zip contained them.
const PROTECTED_PATHS = [
    '.env', '.htaccess', '.user.ini', 'deploy-agent.php', 'deploy-agent.key',
    'deploy-fix.php', 'deploy-migrations.php', 'diag-schema.php',
];

// Directory prefixes that are DATA, not code: never extracted over, never
// snapshotted. A rollback restores CODE; it must not revert user uploads or
// delete newer DB dumps.
const DATA_PREFIXES = ['uploads/', 'backup/', 'backups/', 'tmp/', 'logs/'];

function log_line(string $msg): void
{
    $dir = dirname(LOG_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    if (is_file(LOG_FILE) && filesize(LOG_FILE) > MAX_LOG_BYTES) {
        @rename(LOG_FILE, LOG_FILE . '.1');
    }
    @file_put_contents(LOG_FILE, '[' . gmdate('c') . "] $msg\n", FILE_APPEND | LOCK_EX);
}

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
    exit;
}

function die_err(int $code, string $msg): void
{
    log_line("ERROR $code $msg");
    respond($code, ['ok' => false, 'error' => $msg]);
}

// --- Auth ------------------------------------------------------------------
// deploy-agent.key holds a 32+ char random key (trailing newline tolerated).
// Missing/short key file => agent refuses everything: a fresh server with only
// this PHP file is inert, not an open door (deploy-fix.php's failure mode).
$key = is_file(KEY_FILE) ? trim((string)file_get_contents(KEY_FILE)) : '';
if (strlen($key) < 32) {
    die_err(403, 'deploy agent not configured: deploy-agent.key missing or shorter than 32 chars');
}
$given = (string)($_REQUEST['key'] ?? '');
if ($given === '' || !hash_equals($key, $given)) {
    log_line('auth failure from ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    die_err(403, 'invalid key');
}

$step = (string)($_REQUEST['step'] ?? 'status');
log_line("step=$step from " . ($_SERVER['REMOTE_ADDR'] ?? '?') . ' ua=' . ($_SERVER['HTTP_USER_AGENT'] ?? '-'));

// Passenger restart: touching tmp/restart.txt makes it reload on next request.
// Both locations, matching the proven agent.
function touch_restarts(): array
{
    $done = [];
    foreach ([APP_ROOT . '/tmp', STANDALONE . '/tmp'] as $d) {
        if (!is_dir($d)) @mkdir($d, 0755, true);
        $f = $d . '/restart.txt';
        @touch($f);
        $done[] = [$f, is_file($f)];
    }
    return $done;
}

function standalone_build_id(): string
{
    $f = STANDALONE . '/.next/BUILD_ID';
    return is_file($f) ? trim((string)file_get_contents($f)) : 'missing';
}

// Apache serves /_next/static/<BUILD_ID>/ (a per-build directory) + chunks/ +
// css/. There is NO BUILD_ID file in static — production's own
// public_html/_next/static has never had one (the old agent's file check
// reported match=NO forever while the site worked). So "is this build's static
// in place?" == "does the BUILD_ID-named directory exist?".
function static_build_present(string $buildId): bool
{
    if ($buildId === '' || $buildId === 'missing') return false;
    return is_dir(PUBLIC_HTML . '/_next/static/' . $buildId);
}

function release_zips(): array
{
    if (!is_dir(RELEASES_DIR)) return [];
    $z = glob(RELEASES_DIR . '/app-*.zip') ?: [];
    rsort($z); // newest first (timestamp names)
    return $z;
}

function zip_has_markers(string $zipPath): array
{
    // Validate BEFORE touching production. Both targets' needs are covered:
    // server tree markers + the static subtree Apache serves.
    $required = ['server.js', '.next/BUILD_ID', '.next/static', 'public', 'prisma/schema.prisma', 'node_modules'];
    $zip = class_exists('ZipArchive') ? new ZipArchive() : null;
    if (!$zip || $zip->open($zipPath) !== true) return ['ok' => false, 'missing' => ['<cannot open zip>']];
    $names = [];
    for ($i = 0; $i < $zip->numFiles; $i++) $names[] = $zip->getNameIndex($i);
    $zip->close();
    $missing = [];
    foreach ($required as $r) {
        $hit = false;
        foreach ($names as $n) {
            if ($n === $r || str_starts_with($n, $r . '/')) { $hit = true; break; }
        }
        if (!$hit) $missing[] = $r;
    }
    return ['ok' => $missing === [], 'missing' => $missing];
}

/**
 * Extract app.zip over BOTH deploy targets:
 *   - every entry            -> STANDALONE   (Node server tree)
 *   - .next/static/**        -> PUBLIC_HTML/_next/static  (Apache-served assets)
 * Returns [ok, skipped, serverFiles, staticFiles].
 */
function extract_app_zip(string $zipPath): array
{
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) return [false, [], 0, 0];
    $skipped = [];
    $serverFiles = 0;
    $staticFiles = 0;
    $staticPrefix = '.next/static/';
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if ($name === false) continue;
        $name = str_replace('\\', '/', $name);
        $base = basename($name);
        // Zip-slip + protected + data guards.
        if (str_contains($name, '..') || str_starts_with($name, '/')) { $skipped[] = $name; continue; }
        if (in_array($base, PROTECTED_PATHS, true) || str_starts_with($base, '.env')) { $skipped[] = $name; continue; }
        $isData = false;
        foreach (DATA_PREFIXES as $p) { if (str_starts_with($name, $p)) { $isData = true; break; } }
        if ($isData) { $skipped[] = $name; continue; }

        if ($zip->extractTo(STANDALONE, $name)) $serverFiles++;

        // Mirror static assets into the Apache docroot so /_next/static serves
        // this build (hashed chunks + the BUILD_ID marker Apache checks).
        if (str_starts_with($name, $staticPrefix)) {
            $rel = substr($name, strlen($staticPrefix));
            $content = $zip->getFromIndex($i);
            if ($content !== false) {
                $dest = PUBLIC_HTML . '/_next/static/' . $rel;
                $dd = dirname($dest);
                if (!is_dir($dd)) @mkdir($dd, 0755, true);
                if (@file_put_contents($dest, $content) !== false) $staticFiles++;
            }
        }
    }
    $zip->close();
    return [true, $skipped, $serverFiles, $staticFiles];
}

function restore_release(?string $zipPath): bool
{
    if (!$zipPath || !is_file($zipPath)) return false;
    $res = extract_app_zip($zipPath);
    $ok = $res[0];
    if ($ok) touch_restarts();
    return $ok;
}

// --- DB credential lookup (for the dbdump/dbverify steps only) -------------
// Mirrors the proven deploy-fix.php parsing. Never echoed anywhere.
// UNIT-TEST-REGION-BEGIN (scripts/test-deploy-agent.php extracts the pure
// helpers between these two markers; the marker lines are inert comments).
function env_file_value(string $key): ?string
{
    foreach ([STANDALONE . '/.env', APP_ROOT . '/.env', APP_ROOT . '/.env.production'] as $f) {
        if (!is_file($f)) continue;
        $txt = (string)file_get_contents($f);
        if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=\s*(.+?)\s*$/m', $txt, $m)) {
            $v = trim($m[1]);
            if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[0] === substr($v, -1)) {
                $v = substr($v, 1, -1);
            }
            if ($v !== '') return $v;
        }
    }
    $v = getenv($key); // .htaccess SetEnv also lands here under Apache/LiteSpeed
    return ($v !== false && $v !== '') ? (string)$v : null;
}

function db_pdo_conn(): PDO
{
    $url = env_file_value('DATABASE_URL');
    if (!$url || !preg_match('#^mysql://([^:/]+):([^@]+)@([^/@]+)/([^?\s]+)$#', $url, $m)) {
        throw new RuntimeException('DATABASE_URL missing or unparseable');
    }
    $pdo = new PDO(
        'mysql:host=' . $m[3] . ';dbname=' . $m[4] . ';charset=utf8mb4',
        $m[1],
        rawurldecode($m[2]),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            // Return every column as a string so the dumper never sees a
            // DateTime object / float it can't quote. COUNT(*) is cast to int
            // at the call site, so dbverify is unaffected.
            PDO::ATTR_STRINGIFY_FETCHES => true,
        ]
    );
    $pdo->exec('SET NAMES utf8mb4'); // must precede byte-wise escaping (see esc_sql)
    return $pdo;
}

// Byte-wise MySQL string escaping. SAFE for utf8mb4 only (explicitly set above):
// UTF-8 continuation bytes are always 10xxxxxx, so no multi-byte sequence can
// contain 0x27(') or 0x5C(\) — byte-wise replacement cannot split a character.
// Newlines are escaped as \n, so dumped statements never contain a raw newline
// inside a string literal — which is what makes statement-splitting safe.
function esc_sql(?string $v): string
{
    if ($v === null) return 'NULL';
    $v = str_replace(
        ["\\", "\0", "\n", "\r", "'", '"', "\x1a"],
        ["\\\\", "\\0", "\\n", "\\r", "\\'", '\\"', "\\Z"],
        $v
    );
    return "'" . $v . "'";
}

function is_numeric_col(string $type): bool
{
    return (bool)preg_match('/^(tinyint|smallint|mediumint|int|integer|bigint|float|double|decimal|numeric|real|bit)/i', $type);
}

function sql_literal(mixed $v, string $type): string
{
    if ($v === null) return 'NULL';
    $s = (string)$v;
    // Quote everything except genuinely numeric values in numeric columns.
    // (Quoting a VARCHAR that looks numeric MUST still happen — quoting keeps
    // "1e5" from being cast to 100000.)
    if (is_numeric_col($type) && is_numeric($s)) return $s;
    return esc_sql($s);
}

// Build the INSERT statement(s) for one table's rows. Pure (no PDO) so the
// harness can unit-test the quoting. $columns/$types come from SHOW FULL
// COLUMNS (same order as SELECT *); $rows is a list of value arrays in that
// same order. Chunked into multi-row INSERTs so we stay under
// max_allowed_packet and don't emit one statement per row.
function build_inserts(string $table, array $columns, array $types, array $rows): string
{
    if ($rows === []) return '';
    $qi = '`' . str_replace('`', '``', $table) . '`';
    $colList = '`' . implode('`,`', array_map(fn($c) => str_replace('`', '``', $c), $columns)) . '`';
    $out = '';
    $buf = [];
    foreach ($rows as $row) {
        $lits = [];
        foreach ($columns as $i => $c) {
            $lits[] = sql_literal($row[$i] ?? null, $types[$i] ?? '');
        }
        $buf[] = '(' . implode(',', $lits) . ')';
        if (count($buf) >= 200) {
            $out .= "INSERT INTO $qi ($colList) VALUES\n" . implode(",\n", $buf) . ";\n";
            $buf = [];
        }
    }
    if ($buf !== []) {
        $out .= "INSERT INTO $qi ($colList) VALUES\n" . implode(",\n", $buf) . ";\n";
    }
    return $out;
}

// Rewrite a dump so its tables restore as `rt_<name>` instead of colliding with
// live tables. KEYWORD-ANCHORED: a table name is only rewritten where it follows
// a keyword that is ALWAYS followed by a TABLE (never a column). This protects
// `(`id`,`email`)` column lists in an INSERT — if a column ever shared a name
// with a table it would NOT be corrupted. We ALSO rename every named constraint
// (`CONSTRAINT \`X\``) because foreign-key names are unique per-DATABASE in
// MySQL/MariaDB — a scratch table re-creating a live FK name fails with errno
// 121. Prisma names them `<table>_<col>_fkey` (not MySQL's `_ibfk_N`), so we
// prefix ALL of them, matching any name.
function prefix_dump_tables(string $sql, array $tables): string
{
    $kw = 'CREATE TABLE|DROP TABLE IF EXISTS|DROP TABLE|INSERT INTO|'
        . 'ALTER TABLE|ALTER IGNORE TABLE|REFERENCES|LOCK TABLES|UNLOCK TABLES|'
        . 'DELETE FROM|TRUNCATE TABLE|UPDATE';
    foreach ($tables as $t) {
        $q = preg_quote($t, '/');
        $sql = preg_replace(
            '/\b(' . $kw . ')\s+`' . $q . '`/i',
            '$1 `rt_' . $t . '`',
            $sql
        );
    }
    // Rename every named constraint to rt_<name>. `[^`]+` matches any constraint
    // name (Prisma `_fkey`, MySQL `_ibfk_N`, or a custom @@map name).
    return preg_replace('/\bCONSTRAINT\s+`([^`]+)`/', 'CONSTRAINT `rt_$1`', $sql);
}

// Split a dump into executable statements. Safe because esc_sql() guarantees no
// raw newline exists inside any string literal, so ";\n" only occurs between
// statements. `--` comment lines are dropped from each chunk.
function dump_statements(string $sql): array
{
    $out = [];
    foreach (explode(";\n", $sql) as $chunk) {
        $lines = [];
        foreach (explode("\n", $chunk) as $ln) {
            if (preg_match('/^\s*--/', $ln)) continue;
            $lines[] = $ln;
        }
        $stmt = trim(implode("\n", $lines));
        if ($stmt !== '') $out[] = $stmt;
    }
    return $out;
}

function list_base_tables(PDO $pdo): array
{
    return $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
}

// Drop any leftover rt_ scratch tables. Scratch tables reference EACH OTHER
// (rt_Booking -> rt_Trip, ...), so dropping a parent before a child violates
// FK constraint 1451. FOREIGN_KEY_CHECKS=0 lets us drop them in any order.
// These are scratch-only; live tables are never touched here.
function drop_rt_tables(PDO $pdo): array
{
    $left = $pdo->query("SHOW TABLES LIKE 'rt\\_%'")->fetchAll(PDO::FETCH_COLUMN);
    if ($left !== []) {
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        foreach ($left as $x) $pdo->exec('DROP TABLE IF EXISTS `' . $x . '`');
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    }
    return $left;
}
// UNIT-TEST-REGION-END

// --- Steps -----------------------------------------------------------------
switch ($step) {
    case 'status':
        respond(200, [
            'ok' => true,
            'agent' => 'safro-deploy-agent/2',
            'php' => PHP_VERSION,
            'zip' => class_exists('ZipArchive') ? 'ZipArchive ok' : 'ZipArchive MISSING',
            'app_root' => APP_ROOT,
            'standalone' => STANDALONE,
            'public_html' => PUBLIC_HTML,
            'standalone_build' => standalone_build_id(),
            'static_build_dir_present' => static_build_present(standalone_build_id()),
            'build_ids_match' => static_build_present(standalone_build_id()),
            'pending_zip' => is_file(ZIP_FILE) ? filesize(ZIP_FILE) : null,
            'releases' => array_map('basename', release_zips()),
        ]);

    case 'build-check':
        $s = standalone_build_id();
        $present = static_build_present($s);
        respond(200, [
            'ok' => true,
            'standalone_build' => $s,
            // Apache target: does public_html/_next/static/<BUILD_ID>/ exist?
            'static_build_dir_present' => $present,
            'build_ids_match' => $present,
            'server_js' => is_file(STANDALONE . '/server.js'),
            'static_dir' => is_dir(PUBLIC_HTML . '/_next/static'),
            'schema' => is_file(STANDALONE . '/prisma/schema.prisma'),
            'htaccess_touched_by_agent' => 'never',
        ]);

    case 'deploy':
        set_time_limit(0);   // ~20k files across two targets
        ignore_user_abort(true);
        if (!is_file(ZIP_FILE)) die_err(400, 'app.zip not uploaded');
        $check = zip_has_markers(ZIP_FILE);
        if (!$check['ok']) {
            @rename(ZIP_FILE, ZIP_FILE . '.rejected-' . gmdate('YmdHis'));
            die_err(422, 'zip failed marker check, rejected (production untouched): ' . implode(', ', $check['missing']));
        }

        if (!is_dir(RELEASES_DIR)) @mkdir(RELEASES_DIR, 0755, true);
        $prev = standalone_build_id();
        $stamp = gmdate('Ymd-His');
        // release_zips() is newest-first (rsort); rotate off the TAIL (oldest).
        foreach (array_slice(release_zips(), 3) as $old) @unlink($old);
        // The artifact currently in place becomes the rollback copy.
        $lastRelease = APP_ROOT . '/app-prev.zip';
        if (is_file($lastRelease)) @rename($lastRelease, RELEASES_DIR . '/app-' . $stamp . '.zip');

        [$ok, $skipped, $serverFiles, $staticFiles] = extract_app_zip(ZIP_FILE);
        if (!$ok) {
            $rolled = restore_release(release_zips()[0] ?? null);
            die_err(500, 'extract failed; automatic restore of previous release ' . ($rolled ? 'succeeded' : 'FAILED — manual rollback required'));
        }

        @rename(ZIP_FILE, APP_ROOT . '/app-prev.zip'); // next rollback source
        $restarts = touch_restarts();
        $s = standalone_build_id();
        $present = static_build_present($s);
        log_line("deploy ok standalone=$s static_dir_present=" . ($present ? 'yes' : 'NO') . " (was $prev) server=$serverFiles static=$staticFiles");
        respond(200, [
            'ok' => true,
            'standalone_build' => $s,
            'static_build_dir_present' => $present,
            'previous_build' => $prev,
            'build_ids_match' => $present && $s !== $prev,
            'server_files_extracted' => $serverFiles,
            'static_files_mirrored' => $staticFiles,
            'skipped_protected' => $skipped,
            'restarts' => $restarts,
        ]);

    case 'rollback':
        set_time_limit(0);
        ignore_user_abort(true);
        $target = (string)($_REQUEST['release'] ?? '');
        $zipPath = $target !== '' ? RELEASES_DIR . '/' . basename($target) : (release_zips()[0] ?? null);
        if (!$zipPath || !is_file($zipPath)) die_err(404, 'no release zip available to roll back to');
        $before = standalone_build_id();
        if (!restore_release($zipPath)) die_err(500, 'rollback extract failed');
        log_line('rollback to ' . basename($zipPath));
        respond(200, [
            'ok' => true,
            'restored' => basename($zipPath),
            'standalone_build' => standalone_build_id(),
            'static_build_dir_present' => static_build_present(standalone_build_id()),
            'build_before' => $before,
            'restarts' => touch_restarts(),
        ]);

    case 'snapshot':
        // Zip the CURRENT standalone tree -> releases/ so `rollback` has a
        // source even before the first pipeline deploy. Server-side only.
        set_time_limit(0);
        ignore_user_abort(true);
        if (!is_dir(RELEASES_DIR)) @mkdir(RELEASES_DIR, 0755, true);
        $target = RELEASES_DIR . '/app-' . gmdate('Ymd-His') . '.zip';
        $za = new ZipArchive();
        if ($za->open($target, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            die_err(500, 'cannot create snapshot zip');
        }
        $count = 0;
        $stack = [STANDALONE];
        while ($stack) {
            $dir = array_pop($stack);
            foreach ((array)scandir($dir) as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                // Skip artifacts / rejected uploads / legacy junk zips at the root.
                if ($entry === 'app-prev.zip' || str_starts_with($entry, 'app.zip')) continue;
                if ($dir === STANDALONE && str_ends_with($entry, '.zip')) continue;
                $full = $dir . '/' . $entry;
                if (is_dir($full)) {
                    $relDir = substr($full, strlen(STANDALONE) + 1) . '/';
                    if (in_array($relDir, DATA_PREFIXES, true)) continue; // data, not code
                    $stack[] = $full;
                    continue;
                }
                $rel = substr($full, strlen(STANDALONE) + 1);
                $base = basename($rel);
                if (in_array($base, PROTECTED_PATHS, true)) continue;
                if (str_starts_with($base, '.env')) continue; // secrets stay out
                if (str_starts_with($rel, 'logs/')) continue;
                if ($za->addFile($full, $rel)) $count++;
            }
        }
        $za->close();
        log_line("snapshot ok files=$count -> " . basename($target));
        respond(200, [
            'ok' => true,
            'release' => basename($target),
            'files' => $count,
            'bytes' => is_file($target) ? filesize($target) : 0,
            'note' => 'restore with step=rollback&release=' . basename($target),
        ]);

    case 'dbdump':
        set_time_limit(0); // dumping ~20 tables row-by-row
        try {
            $pdo = db_pdo_conn();
        } catch (Throwable $e) {
            log_line('dbdump connect failed: ' . $e->getMessage());
            die_err(503, 'db connection failed (see agent log); no dump written');
        }
        try {
            $tables = array_values(array_filter(list_base_tables($pdo),
                fn($t) => !str_starts_with($t, 'rt_'))); // never dump our own scratch tables
            if (!$tables) die_err(503, 'no base tables found in database');
            $counts = [];
            $totalRows = 0;
            if (!is_dir(BACKUP_DIR)) @mkdir(BACKUP_DIR, 0755, true);
            $file = BACKUP_DIR . '/db-' . date('Ymd-His') . '.sql';
            $fh = fopen($file, 'w');
            if (!$fh) die_err(503, 'cannot open backup dir for writing');
            fwrite($fh, "-- Safro deploy-agent DB dump\n-- generated: " . gmdate('c') . "\n");
            fwrite($fh, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
            foreach ($tables as $t) {
                $qt = '`' . str_replace('`', '``', $t) . '`';
                $create = $pdo->query("SHOW CREATE TABLE $qt")->fetch(PDO::FETCH_ASSOC);
                $ddl = $create['Create Table'] ?? null;
                if ($ddl === null) { fclose($fh); @unlink($file); die_err(503, "cannot read schema for `$t`; partial dump removed"); }
                $cols = $pdo->query("SHOW FULL COLUMNS FROM $qt")->fetchAll(PDO::FETCH_ASSOC);
                $names = array_column($cols, 'Field');
                $types = array_column($cols, 'Type');
                $rows = $pdo->query("SELECT * FROM $qt")->fetchAll(PDO::FETCH_NUM);
                fwrite($fh, "-- {$t}: " . count($rows) . " rows\n");
                fwrite($fh, "DROP TABLE IF EXISTS $qt;\n");
                fwrite($fh, $ddl . ";\n");
                fwrite($fh, build_inserts($t, $names, $types, $rows));
                fwrite($fh, "\n");
                $counts[$t] = count($rows);
                $totalRows += count($rows);
            }
            fwrite($fh, "SET FOREIGN_KEY_CHECKS=1;\n");
            fclose($fh);
            log_line('dbdump ok file=' . basename($file) . " tables=" . count($tables) . " rows=$totalRows");
            respond(200, [
                'ok' => true, 'file' => basename($file), 'path' => BACKUP_DIR,
                'bytes' => is_file($file) ? filesize($file) : 0,
                'tables' => count($tables), 'total_rows' => $totalRows,
                'rows' => $counts,
            ]);
        } catch (Throwable $e) {
            log_line('dbdump failed: ' . $e->getMessage());
            die_err(503, 'db dump failed: ' . substr($e->getMessage(), 0, 200));
        }

    case 'dbverify':
        set_time_limit(0);   // restoring 30+ tables can exceed the default cap
        ignore_user_abort(true);
        $file = (string)($_REQUEST['file'] ?? '');
        if (!preg_match('/^db-\d{8}-\d{6}\.sql$/', $file)) {
            die_err(400, "give file=db-YYYYMMDD-HHMMSS.sql (the basename from step=dbdump)");
        }
        $path = BACKUP_DIR . '/' . $file;
        if (!is_file($path)) die_err(404, 'no such dump in backup dir');
        try {
            $pdo = db_pdo_conn();
        } catch (Throwable $e) {
            log_line('dbverify connect failed: ' . $e->getMessage());
            die_err(503, 'db connection failed (see agent log)');
        }
        $sql = (string)file_get_contents($path);
        if ($sql === '') die_err(422, 'dump file empty');
        try {
            drop_rt_tables($pdo); // clean any leftover scratch from a failed run
            $stmts = dump_statements($sql);
            // Which tables will be created as rt_ scratch? Read them from the dump's
            // CREATE TABLE statements so we know what to compare + drop afterwards.
            $scratch = [];
            foreach ($stmts as $s) {
                if (preg_match('/^CREATE TABLE `([^`]+)`/i', $s, $m)) $scratch[] = $m[1];
            }
            $applied = 0;
            foreach ($stmts as $s) {
                $pdo->exec(prefix_dump_tables($s, $scratch));
                $applied++;
            }
            // Compare live vs restored row counts.
            $cmp = [];
            $okAll = true;
            foreach ($scratch as $orig) {
                $live = (int)$pdo->query('SELECT COUNT(*) FROM `' . str_replace('`', '``', $orig) . '`')->fetchColumn();
                $restored = (int)$pdo->query('SELECT COUNT(*) FROM `rt_' . str_replace('`', '``', $orig) . '`')->fetchColumn();
                $match = ($live === $restored);
                if (!$match) $okAll = false;
                $cmp[$orig] = ['live' => $live, 'restored' => $restored, 'match' => $match];
            }
            $dropped = drop_rt_tables($pdo);
            // Genuinely confirm cleanup: nothing rt_-prefixed may remain.
            $remaining = $pdo->query("SHOW TABLES LIKE 'rt\\_%'")->fetchAll(PDO::FETCH_COLUMN);
            log_line('dbverify ' . ($okAll ? 'ok' : 'MISMATCH') . " file=$file applied=$applied dropped=" . count($dropped) . ' remaining=' . count($remaining));
            respond($okAll ? 200 : 422, [
                'ok' => $okAll, 'file' => $file, 'statements_applied' => $applied,
                'tables' => count($scratch), 'rows_match' => $cmp,
                'scratch_dropped' => count($remaining) === 0,
            ]);
        } catch (Throwable $e) {
            try { drop_rt_tables($pdo); } catch (Throwable $e2) { log_line('cleanup drop failed: ' . $e2->getMessage()); }
            log_line('dbverify failed: ' . $e->getMessage());
            die_err(422, 'db verify failed (scratch cleaned up): ' . substr($e->getMessage(), 0, 200));
        }

    default:
        die_err(400, "unknown step '$step' (status|build-check|deploy|rollback|snapshot|dbdump|dbverify)");
}
