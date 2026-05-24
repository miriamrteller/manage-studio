-- Migration 011 — Expense categories
-- Per-tenant configurable expense categories (ISSUE #9 FIX)
-- Schools can add custom categories like 'guest_artist_fee', 'prop_rental'

CREATE TABLE expense_categories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),

  -- Category name
  name            TEXT        NOT NULL,
  description     TEXT,

  -- UI
  color           TEXT,                  -- For categorization: '#FF6B6B'

  -- Accounting
  is_vat_eligible BOOLEAN     NOT NULL DEFAULT true,  -- VAT reclaim eligibility
  is_active       BOOLEAN     NOT NULL DEFAULT true,

  -- Ordering
  sort_order      INT         NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_categories_tenant ON expense_categories(tenant_id, is_active);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Super-admin manages all categories
CREATE POLICY expense_categories_super_admin ON expense_categories
  FOR ALL
  USING (is_super_admin());

-- Tenant admins manage their own tenant's categories
CREATE POLICY expense_categories_admin_manage ON expense_categories
  FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND 'tenant_admin' = ANY((SELECT role FROM user_profiles WHERE id = auth.uid()))
  );

-- Authenticated users read active categories for their own tenant
CREATE POLICY expense_categories_read_active ON expense_categories
  FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND is_active = true);