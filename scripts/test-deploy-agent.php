<?php
// Local harness for scripts/deploy-agent.php — runs the agent's real logic in
// CLI SAPI against a fake two-target production tree:
//   travel-app/.next/standalone   (Node server)   <- STANDALONE
//   public_html/_next/static      (Apache assets) <- PUBLIC_HTML
// Not shipped to the server. usage: php scripts/test-deploy-agent.php
error_reporting(E_ALL);

function rrmdir($p) {
    if (is_dir($p)) {
        foreach ((array)scandir($p) as $e) {
            if ($e === '.' || $e === '..') continue;
            rrmdir($p . '/' . $e);
        }
        @rmdir($p);
    } elseif (file_exists($p)) { @unlink($p); }
}

$TMP = sys_get_temp_dir() . '/agent-test-' . getmypid();
rrmdir($TMP);
$APP     = $TMP . '/travel-app';
$STAND   = $APP . '/.next/standalone';
$PUBHTML = $TMP . '/public_html';
$STATIC  = $PUBHTML . '/_next/static';
$RELEASES= $TMP . '/releases';
foreach ([$APP, $STAND, $PUBHTML, $STATIC, $RELEASES, $APP . '/tmp', $APP . '/logs', $APP . '/uploads', $APP . '/backup'] as $d) {
    mkdir($d, 0777, true);
}

// Fake "current production": server tree + Apache static + protected data.
// NOTE: Apache's static target holds a per-BUILD_ID DIRECTORY (public_html/_next/static/<BUILD_ID>/),
// not a BUILD_ID file — that's how production actually looks.
file_put_contents($STAND . '/server.js', 'OLD CODE');
mkdir($STAND . '/.next', 0777, true);
mkdir($STAND . '/prisma', 0777, true);
mkdir($STATIC . '/OLD-BUILD', 0777, true);
mkdir($STATIC . '/chunks', 0777, true);
file_put_contents($STAND . '/.next/BUILD_ID', 'OLD-BUILD');
file_put_contents($STAND . '/.env', 'DATABASE_URL=prod-secret');
file_put_contents($STAND . '/prisma/schema.prisma', 'model Trip {}');
file_put_contents($APP . '/.htaccess', 'PassengerAppRoot "/home/safro/travel-app"');
file_put_contents($APP . '/.env', 'AUTH_SECRET=app-root-secret');
file_put_contents($APP . '/uploads/user.png', 'PNGDATA');
file_put_contents($APP . '/backup/db.sql', 'DUMP');
file_put_contents($APP . '/deploy-agent.key', str_repeat('k', 40));
file_put_contents($STATIC . '/chunks/old.js', 'OLDCHUNK');

function build_zip($path, array $files) {
    $za = new ZipArchive();
    $za->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    foreach ($files as $name => $content) $za->addFromString($name, $content);
    $za->close();
}
// GOOD zip: server tree + static subtree (incl. the per-build BUILD_ID dir that
// Apache serves) + a zip-slip + a data-dir entry + an env.
build_zip($TMP . '/good.zip', [
    'server.js' => 'NEW CODE',
    '.next/BUILD_ID' => 'NEW-BUILD',
    '.next/static/NEW-BUILD/_ssgManifest.js' => 'SSG',
    '.next/static/chunks/new.js' => 'NEWCHUNK',
    '.next/server/app/page.js' => 'SERVERCHUNK',
    'public/index.html' => 'html',
    'prisma/schema.prisma' => 'model Trip { id Int }',
    'node_modules/foo/index.js' => 'mod',
    '.env' => 'LOCAL-DEV-SECRET-MUST-NOT-LAND',
    'uploads/user.png' => 'OVERWRITE-ATTEMPT',
    '../../evil.php' => 'zipslip',
]);
build_zip($TMP . '/bad.zip', ['readme.txt' => 'not an app']);

function run_agent($step, $key) {
    global $TMP, $APP;
    $agentSrc = file_get_contents(__DIR__ . '/deploy-agent.php');
    file_put_contents($APP . '/deploy-agent-under-test.php', $agentSrc);
    $req = ['key' => $key, 'step' => $step];
    // putenv in the bootstrap (not a shell VAR= prefix) so it works on Windows too.
    file_put_contents($APP . '/boot-under-test.php',
        '<?php putenv(' . var_export('DEPLOY_TEST_ROOT=' . $TMP, true) . ');' .
        ' $_REQUEST = json_decode(' . var_export(json_encode($req), true) . ', true);' .
        ' include __DIR__ . "/deploy-agent-under-test.php";');
    $cmd = sprintf('%s -d error_reporting=E_ALL %s 2>&1',
        escapeshellarg(PHP_BINARY), escapeshellarg($APP . '/boot-under-test.php'));
    exec($cmd, $out, $rc);
    $body = implode("\n", $out);
    $body = preg_replace('/(?:Warning|Notice):[^\n]*headers[^\n]*\n?/s', '', $body);
    return [$rc, json_decode($body, true), $body];
}

$pass = 0; $fail = 0;
function check($label, $cond, $extra = '') {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; echo "  FAIL  $label  $extra\n"; }
}
$KEY = str_repeat('k', 40);

