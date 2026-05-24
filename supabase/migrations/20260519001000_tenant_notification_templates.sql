-- Migration 010 — Tenant notification templates
-- Per-tenant WhatsApp/email template management (ISSUE #7 FIX)
-- Each school manages their own approved message templates with Twilio/Meta

CREATE TABLE tenant_notification_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),

  -- Channel + template identity
  channel               TEXT        NOT NULL
                        CHECK (channel IN ('email','whatsapp','voice')),
  template_name         TEXT        NOT NULL,
  -- Examples: 'welcome', 'class_cancellation', 'waiting_list_offer', 'payment_reminder'

  -- Provider-specific IDs
  -- WhatsApp: Twilio Content SID (from Meta, e.g., "HX1234567890...")
  twilio_content_sid    TEXT,

  -- Email: Resend template ID (if using Resend templates) OR component name
  email_template_id     TEXT,

  -- Voice: Twilio Studio flow SID or script text
  voice_script_sid      TEXT,

  -- Version tracking for resubmissions to Meta
  version               INT         NOT NULL DEFAULT 1,

  -- Approval status
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
  approval_date         TIMESTAMPTZ,
  approval_notes        TEXT,

  -- Lifecycle
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uniqueness: one template per tenant+channel+name
  UNIQUE (tenant_id, channel, template_name)
);

-- Index for template lookups
CREATE INDEX idx_templates_tenant_channel  ON tenant_notification_templates(tenant_id, channel, template_name);
CREATE INDEX idx_templates_status          ON tenant_notification_templates(status);

-- Row-level security
ALTER TABLE tenant_notification_templates ENABLE ROW LEVEL SECURITY;

-- Super-admin manages all templates across all tenants
CREATE POLICY templates_super_admin ON tenant_notification_templates
  FOR ALL
  USING (is_super_admin());

-- Tenant admins manage their own tenant's templates
CREATE POLICY templates_admin_manage ON tenant_notification_templates
  FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND 'tenant_admin' = ANY((SELECT role FROM user_profiles WHERE id = auth.uid()))
  );

-- Authenticated users can read approved templates for their own tenant
CREATE POLICY templates_read_approved ON tenant_notification_templates
  FOR SELECT
  USING (
    status = 'approved'
    AND tenant_id = get_my_tenant_id()
  );