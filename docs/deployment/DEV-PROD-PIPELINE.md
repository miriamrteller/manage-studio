# Dev → prod pipeline (database + Edge Functions)

**Written:** 2026-11-01 · Workflows: `db-ci.yml`, `deploy-dev.yml`,
`deploy-prod.yml`, `db-health.yml`, `backup-prod.yml`

If you know Azure DevOps release pipelines, this is the same shape:

| Azure DevOps | Here (GitHub Actions) |
|---|---|
| Build + tests on a pull request | **db-ci** runs on every PR |
| "Dev" stage, auto after merge | **deploy-dev** runs on every merge to `main` |
| "Prod" stage with pre-deployment approval | **deploy-prod**: you start it, then approve it |
| Approvers on the stage | Required reviewer on the GitHub Environment `production` |
| Stage variables / secrets | GitHub Environment secrets (`development`, `production`) |
| Release history | Actions → deploy-prod runs, and the repo's Environments page |

```
  PR opened ──► db-ci (blocking)
                 ├─ migration guard: old migrations untouched, new ones named + ordered
                 ├─ SQL test suites (Postgres 17)
                 ├─ throwaway Supabase: ALL migrations from zero + seed + db lint
                 └─ generated DB types == committed types
        │ merge
        ▼
  main ───────► deploy-dev (automatic)
                 db push → deploy all functions → drift = 0 → verify:rls
        │ you click "Run workflow"
        ▼
  deploy-prod ── plan (what will ship) ──► ⏸ WAITS FOR YOUR APPROVAL ──►
                 live plan → backup to R2 → db push → deploy all functions
                 → verify:prod · verify:env · no *_MOCK secrets · smoke query → summary

        │ deploy-prod succeeded (not a dry run) → automatically
        ▼
  deploy-web ── ⏸ APPROVAL ──► build with prod settings (never the demo)
                 → wrangler deploy opalswift-app → smoke: app shell, a tenant, this release live

  every night ─► backup-prod (encrypted dump to R2) · rls-check (dev) · db-health (dev + prod)
```

---

## Rules

1. **Git is the only source of truth** for the schema and the Edge Functions.
   No schema edits in the Supabase dashboard, SQL editor, CLI or MCP on either
   project. Data fixes and one-time config rows (encryption key, cron config,
   tenant bootstrap) are the exception — they are data, not schema.
2. **Migrations are append-only.** Once a migration file is on `main` it is never
   edited, renamed or deleted. Fix forward with a new file. `db-ci` blocks the PR
   otherwise. New files: `YYYYMMDDHHMMSS_snake_case.sql`, newer than every file
   already on `main`.
3. **Every migration must be backward-compatible** (expand → deploy app → contract).
   The web app deploys separately, so for a while the *old* app runs against the
   *new* schema. So in one release you may add tables, nullable columns, columns
   with defaults, new functions. You may **not** drop or rename a column/table the
   live app still reads, or add a NOT NULL without a default. To remove something:
   release 1 stops using it in the app; release 2 drops it.
