-- =============================================================================
-- 000900: Consent Templates
-- Lawyer-approved, versioned legal documents. Content/name/hash are immutable
-- once a template is approved or active; status transitions stay allowed.
-- DEPENDENCIES: 000200
-- =============================================================================

CREATE TABLE consent_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id),
  name         TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  version      INT         NOT NULL DEFAULT 1,
  version_hash VARCHAR(64) NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'approved', 'active', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, version)
);

-- Once a template is approved/active, its content/name/hash is locked.
-- Status transitions (approved -> active, active -> archived, etc.) remain allowed.
CREATE OR REPLACE FUNCTION prevent_consent_template_update()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('approved', 'active') THEN
    IF (OLD.content      IS DISTINCT FROM NEW.content)
    OR (OLD.version_hash IS DISTINCT FROM NEW.version_hash)
    OR (OLD.name         IS DISTINCT FROM NEW.name) THEN
      RAISE EXCEPTION 'Cannot change the content or name of an approved or active consent template. Archive it and create a new version instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER consent_template_immutable
  BEFORE UPDATE ON consent_templates
  FOR EACH ROW EXECUTE FUNCTION prevent_consent_template_update();

CREATE INDEX idx_consent_templates_tenant ON consent_templates(tenant_id);
CREATE INDEX idx_consent_templates_status ON consent_templates(status);

ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all consent_templates"   ON consent_templates FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage consent_templates"             ON consent_templates FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "authenticated read active consent_templates" ON consent_templates FOR SELECT USING (tenant_id = get_my_tenant_id() AND status = 'active');
