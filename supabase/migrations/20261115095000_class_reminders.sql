-- =============================================================================
-- Automatic class emails to enrolled families.
--
-- run-class-reminders (Edge Function, daily cron) sends, for each studio that
-- switched them on in Notifications -> Automatic emails:
--   - the morning-of reminder (time, where = the class location, what to wear);
--   - a week ahead, "no class on <day>" when the class would meet but the day
--     is a skipped holiday or one of the studio's own closed dates.
-- This migration adds:
--   - tenants.class_reminders = { morning, no_class, wear_en, wear_he,
--     closed_dates: ['YYYY-MM-DD', ...] }. Off ('{}') for every studio until
--     switched on, so nobody starts receiving new emails by surprise.
--   - a unique index so each family gets each email at most once.
--   - the cron schedule: 04:40 UTC daily (06:40 Israel winter, 07:40 summer).
-- ADDITIVE. See supabase/functions/_shared/class-reminders.ts.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN class_reminders JSONB NOT NULL DEFAULT '{}'::jsonb
  CONSTRAINT tenants_class_reminders_shape
    CHECK (jsonb_typeof(class_reminders) = 'object' AND pg_column_size(class_reminders) <= 32768);

COMMENT ON COLUMN tenants.class_reminders IS
  'Automatic class emails: { morning, no_class, wear_en, wear_he, closed_dates }. See supabase/functions/_shared/class-reminders.ts.';

-- Column-level SELECT on tenants (002700_grants.sql) does not cover new columns.
-- Admins read it through RLS ("users see own tenant") and save it under
-- "admins update own tenant".
GRANT SELECT (class_reminders) ON TABLE public.tenants TO authenticated;

-- At most one of each email per studio, recipient, day and enrolment.
CREATE UNIQUE INDEX notification_log_class_reminders_once
  ON notification_log (tenant_id, recipient_email, template_name, (variables->>'class_date'), (variables->>'engagement_id'))
  WHERE template_name IN ('class_reminder_morning', 'class_no_class_notice');

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command ILIKE '%/functions/v1/run-class-reminders%';

SELECT cron.schedule(
  '40 4 * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/run-class-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
