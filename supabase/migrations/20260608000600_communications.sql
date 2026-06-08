-- =============================================================================
-- 000600: Communications
-- notification_log, tenant_notification_templates, tenant_email_customizations,
-- expense_categories.
-- DEPENDENCIES: 000200, 000300
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Notification log (append-only delivery audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE notification_log (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID        NOT NULL REFERENCES tenants(id),
  recipient_person_id         UUID        REFERENCES people(id),
  recipient_account_member_id UUID        REFERENCES account_members(id),
  recipient_email             TEXT,
  recipient_phone             TEXT,
  channel                     TEXT        NOT NULL DEFAULT 'email'
                              CHECK (channel IN ('email', 'whatsapp', 'voice')),
  template_name               TEXT        NOT NULL,
  variables                   JSONB,
  subject                     TEXT,
  body_preview                TEXT,
  external_msg_id             TEXT,
  status                      TEXT        NOT NULL DEFAULT 'sent'
                              CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'bounced', 'pending')),
  failure_reason              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at                     TIMESTAMPTZ,
  CONSTRAINT recipient_not_null CHECK (
    (recipient_person_id         IS NOT NULL)::int +
    (recipient_account_member_id IS NOT NULL)::int +
    (recipient_email             IS NOT NULL)::int +
    (recipient_phone             IS NOT NULL)::int > 0
  )
);

CREATE INDEX idx_notification_log_tenant  ON notification_log(tenant_id);
CREATE INDEX idx_notification_log_person  ON notification_log(recipient_person_id);
CREATE INDEX idx_notification_log_account ON notification_log(recipient_account_member_id);
CREATE INDEX idx_notification_log_status  ON notification_log(status);
CREATE INDEX idx_notification_log_channel ON notification_log(channel);
CREATE INDEX idx_notification_log_created ON notification_log(tenant_id, created_at DESC);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_log_super_admin    ON notification_log FOR SELECT USING (is_super_admin());
CREATE POLICY notification_log_admin_read     ON notification_log FOR SELECT USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY notification_log_service_insert ON notification_log FOR INSERT WITH CHECK (is_service_role() OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- ---------------------------------------------------------------------------
-- Tenant notification templates (WhatsApp/email/voice approval workflow)
-- ---------------------------------------------------------------------------
CREATE TABLE tenant_notification_templates (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  channel            TEXT        NOT NULL CHECK (channel IN ('email', 'whatsapp', 'voice')),
  template_name      TEXT        NOT NULL,
  twilio_content_sid TEXT,
  email_template_id  TEXT,
  voice_script_sid   TEXT,
  version            INT         NOT NULL DEFAULT 1,
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_date      TIMESTAMPTZ,
  approval_notes     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel, template_name)
);

CREATE INDEX idx_templates_tenant_channel ON tenant_notification_templates(tenant_id, channel, template_name);
CREATE INDEX idx_templates_status         ON tenant_notification_templates(status);

ALTER TABLE tenant_notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_super_admin   ON tenant_notification_templates FOR ALL    USING (is_super_admin());
CREATE POLICY templates_admin_manage  ON tenant_notification_templates FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY templates_read_approved ON tenant_notification_templates FOR SELECT USING (status = 'approved' AND tenant_id = get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- Tenant email customizations (white-label copy overrides per template/language)
-- ---------------------------------------------------------------------------
CREATE TABLE tenant_email_customizations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_name TEXT        NOT NULL,
  language      TEXT        NOT NULL CHECK (language IN ('en', 'he')),
  overrides     JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_name, language)
);

CREATE INDEX idx_email_customizations_tenant   ON tenant_email_customizations(tenant_id);
CREATE INDEX idx_email_customizations_template ON tenant_email_customizations(tenant_id, template_name);

ALTER TABLE tenant_email_customizations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_tenant_email_customizations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_tenant_email_customizations_updated_at
  BEFORE UPDATE ON tenant_email_customizations
  FOR EACH ROW EXECUTE FUNCTION update_tenant_email_customizations_updated_at();

CREATE POLICY tenant_email_customizations_super_admin  ON tenant_email_customizations FOR ALL    USING (is_super_admin());
CREATE POLICY tenant_email_customizations_admin_manage ON tenant_email_customizations FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))) WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY tenant_email_customizations_select       ON tenant_email_customizations FOR SELECT USING (tenant_id = get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- Expense categories (per-tenant configurable)
-- ---------------------------------------------------------------------------
CREATE TABLE expense_categories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  name            TEXT        NOT NULL,
  description     TEXT,
  color           TEXT,
  is_vat_eligible BOOLEAN     NOT NULL DEFAULT true,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_expense_categories_tenant ON expense_categories(tenant_id, is_active);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY expense_categories_super_admin  ON expense_categories FOR ALL    USING (is_super_admin());
CREATE POLICY expense_categories_admin_manage ON expense_categories FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY expense_categories_read_active  ON expense_categories FOR SELECT USING (tenant_id = get_my_tenant_id() AND is_active = true);
