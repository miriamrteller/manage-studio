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


-- Notification blast: human-readable recipient fields + text search on names/emails/classes only (never IDs)

-- Postgres cannot CREATE OR REPLACE when OUT parameters change; drop all overloads first.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'resolve_notification_blast_recipients',
        'preview_notification_blast_recipients'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', fn.signature);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_notification_blast_recipients(
  p_tenant_id UUID,
  p_scope TEXT,
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_recipient_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID,
  account_name TEXT,
  class_names TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT;
  v_query_is_uuid BOOLEAN;
  v_active_statuses TEXT[] := ARRAY[
    'active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer'
  ];
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;
  IF p_scope NOT IN ('all', 'level', 'class', 'account') THEN
    RAISE EXCEPTION 'Invalid scope: %', p_scope;
  END IF;
  IF p_scope = 'level' AND p_category_id IS NULL THEN
    RAISE EXCEPTION 'category_id required for level scope';
  END IF;
  IF p_scope = 'class' AND p_offering_id IS NULL THEN
    RAISE EXCEPTION 'offering_id required for class scope';
  END IF;
  IF p_scope = 'account' AND p_account_id IS NULL THEN
    RAISE EXCEPTION 'account_id required for account scope';
  END IF;

  v_query := NULLIF(btrim(p_recipient_query), '');
  v_query_is_uuid := v_query IS NOT NULL
    AND v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  RETURN QUERY
  WITH scoped AS (
    SELECT DISTINCT ac.id AS account_id
    FROM engagements e
    INNER JOIN people student
      ON student.id = e.person_id AND student.tenant_id = e.tenant_id
    INNER JOIN accounts ac
      ON ac.id = student.account_id AND ac.tenant_id = e.tenant_id
    INNER JOIN offerings o
      ON o.id = e.offering_id AND o.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND student.account_id IS NOT NULL
      AND e.status = ANY(v_active_statuses)
      AND (
        p_scope = 'all'
        OR (p_scope = 'level' AND o.category_id = p_category_id)
        OR (p_scope = 'class' AND e.offering_id = p_offering_id)
        OR (p_scope = 'account' AND ac.id = p_account_id)
      )
  ),
  candidates AS (
    SELECT
      lower(trim(contact.email)) AS email_key,
      trim(contact.email) AS recipient_email,
      contact.name AS recipient_name,
      contact.id AS person_id,
      am.id AS account_member_id,
      ac.name AS account_name,
      (
        SELECT string_agg(DISTINCT o2.name, ', ' ORDER BY o2.name)
        FROM people student
        INNER JOIN engagements e2
          ON e2.person_id = student.id AND e2.tenant_id = p_tenant_id
        INNER JOIN offerings o2
          ON o2.id = e2.offering_id AND o2.tenant_id = p_tenant_id
        WHERE student.account_id = ac.id
          AND student.tenant_id = p_tenant_id
          AND e2.status = ANY(v_active_statuses)
          AND (
            p_scope = 'all'
            OR (p_scope = 'level' AND o2.category_id = p_category_id)
            OR (p_scope = 'class' AND e2.offering_id = p_offering_id)
            OR (p_scope = 'account' AND ac.id = p_account_id)
          )
      ) AS class_names,
      COALESCE(cp.email_opted_in, true) AS email_opted_in,
      COALESCE(cp.notify_announcements, true) AS notify_announcements
    FROM scoped s
    INNER JOIN accounts ac
      ON ac.id = s.account_id AND ac.tenant_id = p_tenant_id
    INNER JOIN people contact
      ON contact.id = ac.person_id AND contact.tenant_id = p_tenant_id
    LEFT JOIN account_members am
      ON am.account_id = ac.id
     AND am.person_id = contact.id
     AND am.role = 'account_holder'
    LEFT JOIN contact_preferences cp
      ON cp.person_id = contact.id
     AND cp.tenant_id = p_tenant_id
     AND cp.account_member_id IS NULL
    WHERE contact.email IS NOT NULL
      AND trim(contact.email) <> ''
  )
  SELECT DISTINCT ON (c.email_key)
    c.recipient_email,
    c.recipient_name,
    c.person_id,
    c.account_member_id,
    c.account_name,
    c.class_names
  FROM candidates c
  WHERE c.email_opted_in
    AND c.notify_announcements
    AND (
      v_query IS NULL
      OR (
        NOT v_query_is_uuid
        AND (
          c.recipient_email ILIKE '%' || v_query || '%'
          OR c.recipient_name ILIKE '%' || v_query || '%'
          OR c.account_name ILIKE '%' || v_query || '%'
          OR COALESCE(c.class_names, '') ILIKE '%' || v_query || '%'
        )
      )
    )
  ORDER BY c.email_key, c.recipient_name;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_notification_blast_recipients(UUID, TEXT, UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_notification_blast_recipients(UUID, TEXT, UUID, UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.preview_notification_blast_recipients(
  p_scope TEXT,
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_recipient_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID,
  account_name TEXT,
  class_names TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN QUERY
  SELECT * FROM public.resolve_notification_blast_recipients(
    v_tenant_id,
    p_scope,
    p_category_id,
    p_offering_id,
    p_account_id,
    p_recipient_query
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_notification_blast_recipients(TEXT, UUID, UUID, UUID, TEXT) TO authenticated;

-- Account search: ignore UUID-shaped queries (never match internal IDs)
CREATE OR REPLACE FUNCTION public.search_notification_blast_accounts(p_query TEXT)
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  contact_name TEXT,
  contact_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_query TEXT;
  v_query_is_uuid BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  v_query := NULLIF(btrim(p_query), '');
  IF v_query IS NULL THEN
    RETURN;
  END IF;

  v_query_is_uuid := v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF v_query_is_uuid THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ac.id AS account_id,
    ac.name AS account_name,
    contact.name AS contact_name,
    contact.email AS contact_email
  FROM accounts ac
  INNER JOIN people contact
    ON contact.id = ac.person_id AND contact.tenant_id = v_tenant_id
  WHERE ac.tenant_id = v_tenant_id
    AND (
      ac.name ILIKE '%' || v_query || '%'
      OR contact.name ILIKE '%' || v_query || '%'
      OR contact.email ILIKE '%' || v_query || '%'
    )
  ORDER BY ac.name NULLS LAST, contact.name
  LIMIT 20;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dunning_key
  ON notification_log (tenant_id, template_name, (variables->>'dunning_key'))
  WHERE (variables->>'dunning_key') IS NOT NULL
    AND status IN ('sent', 'delivered', 'read', 'pending');
