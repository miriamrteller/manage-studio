# V1 pg_cron scheduled edge jobs (paste into new agent chat)

**Status:** **Ready** for automated implementation **after** [v1-migration-squash-20260705.md](v1-migration-squash-20260705.md) merges

### Agent-readiness checklist

| Criterion | Status |
| --- | --- |
| Job list + Jerusalem schedules locked | ✅ |
| Auth pattern (`CRON_SECRET`) documented | ✅ |
| Depends on squash (clean 24-file chain) | ✅ |
| Idempotent schedule migration pattern | ✅ |
| Runbook updates listed | ⚠️ Step 6 — agent writes MANUAL_OPERATIONS + THIRD_PARTY |
| Supabase vault settings for functions URL | ⚠️ Concrete SQL template + GUC names in plan |
| UTC conversion for Jerusalem schedules | ⚠️ **Required** — see UTC table |

**Verdict:** Ready **after squash**. Not blocked on app code.

---

## Mission

Add **one forward migration** `supabase/migrations/20260608002600_scheduled_jobs.sql` that registers all V1 background jobs via **pg_cron** + **pg_net**, replacing comment-only setup in waiver/finance/audit migrations.

**Out of scope:** Class calendar UI; changing edge function business logic.

---

## Locked schedules (intent: Asia/Jerusalem — **pg_cron runs UTC on Supabase**)

| Job name | Jerusalem intent | Edge / SQL target |
| --- | --- | --- |
| `run-monthly-billing-monthly` | 1st of month, 01:00 | POST `run-monthly-billing` |
| `run-monthly-billing-daily-retry` | Daily 02:00 | POST `run-monthly-billing` |
| `run-enrolment-payment-dunning` | Daily 03:00 | POST `run-enrolment-payment-dunning` |
| `send-waiver-reminder` | Every 6 hours | POST `send-waiver-reminder` |
| `issue-document-queue` | Every 15 minutes | POST `issue-document` |
| `cleanup-expired-otps` | Daily 01:00 | `SELECT cleanup_expired_otps()` |
| `cleanup-verification-attempts` | Daily 02:00 | `SELECT cleanup_old_verification_attempts()` |

### UTC cron expressions (IDT = UTC+3, typical Jun–Oct)

**Do not paste Jerusalem hour numbers into `cron.schedule` — Supabase pg_cron is always UTC.**

| Job name | UTC cron (IDT +3) | UTC cron (IST +2, winter) | Notes |
| --- | --- | --- | --- |
| `run-monthly-billing-monthly` | `0 22 28-31 * *` + SQL guard* | `0 23 28-31 * *` + SQL guard* | *Run on last days; body checks `(now() AT TIME ZONE 'Asia/Jerusalem')::date` is 1st at ≥01:00 **or** use fixed `0 22 1 * *` accepting ~1h DST drift |
| `run-monthly-billing-daily-retry` | `0 23 * * *` | `0 0 * * *` | 02:00 Jerusalem |
| `run-enrolment-payment-dunning` | `0 0 * * *` | `0 1 * * *` | 03:00 Jerusalem; edge fn uses Jerusalem calendar days — must run ≥ once/day after Jerusalem midnight |
| `send-waiver-reminder` | `0 */6 * * *` | same | Wall-clock independent; OK in UTC |
| `issue-document-queue` | `*/15 * * * *` | same | OK in UTC |
| `cleanup-expired-otps` | `0 22 * * *` | `0 23 * * *` | 01:00 Jerusalem |
| `cleanup-verification-attempts` | `0 23 * * *` | `0 0 * * *` | 02:00 Jerusalem |

Migration header **must** comment Jerusalem intent + chosen UTC expression + DST drift policy (single schedule vs semi-annual swap).

### HTTP job template (required — no hardcoded secrets)

```sql
SELECT net.http_post(
  url := current_setting('app.settings.supabase_functions_url', true)
       || '/functions/v1/run-enrolment-payment-dunning',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', current_setting('app.settings.cron_secret', true)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
);
```

