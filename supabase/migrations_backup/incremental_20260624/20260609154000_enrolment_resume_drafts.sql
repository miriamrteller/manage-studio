-- =============================================================================
-- 002610: Enrolment resume drafts (login handoff resilience)
-- Service-role only table used by Edge Functions:
--   save-enrolment-resume / load-enrolment-resume / clear-enrolment-resume
-- =============================================================================

CREATE TABLE IF NOT EXISTS enrolment_resume_drafts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  engagement_id UUID        REFERENCES engagements(id),
  resume_key    TEXT        NOT NULL UNIQUE,
  state_json    JSONB       NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrolment_resume_drafts_tenant
  ON enrolment_resume_drafts(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrolment_resume_drafts_expires
  ON enrolment_resume_drafts(expires_at);

ALTER TABLE enrolment_resume_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON enrolment_resume_drafts FROM anon;
REVOKE ALL ON enrolment_resume_drafts FROM authenticated;

CREATE POLICY enrolment_resume_drafts_service_only
  ON enrolment_resume_drafts
  FOR ALL
  USING (is_service_role())
  WITH CHECK (is_service_role());

-- Optional scheduled cleanup:
-- SELECT cron.schedule(
--   'cleanup-enrolment-resume-drafts',
--   '*/30 * * * *',
--   $$DELETE FROM enrolment_resume_drafts WHERE expires_at < now();$$
-- );

