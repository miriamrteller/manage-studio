# Manual operations runbook

**Pre-production / go-live checklist (manual):** [SPEC.md §7 — Pre-deployment checklist](../SPEC.md#7-v1-production-deployment)  
Includes exact **Grow** fields (`userId`, `pageCode`, `apiKey`), webhook secret RPC, Edge `GROW_*` secrets, cron config, Resend/Twilio.  
Grow-only detail: [plans/finance/GROW-RUNBOOK.md](../plans/finance/GROW-RUNBOOK.md).  
**Env map (local vs Edge vs Vercel):** [THIRD_PARTY_SERVICES.md](THIRD_PARTY_SERVICES.md) · repo [`.env.example`](../../.env.example).

## Fresh DB + cron validation (remote dev)

After reset + `pnpm db:push`, run:

```bash
pnpm smoke:cron:dev -- --print-gucs-sql   # paste SQL into Dashboard (no psql needed)
pnpm smoke:cron:dev
```

Full checklist: [FRESH_DB_CRON_SMOKE.md](FRESH_DB_CRON_SMOKE.md)

## Scheduled jobs (pg_cron)

1. Enable extensions in Supabase Dashboard: `pg_cron`, `pg_net`.
2. Apply migrations through `02700_cron_platform_config` (`pnpm db:push`).
3. Set cron HTTP settings in SQL Editor (**not** `ALTER DATABASE` — permission denied on hosted Supabase):

```sql
INSERT INTO private.platform_config (key, value) VALUES
  ('supabase_functions_url', 'https://<project-ref>.supabase.co'),
  ('cron_secret', '<matches supabase secrets set CRON_SECRET>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Or run `pnpm smoke:cron:dev -- --print-gucs-sql` and paste the generated statement.

4. Ensure Edge secrets include:
   - `CRON_SECRET`
   - `APP_URL` (required before enabling enrolment payment dunning emails)
5. Migrations `20260608002600_scheduled_jobs.sql` + `20260608002700_cron_platform_config.sql` apply with `pnpm db:push`.
6. Verify jobs:

```sql
SELECT jobid, schedule, LEFT(command, 60) FROM cron.job ORDER BY schedule;
SELECT get_supabase_functions_url();
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

7. Monitor for failures in `cron.job_run_details`; failed `net.http_post` calls do not block schedule creation.
