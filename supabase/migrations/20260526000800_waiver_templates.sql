-- =============================================================================
-- 008: Waiver Templates
-- Lawyer-approved, versioned, mostly immutable legal documents
-- DEPENDENCIES: 001
-- =============================================================================

CREATE TABLE waiver_templates (
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

CREATE OR REPLACE FUNCTION prevent_waiver_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('approved', 'active') AND NEW.status IN ('approved', 'active') THEN
    RAISE EXCEPTION 'Cannot update approved or active waiver templates';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER waiver_template_immutable
  BEFORE UPDATE ON waiver_templates
  FOR EACH ROW EXECUTE FUNCTION prevent_waiver_update();

CREATE INDEX idx_waivers_tenant ON waiver_templates(tenant_id);
CREATE INDEX idx_waivers_status ON waiver_templates(status);

ALTER TABLE waiver_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all waivers"     ON waiver_templates FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage waivers"               ON waiver_templates FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "authenticated read active waivers"   ON waiver_templates FOR SELECT USING (tenant_id = get_my_tenant_id() AND status = 'active');
