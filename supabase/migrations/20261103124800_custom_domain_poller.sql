-- =============================================================================
-- Self-serve custom domains (6/8): the poller.
--
-- Every 10 minutes, ask the custom-domain Edge Function to check pending
-- domains (inside their 24-hour window), pause expired ones and delete
-- never-activated ones after 30 days. Owner rule: the job only calls the
-- function when some row needs it; on a quiet run it is just this SQL check.
-- Same pattern as the other jobs (get_supabase_functions_url + get_cron_secret).
-- ADDITIVE.
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command ILIKE '%/functions/v1/custom-domain%';

SELECT cron.schedule(
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/custom-domain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{"action":"poll"}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE EXISTS (
    SELECT 1 FROM public.tenant_custom_domains d
    WHERE d.managed_by = 'self_serve'
      AND (
        d.status = 'pending'
        OR (d.status IN ('paused', 'failed') AND d.delete_after <= now())
      )
  );
  $$
);
