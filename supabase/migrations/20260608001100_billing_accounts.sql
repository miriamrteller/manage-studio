-- =============================================================================
-- 001100: Billing Accounts
-- Household-level billing home decoupled from individual people.
-- payments lives in 001600_finance (it FKs engagements, created in 001300).
-- Engagement-dependent RLS policies are added in 001500_engagement_rls.
-- DEPENDENCIES: 000200, 000300
-- =============================================================================

CREATE TABLE billing_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  account_id      UUID        REFERENCES accounts(id),
  person_id       UUID        REFERENCES people(id),
  business_tax_id TEXT,        -- optional BUYER tax id (B2B)
  business_name   TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_account_owner CHECK (account_id IS NOT NULL OR person_id IS NOT NULL)
);

CREATE INDEX idx_billing_accounts_tenant  ON billing_accounts(tenant_id);
CREATE INDEX idx_billing_accounts_account ON billing_accounts(account_id);
CREATE INDEX idx_billing_accounts_status  ON billing_accounts(status);

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_accounts_super_admin ON billing_accounts FOR ALL
  USING (is_super_admin());
CREATE POLICY billing_accounts_admin ON billing_accounts FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY billing_accounts_household_select ON billing_accounts FOR SELECT
  USING (tenant_id = get_my_tenant_id()
         AND (account_id IN (SELECT get_my_account_ids())
              OR person_id = get_my_person_id()));
