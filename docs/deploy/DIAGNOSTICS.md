# Production diagnostics

These scripts were written to diagnose the production deployment on
`https://safrotravel.com`. They are kept because they answer questions that
come up again on every deploy, and because they were the evidence for the
deploy problems they were written for.

**They have not been deleted.** They are untracked in git and were not part of
this change. Removing them is a separate decision, and one that should be made
deliberately — several of them are the only record of what production was
actually doing when it broke.

## ⚠ They are not committed, and must not be

All nine contain the same hardcoded production deploy key, and
`deploy-fix.php` — which can rewrite the deployed code and the `.env` files —
is **still live in production `public_html`**. Committing these files would
put a working production credential into the repository history, where it
cannot be removed by editing the file afterwards.

So they stay on disk and out of git. If they ever need to be committed, the
key has to be moved out of the source first — into an environment variable the
scripts read, and into production's own configuration — and the existing key
has to be rotated, because the one in these files is the one production
accepts today.

| Script | What it answers |
| --- | --- |
| `db-diag.php` | Which database does the app actually use, and is the pending migration target present? |
| `db-diag2.php` | Does the production `DATABASE_URL` password contain `@`? `deploy-fix.php` parses it with `([^@]+)` and aborts on such a password. |
| `deploy-fix.php` | The deploy tool itself: clean, extract, fix `.env`, launch the install. **Still live in production.** |
| `deploy-state.php` | What is actually on disk after a deploy? Used when a deploy ended without setting its completion flag. |
| `migrate-refcounter.php` | Creates the `ReferenceCounter` table that backs sequential booking references (`ST-…-26-000001`). **This one writes.** It is idempotent. |
| `repair-env.php` | Repairs `DATABASE_URL` in the standalone `.env` files. `deploy-fix.php` validates `DATABASE_URL` in all three env files and aborts if any is malformed. **This one writes.** |
| `verify-ref.php` | End-to-end proof that the deployed build can mint a booking reference. Runs the exact raw SQL from `src/lib/booking-reference.ts`. |
| `verify-static.php` | Will the browser be able to load this build's chunks after the Node.js restart? A stale or partial static tree is the ChunkLoadError cause. |
| `verify-static2.php` | The same static-asset check, second implementation, used to cross-check the first. |

Every one of them is a **read-only diagnostic**, except where the name says
otherwise. They print what they find and change nothing.


## How they were used

They were uploaded to `public_html` one at a time, run over HTTP, and read.
That is why they are PHP: production runs PHP under cPanel, and the app
itself is Next.js, so a PHP script is the one thing that can be dropped in and
run without touching the running application or its Node process.

The other eight were confirmed absent from production `public_html`. Only
`deploy-fix.php` remains there.

## Running them again

```bash
# From the production public_html, with the key:
php db-diag.php
```

They are read-only and print no secrets — `db-diag.php` reports the *shape* of
the configuration, not the credentials.
