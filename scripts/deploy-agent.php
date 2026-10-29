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

    default:
        die_err(400, "unknown step '$step' (status|build-check|deploy|rollback|snapshot)");
}
