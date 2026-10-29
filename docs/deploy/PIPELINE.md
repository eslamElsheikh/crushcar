# GitHub Actions → cPanel deployment pipeline

Status: implemented, pending first production run (see "First deploy" below).

Replaces the manual File Manager / FTP zip-upload process, and replaces the old
Vercel workflow (`.github/workflows/deploy.yml` was Vercel; it is now cPanel).

## Why GitHub Actions and not cPanel Git Version Control

Researched against cPanel docs (see `CPANEL-CAPABILITIES.md`). Summary:

- cPanel's Git Version Control can clone a repo and run `.cpanel.yml` tasks on
  pull, but it **cannot build** — there is no npm/Next.js toolchain on the
  shared host, and no webhook, so nothing triggers automatically.
- The app is `output: 'standalone'`, and the host runs it under Passenger with
  Node **24** at `/home/safro/nodevenv/travel-app/24/bin/node`. A Linux CI
  runner produces Prisma query engines and `sharp` binaries that match the
  server OS; a Windows laptop build does not (that mismatch is a recurring
  production failure documented in `DEPLOY.md`).
- The only restart mechanism on this host is `touch tmp/restart.txt`.

## Flow

```
git push origin fix/seatmap-mobile   (or Actions → Run workflow)
        │
        ▼
GitHub Actions (ubuntu-latest, Node 24)
  1. php -l + php scripts/test-deploy-agent.php   (agent lint + 32 assertions)
  2. npm ci
  3. npm run deploy:generate          prisma generate (MySQL schema)
  4. npm run build                    NEXTAUTH_URL=https://www.safrotravel.com
  5. npm run deploy:bundle            assemble standalone tree + zip
        │                             (deploy/app.zip, forward slashes, no .env)
        ▼
  6. curl FTP upload                  app.zip → /home/safro/travel-app/app.zip
        │
        ▼
  7. POST deploy-agent.php            step=deploy
        │                             - validates zip markers BEFORE extracting
        │                             - archives previous artifact → travel-app/releases/
        │                             - extracts server tree → travel-app/.next/standalone
        │                             - mirrors .next/static/** → public_html/_next/static
        │                             - touches restart.txt in travel-app/tmp and standalone/tmp
        ▼
  8. verify https://www.safrotravel.com/api/health
      verify BOTH live BUILD_IDs == built BUILD_ID
        │
        └─ on failure → POST step=rollback → re-verify health → fail the run
```

## The two deploy targets (this is the part that breaks things if wrong)

Production's `.htaccess` (CloudLanguages Passenger block) sets:

```
PassengerAppRoot      "/home/safro/travel-app"
PassengerStartupFile  .next/standalone/server.js
```

So `/home/safro/travel-app/.next/standalone/` is the **Node server tree** that
Passenger runs. But `/home/safro/public_html/` (= `/www`) is a **separate
directory that also holds WordPress**, and Apache/LiteSpeed serves
`/_next/static/*` straight from `public_html/_next/static/`.

A deploy therefore writes to **two** places. Updating only the Node tree leaves
`/api/health` green while every page's JS/CSS 404s or serves stale assets —
which is exactly why the agent reports and cross-checks both:

| Target | Path | Served by | Verified by |
| --- | --- | --- | --- |
| Node server tree | `/home/safro/travel-app/.next/standalone/` | Passenger | `.next/BUILD_ID` file |
| Static assets | `/home/safro/public_html/_next/static/<BUILD_ID>/` + `chunks/` + `css/` | Apache/LiteSpeed | the `<BUILD_ID>` **directory** existing |

Note: `public_html/_next/static/` contains one directory per build (named by
BUILD_ID) plus shared `chunks/` and `css/`. There is **no** `BUILD_ID` file
there — the old `deploy-fix.php` checked for one and therefore reported
`match=NO` on every deploy even while the site worked. This agent checks for the
per-build directory instead, which is what Apache actually serves.

`build_ids_match` must be `true` after every deploy. (The pipeline's verify
step enforces it too, so a half-update fails the run and auto-rolls-back.)

## Components

