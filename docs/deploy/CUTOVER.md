# Safro V2 — cPanel Node App Cutover Runbook

Run every step on a maintenance window. Commands are run from the app root
(the folder cPanel "Node.js App" points at), as the app user.

## 0. Preconditions

- The V2 code is uploaded (git clone / file manager). Branch: `feature/safro-v2-redesign`.
- Node 18.18+ available in cPanel → Terminal or "Setup Node.js App".
- You have MySQL credentials for the live database (host, user, password, db name).

## 1. Back up the live database first

```bash
mysqldump -h DB_HOST -u DB_USER -p DB_NAME > backup-$(date +%Y%m%d-%H%M).sql
```

Keep that file outside the app folder (e.g. `~/backups/`). This is the only
artifact you need for rollback of data.

## 2. Apply the additive Destination SQL (schema only)

```bash
mysql -h DB_HOST -u DB_USER -p DB_NAME < docs/deploy/destination-mysql.sql
```

- Additive only: creates one new table (`Destination`) with `IF NOT EXISTS`.
- Verified idempotent (re-run tested on a scratch MySQL 8.0).
- Never run `prisma migrate dev` or `prisma db push` against production.

> If production turns out to be SQLite/Postgres instead of MySQL, stop and ask —
> the committed migration (`prisma/migrations/20261001224242_add_destination`)
> or `prisma db push` against a STAGING copy applies there. See §8.

## 3. Environment variables

In cPanel → Setup Node.js App → (app) → "Environment Variables", set:

| Key | Value |
|---|---|
| `DATABASE_URL` | production DSN, e.g. `mysql://USER:PASS@HOST:3306/DBNAME` |
| `AUTH_SECRET` | new random secret (never the dev placeholder) |
| `NEXTAUTH_URL` | `https://your-domain.com` |
| `UPLOAD_DIR` | absolute path OUTSIDE the app folder, e.g. `/home/USER/safro-uploads` |
| `SMTP_*` | as configured (see `.env.example` for the list) |

`UPLOAD_DIR` outside the app folder matters: cPanel deletes/replaces the app
folder on re-deploys — user-uploaded photos would be lost otherwise.

```bash
mkdir -p /home/USER/safro-uploads && chmod 755 /home/USER/safro-uploads
```

## 4. Install dependencies (sharp needs a native binary)

```bash
npm ci
```

If `npm ci` is unavailable: `npm install`. `sharp` downloads a prebuilt binary
for the server's OS/arch during install — no compiler needed. If the install ran
as the wrong user, re-run it as the app user so `node_modules/sharp` is readable.

## 5. Generate the Prisma client (do NOT migrate)

```bash
npx prisma generate
```

This only writes client code. It does not touch the database.

## 6. Restart, then seed (manual, once)

Restart from cPanel → "Restart App" (or `npx next start` under the app's process
manager).

Then run the destinations seed **manually, exactly once** — it never runs at
startup, it upserts by slug with an empty update clause (inserts only missing
rows; never edits or deletes existing rows):

```bash
npx tsx scripts/seed-destinations.ts
```

Expected output: `destinations=4`. Re-running is safe (verified: leaves
admin-edited rows untouched, count stable).

The four seed photos are committed static assets in `public/destinations/`
(served at `/destinations/*.jpg`) — they deploy with the code; no copy step.

## 7. Smoke tests (browser + terminal)

```bash
# pages
curl -I https://your-domain.com/                 # 200
curl -I https://your-domain.com/destinations     # 200
curl -I https://your-domain.com/credits          # 200
curl -I https://your-domain.com/login            # 200

# data
curl -s https://your-domain.com/api/destinations | grep -c '"slug"'   # 4 (after seed)
```

Manual checks: home renders, footer "حقوق الصور" link works, each destination
card shows its city photo (not the navy fallback), search card has
ذهاب/ذهاب وعودة toggle, an admin upload through
`/admin/destinations` lands in `UPLOAD_DIR` and renders.

## 8. Data layer honesty note (read before choosing a host)

`prisma/schema.prisma` declares `provider = "sqlite"` and `.env.example`
defaults to `file:./dev.db`. No file in this repo says what production runs.
- **If the live DB is MySQL** (likely on cPanel): schema provider must be
  switched to `mysql` + `npx prisma generate` + `npx prisma db push` on a STAGING copy
  first; tables' shape matches `docs/deploy/destination-mysql.sql`.
- **If it is SQLite**: the app must ship with the DB file writable and outside
  git (note `*.db` is git-ignored), and `DATABASE_URL="file:./data/prod.db"`.
- **If it is Postgres**: provider `postgresql` + `prisma generate`.
Ask the hoster which engine the live database uses before §2.

## 9. Transition Cron Job

Trip statuses transition automatically from `SCHEDULED` to `IN_PROGRESS` and `COMPLETED` based on departure and arrival timestamps.
In V1, `/api/jobs/transition` supports two authentication models:
1. **Cron header**: `x-cron-key: <JOB_CRON_KEY>` matching environment variable `JOB_CRON_KEY`.
2. **Admin session**: NextAuth session cookie for a user with `role === 'SUPER_ADMIN'`.

### Cron Configuration (cPanel Cron Jobs)
Schedule every 5 minutes:
```bash
*/5 * * * * curl -s -X POST https://your-domain.com/api/jobs/transition -H "x-cron-key: YOUR_JOB_CRON_KEY" > /dev/null 2>&1
```
Or with `wget`:
```bash
*/5 * * * * wget -qO- --post-data="" --header="x-cron-key: YOUR_JOB_CRON_KEY" https://your-domain.com/api/jobs/transition > /dev/null 2>&1
```

### Expected HTTP Status Codes
- `200 OK`: Transition ran successfully, response body: `{"ok":true}`.
- `401 Unauthorized`: Request missing `x-cron-key` and not authenticated as `SUPER_ADMIN`.
- `403 Forbidden`: Authenticated as non-super-admin (e.g. `CUSTOMER` or `COMPANY_ADMIN`).
- `500 Internal Server Error`: Execution failed during trip query or transaction update.

> **Backend Gap Note**: In V2 redesign codebase, `src/app/api/jobs/transition/route.ts` is currently missing while called from `src/app/admin/page.tsx:39`. When restoring, ensure it accepts both `x-cron-key` and `SUPER_ADMIN` session as defined above.

## 10. Rollback

1. **Code**: cPanel file manager keeps app copies, or re-upload the previous
   release (pre-V2 tag `v1-final` / branch `backup/pre-safro-v2`).
2. **Schema**: nothing to undo for §2 if you are staying on the old release —
   the extra `Destination` table is ignored by V1 code. Only drop it if the DBA
   insists: `DROP TABLE Destination;`
3. **Data**: restore the backup from §1:

```bash
mysql -h DB_HOST -u DB_USER -p DB_NAME < backup-YYYYMMDD-HHMM.sql
```
