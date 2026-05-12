-- Migration 012 — RLS policies for notification tables
-- Enable Row Level Security on notification_log, audit_log, tenant_notification_templates, expense_categories

-- Enable RLS on all notification tables
ALTER TABLE notification_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories           ENABLE ROW LEVEL SECURITY;

-- RLS assumes these helper functions exist from Phase 1B:
-- - get_my_tenant_id(): returns auth.jwt()->'custom_claims'->>'tenant_id'
-- - is_super_admin(): returns true if auth.jwt()->'role' = 'super_admin'

-- ===== notification_log =====
-- Admins + super_admins can see/insert all notifications for their tenant
CREATE POLICY notification_log_access ON notification_log
  FOR SELECT
  USING (
    is_super_admin()
    OR tenant_id = get_my_tenant_id()
  );

CREATE POLICY notification_log_insert ON notification_log
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_my_tenant_id()
  );

-- ===== audit_log =====
-- Immutable (insert only, RLS prevents update/delete)
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_my_tenant_id()
  );

-- Admin-only read access for audits
CREATE POLICY audit_log_read ON audit_log
  FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role IN ('tenant_admin', 'super_admin')
      )
    )
  );

-- ===== tenant_notification_templates =====
-- Admins manage templates, all users can read approved templates
CREATE POLICY templates_read ON tenant_notification_templates
  FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND (
        status = 'approved'
        OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id = auth.uid()
          AND role IN ('tenant_admin', 'super_admin')
        )
      )
    )
  );

CREATE POLICY templates_modify ON tenant_notification_templates
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role = 'tenant_admin'
      )
    )
  );

CREATE POLICY templates_update ON tenant_notification_templates
  FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role = 'tenant_admin'
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role = 'tenant_admin'
      )
    )
  );

-- ===== expense_categories =====
-- Admins only
CREATE POLICY categories_read ON expense_categories
  FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role IN ('tenant_admin', 'super_admin')
      )
    )
  );

CREATE POLICY categories_insert ON expense_categories
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role = 'tenant_admin'
      )
    )
  );

CREATE POLICY categories_update ON expense_categories
  FOR UPDATE
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role = 'tenant_admin'
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role = 'tenant_admin'
      )
    )
  );
