-- =============================================================================
-- Daily lead follow-up digest (docs/plans/LEADS.md, step 4)
--
-- run-lead-followup-digest (Edge Function, daily cron) emails each studio admin
-- the leads due for follow-up today. This migration adds:
--   - lead_digest_optouts: an admin switches the email off for themselves
--     (Settings). RLS: each user manages only their own row in their studio.
--   - a unique index so each admin gets at most one digest per day (the
--     function claims a notification_log row before sending).
--   - the cron schedule: 05:23 UTC daily (07:23 Israel winter, 08:23 summer).
-- ADDITIVE.
-- =============================================================================

CREATE TABLE lead_digest_optouts (
  user_id    UUID        PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lead_digest_optouts IS
  'Studio admins who switched off the daily lead follow-up email. Row present = no email.';

ALTER TABLE lead_digest_optouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_digest_optouts_own ON lead_digest_optouts FOR ALL
  USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

GRANT SELECT, INSERT, DELETE ON TABLE public.lead_digest_optouts TO authenticated;
GRANT ALL ON TABLE public.lead_digest_optouts TO service_role;

-- At most one digest per studio, recipient and day.
CREATE UNIQUE INDEX notification_log_lead_digest_once
  ON notification_log (tenant_id, recipient_email, (variables->>'digest_date'))
  WHERE template_name = 'lead_followup_digest';

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command ILIKE '%/functions/v1/run-lead-followup-digest%';

SELECT cron.schedule(
  '23 5 * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/run-lead-followup-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
