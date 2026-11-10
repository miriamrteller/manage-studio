-- =============================================================================
-- 20261110095210: "Send feedback" — studio admins send the platform owner a
-- bug, an idea or a request for help, and she sees every one in
-- Platform > Feedback.
--
--   * studio_feedback — one row per message. Written only by the
--     notify-problem-report edge function (service role), which takes the
--     studio from the sender's own profile. Only the platform owner
--     (super_admin) reads it or changes its status. Studios cannot read it.
--   * feedback-screenshots — private bucket for the optional screenshot:
--     <tenant_id>/<random>.<png|jpg|webp>. A studio admin can upload into their
--     own studio's folder only, and cannot read, change or delete it afterwards.
--     Only the platform owner reads it.
--
-- Bugs still go to Sentry as well (the Error fixer reads them there). Nothing
-- here is copied to GitHub.
--
-- ADDITIVE MIGRATION: new objects only.
-- =============================================================================

CREATE TABLE studio_feedback (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sent_by         UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  kind            TEXT        NOT NULL CHECK (kind IN ('bug', 'idea', 'help')),
  message         TEXT        NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  route           TEXT        CHECK (route IS NULL OR length(route) <= 200),
  screenshot_path TEXT        CHECK (screenshot_path IS NULL OR length(screenshot_path) <= 200),
  sentry_event_id TEXT        CHECK (sentry_event_id IS NULL OR sentry_event_id ~ '^[0-9a-f]{32}$'),
  status          TEXT        NOT NULL DEFAULT 'new'
                              CHECK (status IN ('new', 'planned', 'done', 'not_doing')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE studio_feedback IS
  'Send feedback from studio admins (bug, idea, help). Written by the notify-problem-report edge function; read and triaged only by the platform owner.';
COMMENT ON COLUMN studio_feedback.message IS
  'The text the admin typed, with emails and phone numbers already removed in the app.';
COMMENT ON COLUMN studio_feedback.route IS
  'Route template of the page the admin was on (ids and tokens removed in the app).';
COMMENT ON COLUMN studio_feedback.screenshot_path IS
  'Object name in the private feedback-screenshots bucket, when the admin attached one.';
COMMENT ON COLUMN studio_feedback.status IS
  'Owner triage: new, planned, done, not_doing.';

CREATE INDEX idx_studio_feedback_created ON studio_feedback(created_at DESC);
CREATE INDEX idx_studio_feedback_tenant ON studio_feedback(tenant_id);

CREATE TRIGGER trigger_studio_feedback_updated_at
  BEFORE UPDATE ON studio_feedback
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE studio_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_feedback_super_admin_select ON studio_feedback FOR SELECT USING (is_super_admin());
CREATE POLICY studio_feedback_super_admin_update ON studio_feedback FOR UPDATE
  USING (is_super_admin()) WITH CHECK (is_super_admin());
GRANT SELECT, UPDATE (status) ON TABLE studio_feedback TO authenticated;
GRANT ALL ON TABLE studio_feedback TO service_role;

-- ---------------------------------------------------------------------------
-- Private bucket for screenshots
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-screenshots', 'feedback-screenshots', false, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins upload own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Platform owner reads feedback screenshots" ON storage.objects;

CREATE POLICY "Admins upload own feedback screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (SELECT 1 FROM public.user_profiles up
                WHERE up.id = (SELECT auth.uid()) AND up.role && ARRAY['tenant_admin', 'super_admin']::text[])
  );

CREATE POLICY "Platform owner reads feedback screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND public.is_super_admin());
