-- =============================================================================
-- check-missing-documents cron (every 15 minutes)
-- Alerts tenant admins when succeeded payments lack tax docs past grace window,
-- and retries admin invoice emails until payment_document_admin_email_sent.
-- DEPENDENCIES: 20260608002800_scheduled_jobs.sql (get_supabase_functions_url, get_cron_secret)
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '*/15 * * * *'
  AND command ILIKE '%/functions/v1/check-missing-documents%';

SELECT cron.schedule(
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/check-missing-documents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
