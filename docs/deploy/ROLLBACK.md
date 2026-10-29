# Rollback runbook — SafroTravel production

The pipeline auto-rolls-back when a deploy fails its health check. This
document covers the manual cases: a deploy that went green but broke something
in a way the health check can't see, or a rollback that itself failed.

Production: `https://www.safrotravel.com`, Node app root `/home/safro/travel-app`
(Passenger, startup `.next/standalone/server.js`, Node 24), Apache-served static
at `/home/safro/public_html/_next/static`, restart via `touch tmp/restart.txt`.
No SSH — everything below is over HTTPS (agent) or FTP.

`<KEY>` is the value in the server's `/home/safro/travel-app/deploy-agent.key`
(also stored as the `AGENT_KEY` GitHub secret).

## 1. Fastest: agent rollback (seconds)

```bash
# What is available to restore?
curl -s -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=status" \
  https://safrotravel.com/deploy-agent.php
#   -> "releases": ["app-20261030-101500.zip", ...]  (newest first)

# Roll back to the most recent release:
curl -s -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=rollback" \
  https://safrotravel.com/deploy-agent.php

# Or pin a specific release:
curl -s -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=rollback" \
  --data-urlencode "release=app-20261030-101500.zip" \
  https://safrotravel.com/deploy-agent.php
```

The agent re-extracts that zip over **both** targets — the Node tree
(`travel-app/.next/standalone`) and the Apache static dir
(`public_html/_next/static`) — still never touching `.env*`, `.htaccess`,
`uploads/`, `backup/`, and touches both `restart.txt` files.

Verify:

```bash
curl -s https://www.safrotravel.com/api/health
#   {"status":"healthy","database":"connected"}
curl -s -X POST --data-urlencode "key=<KEY>" --data-urlencode "step=build-check" \
  https://safrotravel.com/deploy-agent.php
#   "standalone_build" and "static_build" should both match the release you restored
```

## 2. If the agent is broken or unreachable

Fall back to the last-known-good artifact.

1. The previous build's zip is kept on the server as
   `/home/safro/travel-app/app-prev.zip` (the state before the latest deploy).
   Fetch it over FTP if you want a local copy.
2. Download the desired release zip from `/home/safro/travel-app/releases/` over FTP.
3. Re-upload it to `/home/safro/travel-app/app.zip`.
4. Trigger `step=deploy` — it will validate markers and extract. (This also
   rotates the current broken build into `releases/`, so you can go forward
   again.)

If even that fails, the pre-pipeline artifacts still work: the old manual flow
(`server.zip` extracted to `travel-app/.next/standalone`, `static.zip` extracted
to `public_html/_next/static`, via `deploy-fix.php`) is described in `DEPLOY.md`.
Those zips are legacy but still present in the app root.

## 3. If the app is up but the DB is wrong

**Rolling back code does not roll back data.** Migrations in this project are
applied by hand as reviewed SQL (`MIGRATIONS.md`), so a bad data change is not
reverted by a code rollback.

Restore from a DB dump:

1. Dumps live in `/home/safro/travel-app/backup/` (and `/backups/`), named like
   `<db>_<date>.sql` (e.g. one from mid-October).
2. Take a fresh dump **first** so you don't destroy the evidence:
   via phpMyAdmin export, or ask the agent host panel's MySQL tool.
3. Import the chosen dump over phpMyAdmin (cPanel → MySQL Databases → phpMyAdmin).
4. Verify row counts against the numbers in `PIPELINE.md`'s checklist.

## 4. If you need to stop the pipeline from deploying

- Pushes to `fix/seatmap-mobile` trigger it. To halt: repo → Settings →
  Actions → General → disable workflows, or simply push to another branch.
- An in-flight run can be cancelled from the Actions tab. Cancelling during the
  "Trigger server-side deploy" step is safe — the agent-side extract either
  completed or will be caught by the next health check, and `app-prev.zip` /
  `releases/` still hold the previous build.
- Never cancel during "Upload app.zip via FTP": a truncated `app.zip` would be
  validated (and rejected) by the agent's marker check, so production is still
  protected — but you'd waste a build.

## 5. Nuclear: restore the whole app tree

`step=snapshot` on the agent zips the *current* standalone tree into
`travel-app/releases/`. If you took a snapshot before a risky change,
`step=rollback&release=<that zip>` restores the Node code tree as it was (minus
env files and DB dumps — those are data and are backed up separately). Static
assets under `public_html/_next/static` are also restored from the zip's
`.next/static` subtree.

For a full host-level restore, use cPanel's backups feature (it covers both
files and MySQL), which is independent of anything in this repo.

## After any rollback

1. Note the restored BUILD_ID.
2. Open the failing commit on GitHub and either fix-forward or revert.
3. Before re-deploying, confirm the pipeline's next run is green locally:
   `npm ci && npm run deploy:generate && npm run build`.
4. If three rollbacks of the same change have happened, stop and investigate
   rather than retrying — see `DIAGNOSTICS.md`.
