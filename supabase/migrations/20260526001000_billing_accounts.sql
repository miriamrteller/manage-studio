-- =============================================================================
-- 010: Billing Accounts
-- Payer accounts decoupled from families for flexible billing scenarios
-- DEPENDENCIES: 001
-- Additional enrolment-based RLS policies added in 013
-- =============================================================================

CREATE TABLE billing_accounts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  account_holder_name   TEXT        NOT NULL,
  primary_contact_email TEXT        NOT NULL,
  primary_contact_phone TEXT,
  payment_method        TEXT        DEFAULT 'card',
  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_accounts_tenant ON billing_accounts(tenant_id);
CREATE INDEX idx_billing_accounts_email  ON billing_accounts(primary_contact_email);
CREATE INDEX idx_billing_accounts_status ON billing_accounts(status);

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all billing_accounts" ON billing_accounts FOR ALL USING (is_super_admin());
CREATE POLICY "admins manage billing_accounts"           ON billing_accounts FOR ALL USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
