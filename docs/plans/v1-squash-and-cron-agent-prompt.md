# Agent prompt — V1 migration squash + pg_cron (paste entire block below into new agent chat)

---

## COPY FROM HERE

You are implementing **two sequential schema/ops tasks** in repo `manage-studio`. Read the full plans first:

- `docs/plans/v1-migration-squash-20260705.md`
- `docs/plans/v1-pg-cron-scheduled-jobs.md`

**Branch:** create `feat/v1-migration-squash-and-cron` from `main`.

**Do not commit or push** unless I explicitly ask.

---

# PHASE 1 — Third migration squash (must complete before Phase 2)

## Mission

Fold **13 incrementals** (`20260625*`–`20260705*`) into the **`20260608*` base chain** (`00200`–`02500`). End state: **exactly 24 files** in `supabase/migrations/`. Archive incrementals, update reset/seed/docs.

**Out of scope for Phase 1:** pg_cron SQL, app feature code.

## Hard rules

1. **24 files only** after squash — no new numbered migrations.
2. **Replace in place** where incrementals supersede base (never duplicate function bodies).
3. Notification blast: fold **only** `20260701120000_notification_blast_human_search.sql`.
4. Grow/iCount: **`290001`** for `save_tenant_grow_credentials` + `save_tenant_icount_credentials`; **`280001`** for `save_icount_webhook_secret` only.
5. Payment dunning: bake columns into `CREATE TABLE engagements` in `01300` — no standalone ALTER migration.
6. Archive all 13 incrementals → `supabase/migrations_backup/incremental_20260705/` + README, then delete from `migrations/`.

## Pre-flight (read fully before editing)

1. `SPEC.md` §4.2.0
2. All 13 incremental files (listed in fold map below)
3. Target base file tails (avoid duplicate CREATE)
4. `supabase/reset_dev_db.sql`, `supabase/seed.sql`, `supabase/seed-finance.sql`
5. `supabase/migrations/20260608002500_grants.sql`

## Fold map (13 → base)

| Delete after fold | Fold into | Keep |
| --- | --- | --- |
| `20260625000100_expenses.sql` | `01600_finance.sql` | Table, triggers, RLS, `create_expense`, `reject_expense_mutation`, `validate_expense_category_tenant` |
| ↑ storage section | `01700_storage.sql` | `expense-receipts` bucket + policies |
| `20260625000200_finance_summary_rpc.sql` | `01600_finance.sql` (after expenses) | `get_finance_summary` |
| `20260625000300_grow_webhook_secrets.sql` | `01600_finance.sql` | `grow_webhook_secrets`, RPCs, RLS, grants |
| `20260625000500_grow_admin_document_rpcs.sql` | `01600_finance.sql` | `admin_get_payment_document`, `admin_get_document_signed_url_path` |
| `20260628000100_icount_credentials.sql` | `01600_finance.sql` | **`save_icount_webhook_secret` only** |
| `20260629000100_provider_token_invalidation.sql` | `01600_finance.sql` | **Replace** `save_tenant_grow_credentials`; add `save_tenant_icount_credentials` |
| `20260626000100_age_engagement_helpers.sql` | `02100_guest_enrolment_rpcs.sql` | `engagement_age_at_season_start`; **replace** `guest_enrolment_create_engagement` |
| `20260626000200_age_review_rpcs.sql` | `02200_admin_enrolment_rpcs.sql` | All age-review RPCs + GRANTs |
| `20260626000300_admin_dashboard_overview_rpc.sql` | `02000_admin_rpcs.sql` | `get_tenant_today`, `idx_offerings_season_dow_status`, `get_admin_dashboard_overview` |
| `20260701000100_notification_blast_rpcs.sql` | — | **Discard** |
| `20260701100100_notification_blast_account_filter.sql` | — | **Discard** |
| `20260701120000_notification_blast_human_search.sql` | `00600_communications.sql` | Final blast RPCs + GRANTs |
| `20260705000100_payment_dunning_foundation.sql` | `01300_engagements.sql` + `00600_communications.sql` | See dunning section |

## Mandatory fixes during fold (audit blockers)