echo "== 1. auth ==\n";
[, $j, $raw] = run_agent('status', 'wrong-key');
check('wrong key rejected', ($j['ok'] ?? true) === false || str_contains($raw, 'invalid key'), $raw);

echo "== 2. status reports both targets ==\n";
[, $j, $raw] = run_agent('status', $KEY);
check('ok', ($j['ok'] ?? false) === true, $raw);
check('standalone_build=OLD-BUILD', ($j['standalone_build'] ?? '') === 'OLD-BUILD', $raw);
check('static_build_dir_present=true (OLD-BUILD dir exists)', ($j['static_build_dir_present'] ?? false) === true, $raw);
check('build_ids_match=true', ($j['build_ids_match'] ?? false) === true, $raw);

echo "== 3. bad zip rejected, production untouched ==\n";
copy($TMP . '/bad.zip', $APP . '/app.zip');
[, $j, $raw] = run_agent('deploy', $KEY);
check('rejected', ($j['ok'] ?? true) === false, $raw);
check('server.js still OLD', file_get_contents($STAND . '/server.js') === 'OLD CODE');
check('OLD-BUILD static dir untouched', is_dir($STATIC . '/OLD-BUILD'));

echo "== 4. good zip deploys to BOTH targets ==\n";
copy($TMP . '/good.zip', $APP . '/app.zip');
[, $j, $raw] = run_agent('deploy', $KEY);
check('ok', ($j['ok'] ?? false) === true, $raw);
check('standalone_build=NEW-BUILD', ($j['standalone_build'] ?? '') === 'NEW-BUILD', $raw);
check('static_build_dir_present=true (NEW-BUILD dir created)', ($j['static_build_dir_present'] ?? false) === true, $raw);
check('server.js=NEW CODE (server tree)', file_get_contents($STAND . '/server.js') === 'NEW CODE');
check('static/NEW-BUILD/ dir mirrored (Apache target)', is_dir($STATIC . '/NEW-BUILD'));
check('static/NEW-BUILD/_ssgManifest.js written', file_get_contents($STATIC . '/NEW-BUILD/_ssgManifest.js') === 'SSG');
check('static/chunks/new.js mirrored', file_get_contents($STATIC . '/chunks/new.js') === 'NEWCHUNK');
check('.next/server chunk extracted', file_get_contents($STAND . '/.next/server/app/page.js') === 'SERVERCHUNK');
check('htaccess preserved', file_get_contents($APP . '/.htaccess') === 'PassengerAppRoot "/home/safro/travel-app"');
check('standalone .env preserved (zip env not landed)', file_get_contents($STAND . '/.env') === 'DATABASE_URL=prod-secret');
check('app-root .env preserved', file_get_contents($APP . '/.env') === 'AUTH_SECRET=app-root-secret');
check('uploads NOT overwritten', file_get_contents($APP . '/uploads/user.png') === 'PNGDATA');
check('backup NOT deleted', file_get_contents($APP . '/backup/db.sql') === 'DUMP');
check('zipslip blocked', !file_exists($TMP . '/evil.php'));
check('restart.txt touched in app root', file_exists($APP . '/tmp/restart.txt'));
check('restart.txt touched in standalone', file_exists($STAND . '/tmp/restart.txt'));

echo "== 5. snapshot of current standalone tree ==\n";
[, $j, $raw] = run_agent('snapshot', $KEY);
check('ok', ($j['ok'] ?? false) === true, $raw);
$relPath = $RELEASES . '/' . ($j['release'] ?? '');
check('release exists on disk', is_file($relPath));
$names = [];
if (is_file($relPath) && filesize($relPath) > 0) {
    $za = new ZipArchive(); $za->open($relPath);
    for ($i=0;$i<$za->numFiles;$i++) $names[] = $za->getNameIndex($i);
    $za->close();
}
check('snapshot has server.js', in_array('server.js', $names));
check('snapshot excludes .env', !in_array('.env', $names), implode(',', array_slice($names,0,8)));

echo "== 6. break both targets, then rollback ==\n";
file_put_contents($STAND . '/server.js', 'BROKEN');
file_put_contents($STAND . '/.next/BUILD_ID', 'BROKEN');
rrmdir($STATIC . '/NEW-BUILD');   // simulate the static target being wiped
[, $j, $raw] = run_agent('rollback', $KEY);
check('rollback ok', ($j['ok'] ?? false) === true, $raw);
check('server.js restored', file_get_contents($STAND . '/server.js') === 'NEW CODE', 'got: ' . file_get_contents($STAND . '/server.js'));
check('standalone BUILD_ID restored', file_get_contents($STAND . '/.next/BUILD_ID') === 'NEW-BUILD');
check('static NEW-BUILD dir restored', is_dir($STATIC . '/NEW-BUILD'));

echo "== 7. missing key file => inert ==\n";
unlink($APP . '/deploy-agent.key');
[, $j, $raw] = run_agent('status', $KEY);
check('inert without key file', ($j['ok'] ?? true) === false, $raw);

echo "\n$pass passed, $fail failed\n";
rrmdir($TMP);
exit($fail === 0 ? 0 : 1);
