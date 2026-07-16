-- =============================================================================
-- 002800: Scheduled jobs (pg_cron + pg_net)
-- Folded: scheduled_jobs + cron platform_config + expire-scheduling-holds cron.
-- DEPENDENCIES: 000700, 002600, Edge Functions via platform_config / GUCs
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


-- ── Cron URL/secret via platform_config (ex-02700) ──
CREATE OR REPLACE FUNCTION get_supabase_functions_url()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  v TEXT;
BEGIN
  v := nullif(current_setting('app.settings.supabase_functions_url', true), '');
  IF v IS NOT NULL THEN
    RETURN v;
  END IF;

  SELECT value INTO v
  FROM private.platform_config
  WHERE key = 'supabase_functions_url'
  LIMIT 1;

  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'supabase_functions_url is not configured';
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION get_cron_secret()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  v TEXT;
BEGIN
  v := nullif(current_setting('app.settings.cron_secret', true), '');
  IF v IS NOT NULL THEN
    RETURN v;
  END IF;

  SELECT value INTO v
  FROM private.platform_config
  WHERE key = 'cron_secret'
  LIMIT 1;

  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'cron_secret is not configured';
  END IF;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION get_supabase_functions_url() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_supabase_functions_url() FROM anon;
REVOKE ALL ON FUNCTION get_supabase_functions_url() FROM authenticated;
REVOKE ALL ON FUNCTION get_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_cron_secret() FROM anon;
REVOKE ALL ON FUNCTION get_cron_secret() FROM authenticated;

-- Reschedule HTTP cron jobs to use platform_config (idempotent unschedule by signature)

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 22 1 * *'
  AND command ILIKE '%/functions/v1/run-monthly-billing%';

SELECT cron.schedule(
  '0 22 1 * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/run-monthly-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
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
    url := get_supabase_functions_url() || '/functions/v1/run-monthly-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
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
    url := get_supabase_functions_url() || '/functions/v1/run-enrolment-payment-dunning',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
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
    url := get_supabase_functions_url() || '/functions/v1/send-waiver-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
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
    url := get_supabase_functions_url() || '/functions/v1/issue-document',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{"mode":"batch"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);


-- ── Expire scheduling holds cron (ex-03500) ──
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