### 1. Dashboard RPC tenant bug (HIGH)

In `get_admin_dashboard_overview`, **do not** use `auth.uid()` as tenant id.

```sql
-- WRONG (in 20260626000300):
v_tenant_id := auth.uid();

-- CORRECT (mirror get_finance_summary):
v_tenant_id := get_my_tenant_id();
IF v_tenant_id IS NULL THEN
  RAISE EXCEPTION 'Tenant not found';
END IF;
```

Keep existing role check using `auth.uid()` for `user_profiles.id`.

### 2. Replace `save_tenant_grow_credentials` in place (HIGH)

Delete the old body in `01600_finance.sql` (~lines 172–206) and paste the **`290001`** version (includes payment_method_tokens invalidation). Do not append a second definition.

### 3. Payment dunning — bake into CREATE

**`01300_engagements.sql`** — add before `created_at`:

```sql
  payment_dunning_attempt_count INT NOT NULL DEFAULT 0,
  payment_dunning_next_at       TIMESTAMPTZ,
```

Add COMMENTs from `20260705000100`.

**`00600_communications.sql`** — append after `notification_log` indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dunning_key
  ON notification_log (tenant_id, template_name, (variables->>'dunning_key'))
  WHERE (variables->>'dunning_key') IS NOT NULL
    AND status IN ('sent', 'delivered', 'read', 'pending');
```

## Grants (`02500_grants.sql`)

Add to `GRANT SELECT ON TABLE` for `authenticated`:

- `public.expenses`
- `public.grow_webhook_secrets`

## Reset script (`reset_dev_db.sql`)

Add (harmless if index already dropped with table):

```sql
DROP INDEX IF EXISTS public.idx_notification_log_dunning_key;
DROP INDEX IF EXISTS public.idx_offerings_season_dow_status;
```

Extend existing dynamic `DO $$ ... proname IN (...)` block with any **missing**:

```
get_admin_dashboard_overview, get_tenant_today,
save_tenant_icount_credentials, save_icount_webhook_secret
```

(Several finance/age RPCs may already be present — add only what's missing.)

Add dynamic drop loop for **`resolve_notification_blast_recipients`** and **`preview_notification_blast_recipients`** (all overloads — copy pattern from `20260701120000`).

Update final `RAISE NOTICE` to mention third squash + `seed-finance.sql` after base seed.

## Seed (`seed-finance.sql`)

Update existing engagements (do not duplicate rows):

| ID | Fields |
| --- | --- |
| `...001001` | `created_at = now() - interval '5 days'`, `payment_dunning_attempt_count = 0`, `payment_dunning_next_at = NULL` |
| `...001002` | `payment_dunning_attempt_count = 1`, `payment_dunning_next_at = now() - interval '1 hour'` |

Include columns in INSERT + extend `ON CONFLICT DO UPDATE`.

Header comment run order:

```
reset_dev_db.sql → pnpm db:push → seed.sql → seed-finance.sql
```

## Docs

- **SPEC.md §4.2.0:** third squash changelog + index rows; fix prose — full `expenses` table **is** in V1.
- **docs/IMPLEMENTATION_STATUS.md:** single 24-file chain note.
- **docs/plans/README.md:** squash status → Shipped when done.

## Phase 1 verification

Tell me to run `reset_dev_db.sql` in Supabase SQL Editor, then run:

```bash
pnpm db:push
pnpm db:types:all:local
pnpm -C packages/shared build
pnpm -C apps/web test schemas.test.ts finance-schemas.test.ts payment-dunning-collections.test.ts enrolment-payment-dunning.test.ts
```

SQL smoke:

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'engagements' AND column_name LIKE 'payment_dunning%';
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_notification_log_dunning_key';
SELECT proname FROM pg_proc WHERE proname = 'get_finance_summary';
```

Confirm `supabase/migrations/` has **24 files only** — no `20260625*` or `202607*`.

---

# PHASE 2 — pg_cron scheduled jobs (only after Phase 1 passes)

## Mission

