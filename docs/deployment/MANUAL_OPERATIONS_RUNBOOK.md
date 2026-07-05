# Manual operations runbook

## Fresh DB + cron validation (remote dev)

After reset + `pnpm db:push`, run:

```bash
pnpm smoke:cron:dev -- --set-gucs   # once: needs CRON_SECRET in .env
pnpm smoke:cron:dev
```

Full checklist: [FRESH_DB_CRON_SMOKE.md](FRESH_DB_CRON_SMOKE.md)

## Scheduled jobs (pg_cron)

1. Enable extensions in Supabase Dashboard: `pg_cron`, `pg_net`.
2. Set DB GUC values (or run `pnpm smoke:cron:dev -- --set-gucs`):

```sql
ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<project-ref>.supabase.co';
ALTER DATABASE postgres SET app.settings.cron_secret = '<matches supabase secrets set CRON_SECRET>';
```

3. Ensure Edge secrets include:
   - `CRON_SECRET`
   - `APP_URL` (required before enabling enrolment payment dunning emails)
4. Migration `20260608002600_scheduled_jobs.sql` applies with `pnpm db:push`.
5. Verify jobs:

```sql
SELECT jobid, schedule, LEFT(command, 60) FROM cron.job ORDER BY schedule;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

6. Monitor for failures in `cron.job_run_details`; failed `net.http_post` calls do not block schedule creation.
