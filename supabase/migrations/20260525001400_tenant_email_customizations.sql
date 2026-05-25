-- Migration 014: Tenant Email Customization Support
-- Enables white-label email text customization per tenant, per language, per template
-- Code-first approach: base templates in git, DB overrides optional
-- RLS enforced: tenants can only read/write their own customizations
-- DEPENDENCIES: Migration 001 (tenants, user_profiles)
-- REQUIRED BY: Edge function send-notification (loads overrides before rendering)

CREATE TABLE tenant_email_customizations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_name     TEXT        NOT NULL,
  language          TEXT        NOT NULL CHECK (language IN ('en', 'he')),
  overrides         JSONB       NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure only one customization per (tenant, template, language) combo
  UNIQUE (tenant_id, template_name, language)
);

-- Indexes for efficient queries
CREATE INDEX idx_tenant_email_customizations_tenant 
  ON tenant_email_customizations(tenant_id);
CREATE INDEX idx_tenant_email_customizations_template 
  ON tenant_email_customizations(tenant_id, template_name);
CREATE INDEX idx_tenant_email_customizations_language 
  ON tenant_email_customizations(language);

-- Enable RLS
ALTER TABLE tenant_email_customizations ENABLE ROW LEVEL SECURITY;

-- Super-admin manages all email customizations (platform ops)
CREATE POLICY tenant_email_customizations_super_admin
  ON tenant_email_customizations
  FOR ALL
  USING (is_super_admin());

-- Tenant admins manage their own tenant's email customizations
CREATE POLICY tenant_email_customizations_admin_manage
  ON tenant_email_customizations
  FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

-- Authenticated users in the tenant can read their own customizations (for rendering)
CREATE POLICY tenant_email_customizations_select
  ON tenant_email_customizations
  FOR SELECT
  USING (tenant_id = get_my_tenant_id());

-- Create updated_at trigger to auto-update timestamp
CREATE OR REPLACE FUNCTION update_tenant_email_customizations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_tenant_email_customizations_updated_at
  BEFORE UPDATE ON tenant_email_customizations
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_email_customizations_updated_at();

-- Seed comment for audit/documentation
COMMENT ON TABLE tenant_email_customizations IS
  'Tenant email template customizations. Stores JSON overrides for template text fields. Used to enable white-label customization without code changes. Base templates live in packages/shared/src/i18n/email-templates-*.json (git-tracked, safe defaults). This table stores only diffs — tenants with no overrides will use code defaults. RLS enforced: tenants can only access their own customizations.';

COMMENT ON COLUMN tenant_email_customizations.template_name IS
  'Template identifier (e.g., "otp", "magic_link", "welcome", "payment_reminder", "class_cancellation", "waiting_list_offer"). Matches keys in i18n JSON files.';

COMMENT ON COLUMN tenant_email_customizations.language IS
  'Language code: "en" or "he". Enables per-language customization.';

COMMENT ON COLUMN tenant_email_customizations.overrides IS
  'JSON object containing template field overrides. Example: {"greeting": "Custom greeting", "cta_button": "Click here"}. Fields not present in overrides will use code defaults. Structure matches keys in email-templates-[en|he].json.';