4. **Order: database first, then the app.** A real deploy-prod that succeeds
   starts deploy-web for the same commit, so app code never goes live before
   its migrations. App-only changes go out with deploy-web alone (see
   [Web stage](#web-stage)).
5. **Every `SECURITY DEFINER` function gets an explicit access tier.** Supabase
   grants EXECUTE on new functions to `anon` and `authenticated` directly, so
   `REVOKE … FROM PUBLIC` alone restricts nothing. Add the function to a tier in
   `supabase/security/definer-execute.json` (public / authenticated / service /
   internal) and `REVOKE`/`GRANT` to match in the same migration. `db-ci` fails
   otherwise (`supabase/tests/security/run.sh`).
   A definer function that exists on a hosted project but not in git (made in
   the dashboard, or by a Supabase feature) stops the hardening migration;
   `db-health` lists them nightly. `20261031235900` handles the two found on
   2026-11-01 (`rls_auto_enable` moved to `extensions`, unused
   `handle_new_user_v2` dropped) and is the one allowed out-of-order version
   (`scripts/ci/migration-order-exceptions.txt`).
6. **Never** `supabase db reset`, `seed*.sql` or `scripts/reseed-dev.sh` against a
   hosted project. The pipeline only ever runs `db push` (applies new migrations).
7. **Prod has no mock flags.** deploy-prod fails its checks if any `*_MOCK` or
   dev-only secret is set on prod (`supabase/edge-secrets.json`).
8. Secrets and values never go in git, logs, PRs or chat. Edge Function secrets
   live in each Supabase project; the pipeline only compares their **names**.

## What happens when…

**…a PR is opened.** `db-ci` runs. Jobs that only matter for database changes are
skipped (and count as passed) when the PR does not touch `supabase/**`. If the
types check fails, regenerate and commit: `pnpm db:reset-and-types:local`.

**…a PR is merged.** If it touched `supabase/**`, `deploy-dev` applies the new
migrations to dev, deploys every function, checks dev now matches `main`, and runs
the 37 RLS checks. Dev keeps its data and its mock flags.

**…you want it in production.** See *How to deploy to prod* below. Nothing reaches
prod without your click and your approval.

**…every night.** A backup of prod goes to R2; RLS is checked on dev; the drift
check compares dev and prod with `main` and opens (or updates, or closes) a GitHub
issue labelled `db-drift`.

## How to deploy to prod (one click, then approve the database and the app)

1. GitHub → **Actions** → **deploy-prod** → **Run workflow** → branch `main` → **Run workflow**.
   (Optional boxes: *dry_run* shows the live plan and writes nothing.)
2. Open the run. The **plan** job's summary lists the new migrations and changed
   functions since the last prod deploy.
3. GitHub emails you "Review pending deployment". In the run, click
   **Review deployments** → tick **production** → **Approve and deploy**.
4. The **deploy** job prints the live plan, takes a backup, applies the migrations,
   deploys the functions and runs the checks. The summary ends with a table of
   results. Green = done. Red = read which row failed.
5. deploy-web starts by itself for the same commit and waits for your approval
   (same click as step 3). Approve it to ship the app.

Alternative trigger: push a tag `prod-2026-11-05` (any `prod-*`) on a commit that
is on `main`. You still approve it.

## Rollback

- **Default: fix forward.** Write a new migration that undoes or repairs the
  change, merge it, let it reach dev, run deploy-prod. This is the normal path and
  keeps git and prod in step.
- **Edge Function bug:** revert the commit on `main` and run deploy-prod; every
  function is redeployed from git.
- **Data damage / bad migration that destroyed data:** restore. On Pro, Supabase's
  daily backups (Dashboard → Database → Backups; and PITR if you enabled it) are
  the fastest route for a whole-project restore. Otherwise use the pre-deploy
  backup the pipeline took (R2 `predeploy/…`, named in the run summary) or the
  latest nightly. Procedure: [BACKUP-RESTORE-RUNBOOK.md](BACKUP-RESTORE-RUNBOOK.md).
  Per-tenant restores are in the same runbook.
- Rehearse a restore without touching any hosted project:
  `scripts/restore-rehearsal.sh <backup.tar.gz.gpg>` (needs Docker and the backup
  private key). Done on 2026-11-01 with a pipeline-made backup — see the runbook.

## DB health

**Nightly (GitHub, `db-health.yml`)** — one issue labelled `db-drift` collects
everything; it closes itself when all is well again.

| Check | Dev | Prod |
|---|---|---|
| Project running | ✅ Supabase API status — a paused dev is reported as *"Dev is paused — unpause it"* | Pro plan, does not pause |
| Migrations vs `main` | ✅ drift if anything is missing or unknown | ✅ unknown = drift; missing = "awaiting release" |
| Definer functions made outside git (not in `supabase/security/definer-execute.json`) | ✅ listed with owner, what calls them, body head (secrets redacted) | ✅ same |
| Security advisors (ERROR level) | ✅ | after every deploy-prod (summary) |
| RLS (37 checks) | ✅ `rls-check.yml` | — needs seeded data, so not on prod |
| Backup | — | ✅ `backup-prod.yml` |

**Dev is on the Free plan** (org `miriamrteller`): it pauses after ~7 days with
no activity, and a Free organisation can have only **2 active projects**. When
dev is paused, deploy-dev stops with that message and db-health reports it;
unpause in the dashboard (project → *Restore project*) and re-run. The daily
keepalive ping in backup-prod.yml usually prevents it.

**Weekly prod summary, on request:** ask the DB owner thread for a "prod health
summary". It is produced read-only through the Supabase connector: security and
performance advisors, migrations vs `main`, recent error logs, Edge Function
versions. Nothing is written.

## Drift

The `db-drift` issue means a hosted project and `main` disagree:

- *Applied on X but not in git* — someone changed the schema outside the
  pipeline. Find out what it was, write it as a migration (or undo it), and use
  `supabase migration repair` only with care. Never edit old migrations to match.
- *In git but not applied on dev* — deploy-dev failed or was skipped. Re-run it
  (Actions → deploy-dev → Run workflow).
- *Waiting for the next prod release* is not drift; it just lists what the next
  deploy-prod will apply.

## Secrets: who holds what

| Where | Name | What | Used by |
|---|---|---|---|
| Environment `production` (reviewer: owner; `main` + `prod-*` tags) | `SUPABASE_ACCESS_TOKEN` | Supabase token for the CI user, used to deploy functions and list secret names | deploy-prod |
| | `SUPABASE_PROD_DB_URL` | prod session-pooler URL incl. password | deploy-prod |
| Environment `production-nightly` (no reviewer; `main` only) | `SUPABASE_PROD_DB_URL` | same URL | backup-prod, db-health |
| Environment `development` (no reviewer) | `SUPABASE_ACCESS_TOKEN` | Supabase token | deploy-dev, db-health |
| | `SUPABASE_DEV_DB_URL` | dev session-pooler URL incl. password | deploy-dev, db-health |
| Repo secrets | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | backup bucket write | backup-prod, deploy-prod |
| Repo secrets (today) | `SUPABASE_PROD_DB_URL`, `SUPABASE_DEV_DB_URL` | already set; keep working until moved | all of the above |
| Each Supabase project | Edge Function secrets | `APP_URL`, `CRON_SECRET`, email, … (names in `supabase/edge-secrets.json`; see *Email transport* below) | Edge Functions at runtime |

Notes:
- An environment secret wins over a repo secret with the same name, so the
  workflows keep working while you move secrets.
- A **repo-level** secret can be used by a workflow on any branch. Moving the
  prod DB URL into the `production` / `production-nightly` environments (both
  limited to `main`) and deleting the repo-level copy means only code already
  merged to `main` can reach prod. That is the hardening step in the checklist.
- Supabase personal access tokens are not scoped: a token can do anything its
  user can in every organisation they belong to. Use a token made only for CI,
  so you can revoke it without touching your own sessions. Separate tokens for
  `development` and `production` make revocation independent; they do not reduce
  what each token can do.
- Compare secret names between dev and prod at any time (names only):
  `SUPABASE_ACCESS_TOKEN=… node scripts/ci/check-edge-secret-names.mjs --compare acmujrhavgbamdilzuew oogxajjanbyqhljxcmql`

**Email transport.** Prod needs exactly one working email transport, checked
by name on every deploy (`scripts/ci/check-edge-secret-names.mjs`):

| `EMAIL_TRANSPORT` | Must be set | Notes |
|---|---|---|
| `resend` (launch choice) | `RESEND_API_KEY` | no Cloudflare email names needed |
| `cloudflare` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_EMAIL_API_TOKEN` | needs Workers Paid; per-tenant branded domains |
| not set | either of the above | Cloudflare wins when both of its names are set |

A transport set without its keys (e.g. `EMAIL_TRANSPORT=cloudflare` with only
`RESEND_API_KEY`) fails the deploy-prod checks: every email would fail. The
check learns which word `EMAIL_TRANSPORT` holds from the digest the Supabase API
returns, never from the value.

## Web stage

`deploy-web` builds `apps/web` with prod settings and deploys the Cloudflare
Worker `opalswift-app` (`*.opalswift.com`, `app.opalswift.com`).

| How it starts | What it does |
|---|---|
| After a real deploy-prod succeeds | Builds and deploys that same commit, after your approval |
| Actions → deploy-web → Run workflow | App-only release from `main`. Tick **build_only** to build and check without deploying |
| Tag `prod-web-…` on a commit on `main` | Same as Run workflow |

It refuses to deploy when:
- `VITE_SUPABASE_URL` is not prod;
- the "publishable" key is really a secret key;
- `VITE_DEMO_MODE`, `VITE_DEV_TENANT_SUBDOMAIN` or any `*_MOCK` variable exists;
- the commit is not on `main`.

After deploying it checks that `app.opalswift.com` and one tenant host answer 200 and that the live
site serves this exact build.

**Rollback (app):** fastest is Cloudflare's own: Workers & Pages → opalswift-app → Deployments →
pick the previous version → roll back. To redeploy an older commit through the pipeline, put a
tag `prod-web-rollback-<n>` on it (it must be on `main`) and approve the run. Run workflow always
builds the tip of `main`.

### Owner setup for the web stage (one time)

1. **Cloudflare API token**: dash.cloudflare.com → avatar → **My Profile → API Tokens → Create Token**
   → template **Edit Cloudflare Workers** → *Account Resources*: your account only; *Zone Resources*:
   `opalswift.com` only → **Continue → Create Token** → copy it.
2. **Account ID**: Cloudflare dashboard → **Workers & Pages** → right-hand column **Account ID** → copy.
3. GitHub → **Settings → Environments → production → Environment secrets → Add**:
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Same page → **Environment variables → Add**, copying the values from your
   `apps/web/.env.production` (these are public by design: they are built into every page):

   | Variable | Required | Value |
   |---|---|---|
   | `VITE_SUPABASE_URL` | yes | `https://oogxajjanbyqhljxcmql.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | the prod **publishable** key (`sb_publishable_…`) |
   | `VITE_APP_ROOT_DOMAIN` | yes | `opalswift.com` |
   | `VITE_SENTRY_DSN` | no | Sentry DSN ([OBSERVABILITY.md](OBSERVABILITY.md)) |
   | `VITE_SENTRY_ENVIRONMENT` | no | defaults to `production` |
   | `VITE_PRIVACY_POLICY_URL`, `VITE_TERMS_URL`, `VITE_ACCESSIBILITY_STATEMENT_URL` | no | platform fallbacks; tenants' own links come from the database |
   | `VITE_ENABLE_SELF_SERVE_SIGNUP`, `VITE_ENABLE_FINANCE_WALKTHROUGH` | no | leave unset unless you want them on |
   | `SMOKE_TENANT_HOST` | no | defaults to `creativeballet.opalswift.com` |

   Do **not** add `VITE_DEMO_MODE` or `VITE_DEV_TENANT_SUBDOMAIN`; the workflow refuses to run with them.
   Source maps reuse the repo's `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`.
5. Do **not** connect Cloudflare's Git builds (Workers Builds) to `opalswift-app`; GitHub is the only
   deployer, so the app never ships ahead of its migrations.
6. First run: Actions → deploy-web → Run workflow → tick **build_only** → approve. Then run it again
   without the tick.

## Owner setup (one time)

Only you can do these. Nothing here needs to be pasted into chat.

**1. Supabase CI token**
supabase.com → your avatar (top right) → **Account preferences** → **Access Tokens**
→ **Generate new token** → name `github-ci` → **Generate** → copy it (it is shown once).

**2. GitHub environment `production`**
GitHub repo → **Settings** → **Environments** → **New environment** → name
`production` → **Configure environment**:
- **Required reviewers**: tick it, add `miriamrteller`. Leave *Prevent self-review*
  **unticked** (you start and approve your own deploys).
- **Deployment branches and tags** → *Selected branches and tags* → **Add
  deployment branch or tag rule** → *Branch* `main` → Add; again → *Tag* `prod-*` → Add.
- **Environment secrets** → **Add environment secret**:
  - `SUPABASE_ACCESS_TOKEN` = the token from step 1
  - `SUPABASE_PROD_DB_URL` = the same value as the existing repo secret of that name
    (`postgresql://postgres.oogxajjanbyqhljxcmql:<prod DB password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    password from your password manager)
- **Save protection rules**.

**3. GitHub environment `development`**
Settings → Environments → **New environment** `development` → add secret
`SUPABASE_ACCESS_TOKEN` = the token from step 1. (`SUPABASE_DEV_DB_URL` is
already a repo secret; nothing else needed.)

**4. Supabase Pro**
supabase.com → organisation **OpalSwift** → **Billing** → change plan to **Pro**.
Optional afterwards: project → **Database** → **Backups** → enable PITR.

**5. Recommended (5 minutes): make the PR checks required**
Settings → **Branches** → rule for `main` → *Require status checks* → add
`migration-guard`, `workflow-lint`, `sql-tests`, `local-stack`.

**6. Optional hardening (later)**
After the first nightly run, Settings → Environments → `production-nightly`
(created automatically) → *Deployment branches* `main` → add secret
`SUPABASE_PROD_DB_URL`. Then delete the **repo-level** `SUPABASE_PROD_DB_URL`
(Settings → Secrets and variables → Actions).

**Also check once:** in the Supabase dashboard of the **dev** project → Project
Settings → Integrations → GitHub. Preview branches for PRs are fine to keep. If
"Deploy to production" is on, it also pushes migrations to dev on merge; this is
harmless (deploy-dev retries once and finds nothing to apply), but one deployer is
cleaner, so you may turn it off.

## First prod release

Prod has 34 migrations; `main` has 40. The 6 pending ones are exactly the list in
[PHOTOGRAPHER-BETA-SUPABASE.md](PHOTOGRAPHER-BETA-SUPABASE.md) (checked read-only
on 2026-11-01), plus the security-hardening migration once that PR merges.
Prod will host Creative Ballet Academy (`creativeballet`, offline payments only,
no payment provider, invoicing off) and, later, the photographer beta tenant.

1. Merge this pipeline PR and the security-hardening PR; do the owner setup above.
2. deploy-prod with **dry_run** ticked → approve → the live plan must list only
   the expected migrations.
3. deploy-prod for real → approve. Migrations and all functions go out.
   **Expect the verify:prod row to be red** this time: there is no encryption
   key, Edge secrets or tenant yet. That red is the list of what is missing.
4. Encryption key: the owner generates it (`openssl rand -base64 32`), stores it
   in the password manager, and runs the one-line `INSERT` from GO-LIVE-PLAN.md
   in the prod SQL editor themselves. The key never goes into chat or git.
5. Edge secrets (PHOTOGRAPHER-BETA-SUPABASE.md Part 2 step 6; no `*_MOCK`).
6. Bootstrap the owner and the `creativeballet` tenant with the trigger dance in
   HANDOVER.md — owner approves each step.
7. deploy-prod once more. Nothing is pending; every check must now be green.
