# cPanel Git-Based Deployment for Next.js 15 (standalone) on Shared Hosting — Research Report

Status: complete. Primary sources: docs.cpanel.net, api.docs.cpanel.net, docs.cloudlinux.com, cloudlinux.zendesk.com, support.cpanel.net, nextjs.org. All URLs verified during research (Oct 2026).

## 0. Critical disambiguation: three different "Node.js app" stacks

Before the answers: cPanel hosts run one of three different stacks, and they behave completely differently. Confirm which one your host runs (see §9 checklist).

| Stack | Who ships it | Where it lives | Env vars | Restart |
|---|---|---|---|---|
| **A. NodeJS Selector ("Setup Node.js App")** | CloudLinux (LVE Manager / lvemanager), NOT cPanel | cPanel UI link "Setup Node.js App" (Feature Manager links it to docs.cloudlinux.com) | not documented in cPanel docs — UNKNOWN | manual Restart button / after "Run NPM Install"; `touch tmp/restart.txt` also applies (it uses `mod_passenger`) |
| **B. cPanel Application Manager** | cPanel (Passenger, ea-apache24-mod_passenger) | cPanel » Software » Application Manager | Apache userdata conf (§5) | Passenger smart spawning + `tmp/restart.txt` |
| **C. cPanel Meridian "Web Apps"** | cPanel ≥ 138 (AI App Hosting / Meridian) | cPanel » Websites / Web Apps | app `.env` file (§5) | UI Start/Stop/Restart/Redeploy + UAPI `WebApp::restart` (server-owner only) |

Git Version Control is a **fourth, independent feature** (cPanel » Files » Git Version Control) — it is not wired into any of the three Node stacks. You connect them yourself via `.cpanel.yml` tasks.

---

## Q1 — Git Version Control mechanics & auth — **YES**

- Repo location: `/home/USERNAME/repositories/REPONAME`.
- Auto deploy hook: "cPanel's Git Version Control interface … automatically adds a post-receive hook to all cPanel-managed repositories. When you push changes directly to a cPanel-managed repository that includes a `.cpanel.yml` file, the hook deploys those changes automatically." — https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-deployment
- Manual: **Update from Remote** = pull (`--ff-only`; "The system pulls changes with the `--ff-only` option and will only succeed if the branch's HEAD commit is up-to-date or Git can fast forward it"); **Deploy HEAD Commit** = runs `.cpanel.yml` tasks.
- Deploy preconditions (enforced; UI hides/disables deploy otherwise): "A valid checked-in `.cpanel.yml` file in the top-level directory. One or more local or remote branches. A clean working tree." — https://api.docs.cpanel.net/specifications/cpanel.openapi/deployment-settings.md ; "The system cannot deploy changes for repositories with dirty working trees." — https://docs.cpanel.net/cpanel/files/git-version-control
- Without shell access: "Without shell access, you can **only** create, clone, delete, and view repositories." (same page)
- Private repos: HTTPS read-only clone with token, or SSH deploy key — `~/.ssh/cpanel_rsa` + `~/.ssh/config` alias, clone as `git@github.com-<alias>:user/repo.git`. — https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-set-up-access-to-private-repositories
- Non-default Git config cPanel applies: `receive.denyCurrentBranch=updateInstead`, `gc.auto` disabled; deploy state in `~/.cpanel/datastore/vc_deploy.sqlite`. — https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-advanced-configuration-and-troubleshooting

---

## Q2 — `.cpanel.yml` syntax, when it runs, env vars — **YES (syntax/run) / no built-in env mechanism**

Official syntax (verbatim example from https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-deployment):

```yaml
---
deployment:
  tasks:
    - export DEPLOYPATH=/home/example/public_html/
    - /bin/cp index.html $DEPLOYPATH
```

- Structure: top-level `deployment:` → `tasks:` → an array of **bash commands run in order** in the account's shell. Comments start with `#` ("To add comments to this file, add a line that begins with the hash character (`#`)"). Docs restrict entries to YAML-valid characters; wildcards are not supported (Advanced Configuration guide). File must be committed to the repo top-level dir (check it in to your **remote** repo, not the cPanel copy — Git Version Control page).
- **When it runs:** (1) automatically on `git push` to the cPanel repo (post-receive hook, if `.cpanel.yml` present); (2) manually via **Deploy HEAD Commit**; (3) on a schedule via cron calling UAPI: `/usr/local/cpanel/bin/uapi VersionControlDeployment create repository_root=/home/user/example` — https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-set-up-deployment-cron-jobs
- **Env vars:** no built-in variable mechanism is documented. `DEPLOYPATH` in the official example is just a shell `export` you define **inside a task**; subsequent tasks are separate commands but share the session per docs' ordering model — treat each task as a bash line and export at the top as shown. No `.env`-injection, no per-variable UI: **UNKNOWN/not documented** as a platform feature.
- **UNKNOWN (not documented anywhere official):** task timeout, max number of tasks, concurrent-deploy limits, captured log size caps, shell used, working directory per task (implicitly the repo dir — not explicitly pinned in docs).

