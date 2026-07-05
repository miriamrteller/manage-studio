# Fresh DB + pg_cron smoke (remote Supabase dev)

Validate **migration squash** + **`02600_scheduled_jobs`** after reset + `pnpm db:push`.  
**Remote linked dev only** — no local Supabase Docker required.

Automated runner: `pnpm smoke:cron:dev`  
Agent prompt: `pnpm smoke:cron:dev:checklist`

---

## What you do once (Dashboard)

| Step | Where |
| --- | --- |
| Enable **`pg_cron`** + **`pg_net`** | Database → Extensions |
| Set **`CRON_SECRET`**, **`APP_URL`** | Edge Functions → Secrets |
| Deploy cron edge functions | CLI or Dashboard (see below) |

Optional deploy (from repo root, with Supabase CLI logged in):

```bash
supabase functions deploy run-enrolment-payment-dunning
supabase functions deploy run-monthly-billing
supabase functions deploy send-waiver-reminder
supabase functions deploy issue-document
```

---

## What goes in `.env` (repo root, gitignored)

```env
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_DB_PASSWORD=your-db-password
CRON_SECRET=same-as-edge-secret
```

Optional: `SUPABASE_DB_URL=postgresql://...` instead of ref + password.  
`VITE_SUPABASE_URL` / `SUPABASE_URL` can substitute for ref when deriving function URLs.

---

## Typical workflow (you already reset + pushed)

```bash
# 1. Seeds (if not done)
pnpm seed:dev -- --finance

# 2. DB GUCs (once per project — matches Edge CRON_SECRET)
pnpm smoke:cron:dev -- --set-gucs
# If psql fails on Windows (DNS / host name): paste output of:
pnpm smoke:cron:dev -- --print-gucs-sql
# into Supabase Dashboard → SQL Editor, then run smoke again.

# 3. Full automated smoke
pnpm smoke:cron:dev

# 4. Optional: include vitest
pnpm smoke:cron:dev -- --with-tests
```

**Pass:** script exits `0`, summary shows all `PASS` (or intentional `SKIP` for HTTP if `CRON_SECRET` missing).

---

## What the smoke script checks

| Check | Pass criteria |
| --- | --- |
| psql connectivity | `SELECT 1` |
| Migrations | ≥ 26 rows matching `202606%` |
| Dunning columns | 2 columns on `engagements` |
| Dunning index | `idx_notification_log_dunning_key` exists |
| Folded RPCs | `get_finance_summary`, `get_admin_dashboard_overview`, `resolve_notification_blast_recipients` |
| Extensions | `pg_cron` + `pg_net` |
| Cron jobs | ≥ 7 rows in `cron.job` |
| GUCs | `app.settings.supabase_functions_url`, `app.settings.cron_secret` |
| Seed fixtures | Engagements `...1001`, `...1002` |
| HTTP dunning | POST → **200** (needs `CRON_SECRET`) |
| Dunning side effects | Counters move on `1001`/`1002` when eligible |
| Idempotency | Re-POST does not add duplicate `dunning_key` rows |

---

## Agent-ready prompt (paste into new chat)

```
Remote Supabase dev only. User completed reset + db:push + types + UI check.

Run automated validation:
  pnpm smoke:cron:dev -- --set-gucs   # only if GUCs not set; needs CRON_SECRET in .env
  pnpm seed:dev -- --finance         # only if fixtures 1001/1002 missing
  pnpm smoke:cron:dev -- --with-tests

Requires .env: SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, CRON_SECRET.
User confirms Dashboard: pg_cron + pg_net enabled, Edge secrets set.

Report the script summary table. Do not commit secrets.
Doc: docs/deployment/FRESH_DB_CRON_SMOKE.md
```

---

## Manual SQL (if psql unavailable)

```sql
SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE version LIKE '202606%';
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'engagements' AND column_name LIKE 'payment_dunning%';
SELECT jobid, schedule FROM cron.job ORDER BY schedule;
SELECT current_setting('app.settings.supabase_functions_url', true);
```

Manual dunning POST:

```bash
curl -sS -X POST "https://YOUR_REF.supabase.co/functions/v1/run-enrolment-payment-dunning" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -d '{}'
```

---

## Troubleshooting

| Failure | Fix |
| --- | --- |
| psql not found | Install PostgreSQL client or use Dashboard SQL + manual curl |
| DNS / host name errors | Set **`SUPABASE_DB_URL`** in `.env` to Dashboard → Database → **Connection string (URI, session mode)** — not only `db.<ref>.supabase.co` |
| `extra command-line argument` warnings (Windows) | Fixed in script (`shell: false`); pull latest and retry |
| extensions count ≠ 2 | Enable pg_cron + pg_net in Dashboard |
| GUC missing | `pnpm smoke:cron:dev -- --set-gucs` |
| HTTP 401 | Align `.env` `CRON_SECRET`, Edge secret, and DB GUC |
| Fixtures missing | `pnpm seed:dev -- --finance` |
| cron.job count < 7 | Re-run `pnpm db:push`; confirm `02600` applied |

See also [MANUAL_OPERATIONS_RUNBOOK.md](MANUAL_OPERATIONS_RUNBOOK.md), [THIRD_PARTY_SERVICES.md](THIRD_PARTY_SERVICES.md).
