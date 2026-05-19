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

-- Example RLS: Only tenant users can access their categories
CREATE POLICY expense_categories_access ON expense_categories
  FOR ALL
  USING (
    is_super_admin()
    OR tenant_id = get_my_tenant_id()
  );