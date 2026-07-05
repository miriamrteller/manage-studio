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
| Supabase vault settings for functions URL | ⚠️ Document — may be manual per host |

**Verdict:** Ready **after squash**. Not blocked on app code.

---

## Mission

Add **one forward migration** `supabase/migrations/20260608002600_scheduled_jobs.sql` that registers all V1 background jobs via **pg_cron** + **pg_net**, replacing comment-only setup in waiver/finance/audit migrations.

**Out of scope:** Class calendar UI; changing edge function business logic.

---

## Locked schedules (Asia/Jerusalem)

| Job name | Cron | Edge / SQL target |
| --- | --- | --- |
| `run-monthly-billing-monthly` | `0 1 1 * *` | POST `run-monthly-billing` |
| `run-monthly-billing-daily-retry` | `0 2 * * *` | POST `run-monthly-billing` |
| `run-enrolment-payment-dunning` | `0 3 * * *` | POST `run-enrolment-payment-dunning` |
| `send-waiver-reminder` | `0 */6 * * *` | POST `send-waiver-reminder` |
| `issue-document-queue` | `*/15 * * * *` | POST `issue-document` |
| `cleanup-expired-otps` | `0 1 * * *` | `SELECT cleanup_expired_otps()` |
| `cleanup-verification-attempts` | `0 2 * * *` | `SELECT cleanup_old_verification_attempts()` |

Document UTC equivalents in migration header comment.

HTTP jobs: `net.http_post` with headers `Content-Type: application/json`, `x-cron-secret: <CRON_SECRET>` (read from vault or `current_setting` — match existing edge fn pattern).

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
- [ ] Manual smoke: `\cron.job` lists 7 jobs; one POST returns 200 with valid secret

---

## Follow-on

SPEC §4.3.4 operational dependencies table — replace “comment only” rows with “02600 migration”.
