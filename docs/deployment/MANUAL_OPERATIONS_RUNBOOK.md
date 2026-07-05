# Manual operations runbook


## Scheduled jobs (pg_cron)

1. Enable extensions in Supabase Dashboard: `pg_cron`, `pg_net`.
2. Set DB GUC values (before enabling jobs):

```sql
ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<project-ref>.supabase.co';
ALTER DATABASE postgres SET app.settings.cron_secret = '<matches supabase secrets set CRON_SECRET>';
```

3. Ensure Edge secrets include:
   - `CRON_SECRET`
   - `APP_URL` (required before enabling enrolment payment dunning emails)
4. Apply migration `20260608002600_scheduled_jobs.sql`.
5. Verify jobs:

```sql
SELECT jobid, jobname, schedule, command FROM cron.job ORDER BY jobname;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

6. Monitor for failures in `cron.job_run_details`; failed `net.http_post` calls do not block schedule creation.
