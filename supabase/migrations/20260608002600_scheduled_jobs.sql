-- =============================================================================
-- 002600: Scheduled jobs (pg_cron + pg_net)
-- Jerusalem intent converted to UTC for Supabase pg_cron.
-- IDT (UTC+3) schedules are encoded below. During IST (UTC+2), monthly billing may
-- drift by ~1 hour unless schedules are seasonally adjusted.
--
-- Prerequisites (set outside migration; do not hardcode secrets):
--   ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.cron_secret = '<matches edge CRON_SECRET>';
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 22 1 * *'
  AND command ILIKE '%/functions/v1/run-monthly-billing%';

SELECT cron.schedule(
  '0 22 1 * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_functions_url', true) || '/functions/v1/run-monthly-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 23 * * *'
  AND command ILIKE '%/functions/v1/run-monthly-billing%';

SELECT cron.schedule(
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_functions_url', true) || '/functions/v1/run-monthly-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 0 * * *'
  AND command ILIKE '%/functions/v1/run-enrolment-payment-dunning%';

SELECT cron.schedule(
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_functions_url', true) || '/functions/v1/run-enrolment-payment-dunning',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 */6 * * *'
  AND command ILIKE '%/functions/v1/send-waiver-reminder%';

SELECT cron.schedule(
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_functions_url', true) || '/functions/v1/send-waiver-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '*/15 * * * *'
  AND command ILIKE '%/functions/v1/issue-document%';

SELECT cron.schedule(
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_functions_url', true) || '/functions/v1/issue-document',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{"mode":"batch"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 22 * * *'
  AND command ILIKE '%cleanup_expired_otps%';

SELECT cron.schedule(
  '0 22 * * *',
  $$SELECT cleanup_expired_otps();$$
);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 23 * * *'
  AND command ILIKE '%cleanup_old_verification_attempts%';

SELECT cron.schedule(
  '0 23 * * *',
  $$SELECT cleanup_old_verification_attempts();$$
);
