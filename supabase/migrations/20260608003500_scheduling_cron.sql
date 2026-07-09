-- =============================================================================
-- 003500: Scheduling S2 — hold expiry cron
-- Runs expire-scheduling-holds every minute: releases expired holds, cancels
-- unpaid appointment engagements, and sends pre-expiry / released emails.
-- Uses platform_config helpers from 002700 (get_supabase_functions_url / get_cron_secret).
-- DEPENDENCIES: 002700, 003400
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '* * * * *'
  AND command ILIKE '%/functions/v1/expire-scheduling-holds%';

SELECT cron.schedule(
  '* * * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/expire-scheduling-holds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
