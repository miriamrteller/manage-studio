-- =============================================================================
-- 002700: Cron HTTP settings via platform_config (hosted Supabase)
-- ALTER DATABASE ... SET app.settings.* fails with permission denied on hosted
-- Supabase. Same pattern as get_app_encryption_key() in 002000.
--
-- After db:push, set values in SQL Editor (or pnpm smoke:cron:dev -- --set-gucs):
--   INSERT INTO private.platform_config (key, value) VALUES
--     ('supabase_functions_url', 'https://<project-ref>.supabase.co'),
--     ('cron_secret', '<matches Edge CRON_SECRET>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- =============================================================================

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
