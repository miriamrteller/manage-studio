-- =============================================================================
-- Finance admin: expenses (immutable) + create_expense RPC + receipt storage
-- DEPENDENCIES: 000200, 000600 (expense_categories), 000700 (audit_log)
-- =============================================================================

CREATE TABLE expenses (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  category_id           UUID NOT NULL REFERENCES expense_categories(id),
  description           TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  pretax_amount_minor   INT NOT NULL,
  vat_amount_minor      INT NOT NULL DEFAULT 0 CHECK (vat_amount_minor >= 0),
  total_amount_minor    INT NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'ILS',
  supplier_name         TEXT CHECK (supplier_name IS NULL OR char_length(supplier_name) <= 200),
  supplier_vat_number   TEXT CHECK (supplier_vat_number IS NULL OR char_length(supplier_vat_number) <= 20),
  receipt_storage_path  TEXT,
  expense_date          DATE NOT NULL,
  corrects_expense_id   UUID REFERENCES expenses(id),
  created_by            UUID NOT NULL REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_total_check CHECK (total_amount_minor = pretax_amount_minor + vat_amount_minor),
  CONSTRAINT expenses_correction_sign CHECK (
    corrects_expense_id IS NULL OR (
      total_amount_minor <= 0 AND pretax_amount_minor <= 0 AND vat_amount_minor <= 0
    )
  )
);

CREATE INDEX idx_expenses_tenant_date ON expenses(tenant_id, expense_date DESC);
CREATE INDEX idx_expenses_tenant_category ON expenses(tenant_id, category_id);

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_expense_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'expenses are immutable';
END;
$$;

CREATE TRIGGER expenses_no_update
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.reject_expense_mutation();

CREATE TRIGGER expenses_no_delete
  BEFORE DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.reject_expense_mutation();

CREATE OR REPLACE FUNCTION public.validate_expense_category_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM expense_categories c
    WHERE c.id = NEW.category_id
      AND c.tenant_id = NEW.tenant_id
      AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid or inactive expense category for tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_validate_category
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_expense_category_tenant();

-- ---------------------------------------------------------------------------
-- RLS — admin read only; writes via create_expense RPC
-- ---------------------------------------------------------------------------
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY expenses_super_admin ON expenses
  FOR ALL USING (is_super_admin());

CREATE POLICY expenses_admin_select ON expenses
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

GRANT SELECT ON public.expenses TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.expenses FROM authenticated;

