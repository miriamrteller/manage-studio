-- Migration 023: Billing Accounts
-- Payment consolidation (no family model) - supports flexible scenarios
-- Allows grandmother to pay for multiple unrelated families, child to switch payers per term, etc
-- DEPENDENCIES: Migration 001 (tenants table)
-- REQUIRED BY: Phase 1C (enrolments, payments)

CREATE TABLE billing_accounts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  account_holder_name   TEXT        NOT NULL,
  primary_contact_email TEXT        NOT NULL,
  primary_contact_phone TEXT,
  payment_method        TEXT        DEFAULT 'card',  -- card, bank_transfer, cash, check
  status                TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_billing_accounts_tenant ON billing_accounts(tenant_id);
CREATE INDEX idx_billing_accounts_email ON billing_accounts(primary_contact_email);
CREATE INDEX idx_billing_accounts_status ON billing_accounts(status);

-- RLS
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage billing_accounts" ON billing_accounts FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));
