-- Migration 009 — Audit log
-- Immutable audit trail (insert only, no update/delete)

CREATE TABLE audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  
  -- Who did it
  actor_id      UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  actor_email   TEXT,                  -- denormalized: preserved if actor later deleted

  -- What action
  action        TEXT        NOT NULL,
  -- Examples: 'notification.sent', 'payment.succeeded', 'enrolment.created'

  entity_type   TEXT        NOT NULL,  -- 'notification', 'payment', 'enrolment'
  entity_id     UUID,                  -- ID of affected entity

  -- State changes
  before_state  JSONB,                 -- Previous state (for updates)
  after_state   JSONB,                 -- New state

  -- Request context
  ip_address    INET,
  user_agent    TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for compliance audits
CREATE INDEX idx_audit_log_tenant      ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_action      ON audit_log(action);
CREATE INDEX idx_audit_log_entity      ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor       ON audit_log(actor_id);

-- Row level security
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Immutable (insert only — no UPDATE or DELETE policies defined, so RLS blocks them)
-- Service role and authenticated users in the tenant can insert
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (
    is_service_role()
    OR tenant_id = get_my_tenant_id()
  );

-- Super-admin reads all
CREATE POLICY audit_log_super_admin_read ON audit_log
  FOR SELECT
  USING (is_super_admin());

-- Tenant admins read their own tenant's audit log
CREATE POLICY audit_log_admin_read ON audit_log
  FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );