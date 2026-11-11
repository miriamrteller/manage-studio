-- =============================================================================
-- OpalSwift's own billing of studios, step B3 (docs/plans/TAKBULL-INTEGRATION.md): the
-- monthly charge on each studio's saved card (run-platform-billing).
--
-- * set_platform_charging: the platform owner switches the monthly charge on or off
--   (Platform → Billing). Off by default, so nothing charges until the owner says so.
-- * The daily schedule: 04:41 UTC (06:41 Israel winter, 07:41 summer).
-- =============================================================================

CREATE OR REPLACE FUNCTION set_platform_charging(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(is_super_admin(), false) THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_enabled is required';
  END IF;
  UPDATE platform_billing_settings SET charging_enabled = p_enabled, updated_at = now() WHERE id;
END;
$$;
REVOKE ALL ON FUNCTION set_platform_charging(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_platform_charging(BOOLEAN) TO authenticated;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command ILIKE '%/functions/v1/run-platform-billing%';

SELECT cron.schedule(
  '41 4 * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/run-platform-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