-- ---------------------------------------------------------------------------
-- create_expense — SECURITY DEFINER; sole insert path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_expense(
  p_expense_id            UUID,
  p_category_id           UUID,
  p_description           TEXT,
  p_pretax_amount_minor   INT,
  p_vat_amount_minor      INT,
  p_total_amount_minor    INT,
  p_currency              TEXT,
  p_supplier_name         TEXT,
  p_supplier_vat_number   TEXT,
  p_receipt_storage_path  TEXT,
  p_expense_date          DATE,
  p_corrects_expense_id   UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id            UUID;
  v_currency             TEXT;
  v_vat_rate             NUMERIC;
  v_prices_include_vat   BOOLEAN;
  v_is_vat_eligible      BOOLEAN;
  v_expected_pretax      INT;
  v_expected_vat         INT;
  v_expected_total       INT;
  v_today                DATE;
  v_digits               TEXT;
  v_receipt_pattern      TEXT;
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

  IF EXISTS (SELECT 1 FROM expenses WHERE id = p_expense_id) THEN
    RAISE EXCEPTION 'expense id already exists';
  END IF;

  IF char_length(trim(p_description)) < 1 OR char_length(p_description) > 500 THEN
    RAISE EXCEPTION 'description must be 1-500 characters';
  END IF;

  SELECT is_vat_eligible INTO v_is_vat_eligible
  FROM expense_categories
  WHERE id = p_category_id AND tenant_id = v_tenant_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or inactive expense category';
  END IF;

  SELECT t.currency, t.vat_rate, t.prices_include_vat
  INTO v_currency, v_vat_rate, v_prices_include_vat
  FROM tenants t
  WHERE t.id = v_tenant_id;

  IF p_currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'currency must match tenant currency';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  IF p_expense_date > v_today THEN
    RAISE EXCEPTION 'expense_date cannot be in the future';
  END IF;

  IF p_corrects_expense_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM expenses
      WHERE id = p_corrects_expense_id AND tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION 'corrects_expense_id not found for tenant';
    END IF;
    IF p_description NOT LIKE '[Correction]%' THEN
      RAISE EXCEPTION 'correction description must start with [Correction]';
    END IF;
    IF p_pretax_amount_minor > 0 OR p_vat_amount_minor > 0 OR p_total_amount_minor > 0 THEN
      RAISE EXCEPTION 'correction amounts must be zero or negative';
    END IF;
  ELSE
    IF p_pretax_amount_minor <= 0 OR p_total_amount_minor <= 0 THEN
      RAISE EXCEPTION 'expense amounts must be positive';
    END IF;
  END IF;

  IF NOT v_is_vat_eligible THEN
    v_expected_vat := 0;
    IF v_prices_include_vat THEN
      v_expected_total := p_total_amount_minor;
      v_expected_pretax := p_total_amount_minor;
    ELSE
      v_expected_pretax := p_pretax_amount_minor;
      v_expected_total := p_pretax_amount_minor;
    END IF;
  ELSIF v_prices_include_vat THEN
    v_expected_total := p_total_amount_minor;
    v_expected_pretax := round(p_total_amount_minor / (1 + v_vat_rate))::int;
    v_expected_vat := p_total_amount_minor - v_expected_pretax;
  ELSE
    v_expected_pretax := p_pretax_amount_minor;
    v_expected_vat := round(p_pretax_amount_minor * v_vat_rate)::int;
    v_expected_total := p_pretax_amount_minor + v_expected_vat;
  END IF;

  IF p_pretax_amount_minor <> v_expected_pretax
     OR p_vat_amount_minor <> v_expected_vat
     OR p_total_amount_minor <> v_expected_total THEN
    RAISE EXCEPTION 'amounts do not match server VAT calculation';
  END IF;

  IF v_is_vat_eligible AND v_expected_vat > 0 THEN
    IF p_supplier_vat_number IS NULL OR trim(p_supplier_vat_number) = '' THEN
      RAISE EXCEPTION 'supplier_vat_number required for VAT-eligible expenses';
    END IF;
    v_digits := regexp_replace(p_supplier_vat_number, '[^0-9]', '', 'g');
    IF length(v_digits) <> 9 THEN
      RAISE EXCEPTION 'supplier_vat_number must contain 9 digits';
    END IF;
  END IF;

  IF p_receipt_storage_path IS NOT NULL THEN
    v_receipt_pattern := v_tenant_id::text || '/' || p_expense_id::text || '/receipt.';
    IF left(p_receipt_storage_path, length(v_receipt_pattern)) <> v_receipt_pattern THEN
      RAISE EXCEPTION 'invalid receipt_storage_path';
    END IF;
  END IF;

  INSERT INTO expenses (
    id, tenant_id, category_id, description,
    pretax_amount_minor, vat_amount_minor, total_amount_minor, currency,
    supplier_name, supplier_vat_number, receipt_storage_path,
    expense_date, corrects_expense_id, created_by
  ) VALUES (
    p_expense_id, v_tenant_id, p_category_id, trim(p_description),
    p_pretax_amount_minor, p_vat_amount_minor, p_total_amount_minor, p_currency,
    NULLIF(trim(p_supplier_name), ''), NULLIF(trim(p_supplier_vat_number), ''),
    p_receipt_storage_path, p_expense_date, p_corrects_expense_id, auth.uid()
  );

  INSERT INTO audit_log (
    tenant_id, actor_id, action, entity_type, entity_id
  ) VALUES (
    v_tenant_id, auth.uid(), 'CREATE', 'expenses', p_expense_id
  );

  RETURN p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_expense(
  UUID, UUID, TEXT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, DATE, UUID
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: expense-receipts (private)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins insert own tenant expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins read own tenant expense receipts" ON storage.objects;

CREATE POLICY "Admins insert own tenant expense receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins read own tenant expense receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );
