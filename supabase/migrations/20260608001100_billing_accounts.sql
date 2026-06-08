-- =============================================================================
-- 001100: Billing Accounts
-- Payer accounts decoupled from family accounts for flexible billing.
-- payments lives in 001600_finance (it FKs engagements, created in 001300).
-- Engagement-dependent RLS policies are added in 001500_engagement_rls.
-- DEPENDENCIES: 000200, 000300
-- =============================================================================

CREATE TABLE billing_accounts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id),
  person_id      UUID        NOT NULL REFERENCES people(id),
  payment_method TEXT        DEFAULT 'card',
  status         TEXT        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive', 'archived')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_accounts_tenant ON billing_accounts(tenant_id);
CREATE INDEX idx_billing_accounts_status ON billing_accounts(status);

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all billing_accounts" ON billing_accounts FOR ALL USING (is_super_admin());
CREATE POLICY "admins manage billing_accounts"           ON billing_accounts FOR ALL USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