**Pre-migration manual step (document in runbook):** set database settings or Supabase Vault-backed GUCs, e.g.:

```sql
ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<project-ref>.supabase.co';
ALTER DATABASE postgres SET app.settings.cron_secret = '<matches supabase secrets set CRON_SECRET>';
```

If `current_setting(..., true)` is NULL → edge fn may still accept (when `CRON_SECRET` env unset) but **production must set both** — otherwise jobs are open or URLs fail silently.

---

## Hard rules

1. **One migration** `02600_scheduled_jobs.sql` — append to squashed chain (25 files total).
2. Use `cron.unschedule(jobname)` before `cron.schedule` for idempotent re-apply.
3. `CREATE EXTENSION IF NOT EXISTS pg_cron` and `pg_net` (if not enabled — document Supabase dashboard prerequisite).
4. Do **not** hardcode production secrets in SQL — use Supabase vault / `current_setting('app.cron_secret', true)` pattern documented in runbook.
5. **No git commit** unless user asks.

---

## Pre-flight

1. `supabase/functions/run-monthly-billing/index.ts` — auth header check
2. `supabase/functions/run-enrolment-payment-dunning/index.ts`
3. `supabase/functions/send-waiver-reminder/index.ts`
4. `supabase/functions/issue-document/index.ts` — header comment
5. `supabase/migrations/20260608000700_audit_security.sql` — cleanup RPCs
6. `docs/deployment/THIRD_PARTY_SERVICES.md`

---

## Definition of done

- [ ] Migration applies on fresh DB after squash
- [ ] `MANUAL_OPERATIONS_RUNBOOK.md` — pg_cron section (enable extensions, set secrets, verify jobs)
- [ ] `THIRD_PARTY_SERVICES.md` — CRON_SECRET + functions URL
- [ ] Manual smoke: `SELECT * FROM cron.job` lists 7 jobs; one POST returns 200 with valid secret
- [ ] Smoke: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5` — no repeated failures
- [ ] `CRON_SECRET` set in Supabase Edge secrets **and** DB GUC used by `net.http_post`

---

## Audit notes (2026-07-05 — Supabase apply + quiet fails)

| Severity | Issue | Resolution |
| --- | --- | --- |
| **High** | Plan labels cron as Jerusalem but Supabase pg_cron is **UTC-only** — jobs fire 2–3h late/wrong day without conversion. | Use UTC table above; document DST policy in migration header. |
| **High** | `net.http_post` is **async** — `cron.job` succeeds even when edge fn returns 401/500. | Monitor `cron.job_run_details`; log `net._http_response` in runbook smoke; alert on failures. |
| **High** | No concrete URL/secret wiring — commented waiver template omits `x-cron-secret`. | Use template above; require GUCs before enabling jobs. |
| **Medium** | Edge fns (`run-monthly-billing`, `run-enrolment-payment-dunning`, `issue-document`) **skip auth when `CRON_SECRET` env unset** (`if (!CRON_SECRET) return true`). | Production checklist: secret in Edge **and** header in cron SQL. |
| **Medium** | `run-enrolment-payment-dunning` with unset `APP_URL` **skips email** but still cancels on day 14 — partial quiet fail. | Runbook: verify `APP_URL` secret before enabling dunning job. |
| **Medium** | `CREATE EXTENSION pg_cron` / `pg_net` may fail on **local** CLI if extensions not enabled. | Dashboard enable first; migration uses `IF NOT EXISTS`; document local skip. |
| **Low** | `cron.unschedule(name)` before `schedule` — OK (returns false if missing). | Keep idempotent pattern. |
| **Low** | Monthly billing on 1st in Jerusalem ≠ `0 1 1 * *` UTC (off-by-one day near month boundary). | Use 28–31 guard SQL or accept documented drift. |

**Architecture:** SQL cleanup jobs → direct RPC ✅; billing/dunning/waiver/documents → edge fn + `document_queue` / domain tables ✅ — no new tables needed for cron registry (`cron.job` is sufficient).

---

## Follow-on

SPEC §4.3.4 operational dependencies table — replace “comment only” rows with “02600 migration”.