---

## Q3 — "Setup Node.js App" + Version Control tab: npm install / build / restart / Node 22 / file rewrites — **MIXED**

First, what "Setup Node.js App" **is**: on CloudLinux shared hosts it is the **CloudLinux NodeJS Selector**, not a cPanel feature (cPanel's Feature Manager links that menu item to CloudLinux docs: https://docs.cpanel.net/whm/packages/feature-manager/; install article: https://support.cpanel.net/hc/en-us/articles/360047322274-How-to-install-NodeJS-Selector-on-CloudLinux). cPanel's own equivalents are Application Manager (Passenger) and Meridian Web Apps (≥138).

**Version Control tab inside the Node app UI — NO documented feature / effectively UNKNOWN:**
- No cPanel doc and no CloudLinux doc describes a "Version Control" tab inside Setup Node.js App. The official CloudLinux Node.js Selector documentation (https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/ §"Node.js Selector" and §"Node.js deployment") documents: app create (path, URI, Node version), **Run NPM Install**, Restart, and *IDE/remote* deployment (JetBrains "Preferences → Deployments", FTP/SCP) — never Git pull. Grep of that doc: zero occurrences of "version control"/"webhook".
- Therefore: **automatic "git pull → npm install → build → restart" inside the Node app UI = NO (not a documented feature of the Selector).** The documented workflow is: clone with **Git Version Control** (Files menu), then run **Run NPM Install** manually in Setup Node.js App, then point the app at the code.
- After "Run NPM Install": "Selector then restarts and checks the application" (CloudLinux blog, official: https://blog.cloudlinux.com/shared-node-modules-store-for-nodejs-selector-now-in-beta).

**npm install:** YES, but **manual** — "Run NPM Install" button (Selector), or `PassengerApps::ensure_deps type=npm app_path=...` (cPanel Application Manager UAPI). Auto-install on git deploy: only in **Meridian ≥138**, where deploy "installs deps + builds + starts" (https://docs.cpanel.net/cpanel/meridian/websites/deploy-a-website-with-nodejs/). Selector "availability check" pitfall (host-dependent): after npm install it probes the app and can show "check availability of application has failed" if the app doesn't answer.

**Build step:** No `npm run build` is run by the Selector or by Git Version Control deploy — you must put it in `.cpanel.yml` tasks yourself (e.g. `cd ~/repositories/myrepo && npm run build`). Meridian (≥138) does build, and "fails if the build produces no output dir"; **Redeploy** = rebuild + apply env vars + deploy new code from git; force-push breaks redeploy; SSH key passphrase not saved.

**Restart:** YES (manual/relevant buttons) — Selector "Restart" button, Application Manager app restart (Passenger smart spawning picks up changes on next request after `tmp/restart.txt`), Meridian Restart/Redeploy.

**Node.js 22:** Possible but **host-dependent (UNKNOWN for your host)**:
- Selector: CloudLinux ships `alt-nodejs 22.x` (and 24.x) for CloudLinux OS 8/9/10 — docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components (§Supported versions). The admin must have installed + enabled it; users see only enabled versions. Creating an app with it: `cloudlinux-selector create --json --interpreter nodejs --version 22 --app-root <app> --domain <domain> --app-uri /`.
- cPanel EA4: `ea-nodejs22` exists (latest 22.23.4 in EA 25.92, 2026-10-21) — but whether your host installed/enabled it = host-dependent.
- Do not assume Node 22 in the dropdown — check.

**File rewrites by cPanel:** **UNKNOWN / no evidence.** Nothing in official docs shows cPanel/Selector rewriting or mutating your source files during a git deploy — the deploy runs *your* `.cpanel.yml` tasks in the repo; *you* copy/build into the app dir. (Meridian manages build-output dir and startup command; that's Meridian-specific.) The Selector *does* require `node_modules` to be a symlink into its own venv-style store ("the application should not contain folder/file with such name in application root" — enforced behavior reported by Selector UI) — a real constraint, not a rewrite of your code.