Add **`supabase/migrations/20260608002600_scheduled_jobs.sql`** (25 files total). Register 7 jobs via **pg_cron** + **pg_net**.

**Out of scope:** edge function business logic changes, FullCalendar UI.

## Hard rules

1. One migration `02600` only.
2. `cron.unschedule(jobname)` before each `cron.schedule` (idempotent).
3. `CREATE EXTENSION IF NOT EXISTS pg_cron` and `pg_net` — document Dashboard prerequisite.
4. **No hardcoded secrets** — use GUCs (see template).
5. **UTC cron expressions only** — Supabase pg_cron runs in UTC.

## Jobs (Jerusalem intent → UTC)

| Job name | Jerusalem intent | Target |
| --- | --- | --- |
| `run-monthly-billing-monthly` | 1st 01:00 | POST `run-monthly-billing` |
| `run-monthly-billing-daily-retry` | Daily 02:00 | POST `run-monthly-billing` |
| `run-enrolment-payment-dunning` | Daily 03:00 | POST `run-enrolment-payment-dunning` |
| `send-waiver-reminder` | Every 6h | POST `send-waiver-reminder` |
| `issue-document-queue` | Every 15m | POST `issue-document` body `{"mode":"batch"}` |
| `cleanup-expired-otps` | Daily 01:00 | `SELECT cleanup_expired_otps()` |
| `cleanup-verification-attempts` | Daily 02:00 | `SELECT cleanup_old_verification_attempts()` |

**UTC expressions (IDT = UTC+3, use in migration; document IST +2 winter alternative in header):**

| Job | UTC cron (IDT) |
| --- | --- |
| monthly billing | `0 22 28-31 * *` with SQL guard that Jerusalem local date is 1st **OR** `0 22 1 * *` with documented ~1h DST drift |
| daily retry | `0 23 * * *` |
| enrolment dunning | `0 0 * * *` |
| waiver reminder | `0 */6 * * *` |
| issue document | `*/15 * * * *` |
| cleanup otps | `0 22 * * *` |
| cleanup verification | `0 23 * * *` |

## HTTP template (all POST jobs)

```sql
SELECT net.http_post(
  url := current_setting('app.settings.supabase_functions_url', true)
       || '/functions/v1/<function-name>',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', current_setting('app.settings.cron_secret', true)
  ),
  body := '{}'::jsonb,  -- issue-document: '{"mode":"batch"}'::jsonb
  timeout_milliseconds := 120000
);
```

Migration header must document Jerusalem intent, UTC choice, DST policy.

## Runbook updates (required)

Update:

- `docs/deployment/MANUAL_OPERATIONS_RUNBOOK.md` — enable extensions, set GUCs, verify jobs, monitor `cron.job_run_details`
- `docs/deployment/THIRD_PARTY_SERVICES.md` — `CRON_SECRET`, functions URL, `APP_URL` for dunning emails
- **SPEC.md §4.3.4** — replace “comment only” cron rows with “02600 migration”

Pre-deploy manual step (document, do not hardcode secrets in SQL):

```sql
ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<project-ref>.supabase.co';
ALTER DATABASE postgres SET app.settings.cron_secret = '<matches supabase secrets set CRON_SECRET>';
```

Production checklist: `CRON_SECRET` in Edge secrets **and** DB GUC; `APP_URL` set before enabling dunning job.

## Phase 2 verification

```sql
SELECT jobid, jobname, schedule, command FROM cron.job ORDER BY jobname;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

Manual POST smoke with valid `x-cron-secret` → 200.

---

## Definition of done (both phases)

- [ ] 24-file squashed chain; incrementals archived
- [ ] Dashboard RPC uses `get_my_tenant_id()`
- [ ] `save_tenant_grow_credentials` is 290001 body only
- [ ] reset + seed-finance + grants updated
- [ ] SPEC + IMPLEMENTATION_STATUS updated
- [ ] Tests green after reset + push + seed
- [ ] `02600_scheduled_jobs.sql` with UTC schedules + GUC template
- [ ] Runbooks updated; cron smoke documented

Report back with: file count, test results, any blockers for me running `reset_dev_db.sql`.

## END COPY