| File | Purpose |
| --- | --- |
| `.github/workflows/deploy.yml` | CI: build, bundle, upload, deploy, verify, auto-rollback |
| `scripts/assemble-standalone.mjs` | Merges `.next/standalone` + `.next/static` + `public` + MySQL Prisma schema into `deploy/standalone-app/` |
| `scripts/zip-deploy.mjs` | Zips with forward-slash entry names, skips `.env*` (existing script, reused) |
| `scripts/deploy-agent.php` | Server-side endpoint. **Tracked, contains no secrets.** |
| `scripts/test-deploy-agent.php` | Local harness — 26 assertions against the agent's real logic |
| `docs/deploy/ROLLBACK.md` | Manual rollback runbook |

The agent keeps at most 3 release zips in `/home/safro/travel-app/releases/`
(inside `APP_ROOT`, which is not web-accessible and is definitionally writable —
Passenger touches `tmp/restart.txt` there). It stores the artifact it just
replaced as `travel-app/app-prev.zip`, so `step=rollback` restores the previous
build.

The agent resolves its paths from **absolute constants**, not `__DIR__`, because
it is uploaded to `public_html/` (the web root, alongside WordPress) while the
Node app lives in `travel-app/`. `scripts/test-deploy-agent.php` points all
three paths at a temp tree via `DEPLOY_TEST_ROOT` and runs 32 assertions against
the agent's real logic — auth, bad-zip rejection, dual-target extraction,
`.env`/`.htaccess`/`uploads`/`backup` preservation, zip-slip blocking, snapshot,
and rollback of both targets.

## What a deploy never touches

Enforced in `scripts/deploy-agent.php` (`PROTECTED_PATHS`, `DATA_PREFIXES`) and
in `scripts/zip-deploy.mjs` (skips `.env*` at pack time):

- `.env`, `.env.*` (all env files — production owns them; a zip must never
  carry one, and rollback must never restore a stale one)
- `.htaccess` (the Passenger config + CloudLinux `SetEnv` block + the
  SafroTravel WordPress-bypass rewrite — all three live in `public_html/.htaccess`)
- `.user.ini`, other `*.php` files on the server, the agent itself
- `uploads/` (user content), `backup/`, `backups/` (DB dumps)
- `tmp/`, `logs/`

Env vars additionally come from the `SetEnv` block in `public_html/.htaccess`
(`AUTH_SECRET`, `DATABASE_URL`, `NEXTAUTH_URL`, `SMTP_*`, `JOB_CRON_KEY`). The
agent never edits `.htaccess`, so those are safe by construction.

## Prisma

CI runs `npm run deploy:generate` → `prisma generate --schema=prisma/schema.mysql.prisma`.
The bundle ships `prisma/schema.prisma` (the MySQL one) so the runtime client
resolves the right schema.

**Migrations are NOT applied by the pipeline.** Production is MariaDB and the
checked-in migrations are SQLite-flavored dev migrations; `prisma migrate deploy`
cannot run there. Schema changes are reviewed SQL applied by hand — see
`MIGRATIONS.md`.

## Required GitHub secrets

Set on the repo (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `FTP_HOST` | from `DEPLOY.md` (host name / IP) |
| `FTP_USER` | from `DEPLOY.md` |
| `FTP_PASS` | from `DEPLOY.md` |
| `FTP_BASE_PATH` | `/travel-app` (FTP cwd + app dir, no trailing slash) |
| `AGENT_URL` | `https://safrotravel.com/deploy-agent.php` |
| `AGENT_KEY` | 32+ random chars; must equal the contents of the server's `deploy-agent.key` |

Generate the key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## One-time server setup (first deploy)

Done by hand over FTP, once:

1. Upload `scripts/deploy-agent.php` → `/home/safro/public_html/deploy-agent.php`
   (the web root, where the live `deploy-fix.php` already sits — this is the
   only PHP file that must be web-reachable).
2. Upload a key file → `/home/safro/travel-app/deploy-agent.key` (the 32+ char
   key; **not** in git). chmod 600 if the panel allows. Note it goes in
   `travel-app/`, not `public_html/` — the agent reads it via the absolute
   `APP_ROOT` path, so it is never web-accessible.
3. Verify it is inert without the key and live with it:
   - `curl https://safrotravel.com/deploy-agent.php` → 403 "not configured"
   - `curl -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=status" https://safrotravel.com/deploy-agent.php` → JSON with both BUILD_IDs
4. Take a fresh DB backup and prove it restores cleanly (pure PHP, no
   mysqldump/SSH needed — this is the safety net before any code changes):
   - `curl -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=dbdump" https://safrotravel.com/deploy-agent.php`
     → writes `backup/db-<ts>.sql`, returns table + row counts.
   - `curl -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=dbverify" --data-urlencode "file=<basename from dbdump>" https://safrotravel.com/deploy-agent.php`
     → restores into `rt_`-prefixed scratch tables, compares row counts, drops
       the scratch tables. `rows_match` all `true` + `scratch_dropped: true`.
5. Create the initial rollback artifact:
   `curl -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=snapshot" https://safrotravel.com/deploy-agent.php`
   → `travel-app/releases/app-<ts>.zip` (zips the current standalone tree).
6. **Delete the old agent** `public_html/deploy-fix.php` — it authenticates with
   a short, guessable, hardcoded key committed to this repo's history, and its
   `fulldeploy` endpoint can wipe the app dir. As long as it exists, anyone who
   can guess that key can overwrite production. Confirm it is gone:
   `curl -s -o /dev/null -w '%{http_code}' https://safrotravel.com/deploy-fix.php?key=<OLD>&step=status` → 404.
7. Set the six GitHub secrets, then push / run the workflow.

## First production run — verification checklist

- [ ] `step=status` shows `ZipArchive ok`, `build_ids_match: true`, and the
      expected `standalone_build`/`static_build`
- [ ] Fresh `step=dbdump` wrote `backup/db-<ts>.sql`; `step=dbverify` on it
      returned all `rows_match: true` and `scratch_dropped: true`
- [ ] `step=snapshot` produced `travel-app/releases/app-<ts>.zip` (rollback source exists)
- [ ] Old `deploy-fix.php` returns 404
- [ ] Workflow run is green through "Verify live site"
- [ ] `https://www.safrotravel.com/api/health` → `{"status":"healthy","database":"connected"}`
- [ ] `step=build-check` shows both BUILD_IDs equal to the run's BUILD_ID
- [ ] Homepage, login, a booking flow, and the seat map load (JS/CSS actually
      serve — this is what a green `/api/health` does NOT prove)
- [ ] `uploads/` file count and `backup/` dumps unchanged
- [ ] DB row counts unchanged (`Trip`, `Booking`, `Company`, `User`)

## Operational notes

- **Branch:** pushes to `fix/seatmap-mobile` deploy automatically. `master` is
  ~127 commits behind and is not wired up; after merging, update the branch
  filter in `deploy.yml`.
- **Concurrency:** the workflow uses a `production-deploy` group with
  `cancel-in-progress: false`, so a second push waits rather than killing a
  deploy mid-extract.
- **Restart:** `touch tmp/restart.txt` (Passenger). Takes a few seconds; the
  health check retries for 5 minutes.
- **Logs:** `/home/safro/travel-app/logs/deploy-agent.log` (rotates at 512KB).
- **DB backups:** `step=dbdump` dumps every table to `backup/db-<ts>.sql` in pure
  PHP (no mysqldump/SSH). `step=dbverify` restores a dump into `rt_`-prefixed
  scratch tables and compares row counts — it never writes to live tables and
  drops the scratch tables when done. Both run under the same agent key.
- **Legacy junk** in the app root (`nm-s*.zip` shards, `server.zip`,
  `static.zip`, `public.zip` — ~135MB) is left alone by the agent and excluded
  from snapshots. Removing it needs explicit approval.
- **PHP:** the agent needs `ZipArchive` and PHP ≥ 8.0 (`str_starts_with`). The
  existing `deploy-fix.php` already required both, so the host satisfies them.
