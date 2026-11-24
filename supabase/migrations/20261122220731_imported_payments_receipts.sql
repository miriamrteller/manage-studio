-- =============================================================================
-- Imported payments can get a receipt ("Send receipt" on Finance > Import).
--
-- * imported_income.payer_email: the payer's email from the sheet (new "Email"
--   column on the import), or the one the studio typed when sending a receipt.
-- * imported_income.payment_id: set when the studio sends a receipt for the row.
--   The row then becomes a real payment recorded by hand (provider 'manual'),
--   and the studio's invoicing service issues the receipt for it. Rows with a
--   receipt number from the old system never get one (send-imported-receipts).
-- * payments.document_name: the payer's name as the sheet has it, printed on the
--   document when it differs from the client's name in OpalSwift.
-- * import_finance_rows keeps the email; undo_finance_import keeps rows that
--   are already payments; get_finance_summary stops counting them twice.
--
-- ADDITIVE: new nullable columns; the three functions keep their signatures.
-- =============================================================================

ALTER TABLE imported_income
  ADD COLUMN payer_email TEXT CHECK (payer_email IS NULL OR char_length(payer_email) <= 320),
  ADD COLUMN payment_id  UUID REFERENCES payments(id);

CREATE UNIQUE INDEX idx_imported_income_payment ON imported_income(payment_id) WHERE payment_id IS NOT NULL;

COMMENT ON COLUMN imported_income.payer_email IS 'Payer email from the sheet or typed when the receipt was sent.';
COMMENT ON COLUMN imported_income.payment_id IS 'The payment this row became when the studio sent a receipt for it (send-imported-receipts).';
COMMENT ON TABLE imported_income IS
  'Income history imported from a studio''s own spreadsheet. Not a payment until the studio sends a receipt for it (payment_id). amount_minor is in the studio currency.';

ALTER TABLE payments
  ADD COLUMN document_name TEXT CHECK (document_name IS NULL OR char_length(document_name) <= 200);

COMMENT ON COLUMN payments.document_name IS
  'Name printed on the tax document when it is not the client''s name (imported payments: the payer as the sheet has it).';

CREATE OR REPLACE FUNCTION public.import_finance_rows(
  p_file_name         TEXT,
  p_sheet_name        TEXT,
  p_file_fingerprint  TEXT,
  p_mapping           JSONB,
  p_rows              JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant_id    UUID;
  v_currency     TEXT;
  v_today        DATE;
  v_batch_id     UUID;
  v_row          JSONB;
  v_idx          INT := 0;
  v_kind         TEXT;
  v_date         DATE;
  v_amount       BIGINT;
  v_name         TEXT;
  v_email        TEXT;
  v_fp           TEXT;
  v_extra        JSONB;
  v_desc         TEXT;
  v_category_id  UUID;
  v_cat_name     TEXT;
  v_match_id     UUID;
  v_book         TEXT;
  v_number       TEXT;
  v_income       INT := 0;
  v_expense      INT := 0;
  v_matched      INT := 0;
  v_skipped      INT := 0;
  v_new_cats     INT := 0;
  v_sort         INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = v_uid AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be an array';
  END IF;
  IF jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'no rows to import';
  END IF;
  IF jsonb_array_length(p_rows) > 10000 THEN
    RAISE EXCEPTION 'at most 10000 rows per import';
  END IF;

  SELECT t.currency INTO v_currency FROM tenants t WHERE t.id = v_tenant_id;
  v_today := (now() AT TIME ZONE 'Asia/Jerusalem')::date;

  INSERT INTO finance_import_batches (tenant_id, file_name, sheet_name, file_fingerprint, mapping, created_by)
  VALUES (
    v_tenant_id,
    left(coalesce(nullif(trim(p_file_name), ''), 'spreadsheet'), 255),
    left(nullif(trim(p_sheet_name), ''), 255),
    left(nullif(trim(p_file_fingerprint), ''), 128),
    coalesce(p_mapping, '{}'::jsonb),
    v_uid
  )
  RETURNING id INTO v_batch_id;

  SELECT coalesce(max(sort_order), 0) INTO v_sort FROM expense_categories WHERE tenant_id = v_tenant_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_idx := v_idx + 1;
    v_kind := v_row->>'kind';
    IF v_kind IS NULL OR v_kind NOT IN ('income', 'expense', 'receipt') THEN
      RAISE EXCEPTION 'row %: kind must be income, expense or receipt', v_idx;
    END IF;

    BEGIN
      v_date := (v_row->>'date')::date;
      v_amount := (v_row->>'amount_minor')::bigint;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'row %: invalid date or amount', v_idx;
    END;
    IF v_date IS NULL OR v_amount IS NULL THEN
      RAISE EXCEPTION 'row %: date and amount are required', v_idx;
    END IF;
    IF v_date > v_today THEN
      RAISE EXCEPTION 'row %: date is in the future', v_idx;
    END IF;

    v_fp := left(nullif(trim(v_row->>'fingerprint'), ''), 128);
    IF v_fp IS NULL THEN
      RAISE EXCEPTION 'row %: fingerprint is required', v_idx;
    END IF;

    v_name  := left(nullif(trim(v_row->>'name'), ''), 200);
    -- Payer email (income / receipt): kept only when it looks like an address.
    v_email := lower(left(nullif(trim(v_row->>'email'), ''), 320));
    IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      v_email := NULL;
    END IF;
    v_desc  := nullif(trim(v_row->>'description'), '');
    v_book  := left(nullif(trim(v_row->>'receipt_book'), ''), 50);
    v_number := left(nullif(trim(v_row->>'receipt_number'), ''), 50);
    v_extra := CASE WHEN jsonb_typeof(v_row->'extra') = 'array' THEN v_row->'extra' ELSE '[]'::jsonb END;

    IF v_kind = 'expense' THEN
      IF v_amount <= 0 OR v_amount > 2147483647 THEN
        RAISE EXCEPTION 'row %: expense amount must be positive', v_idx;
      END IF;

      -- Already imported (and not undone)? Skip.
      IF EXISTS (
        SELECT 1 FROM expenses e
        JOIN finance_import_batches b ON b.id = e.import_batch_id
        WHERE e.tenant_id = v_tenant_id AND e.import_fingerprint = v_fp AND b.undone_at IS NULL
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_category_id := NULL;
      IF nullif(v_row->>'category_id', '') IS NOT NULL THEN
        SELECT id INTO v_category_id FROM expense_categories
        WHERE id = (v_row->>'category_id')::uuid AND tenant_id = v_tenant_id AND is_active;
        IF v_category_id IS NULL THEN
          RAISE EXCEPTION 'row %: invalid or inactive expense category', v_idx;
        END IF;
      ELSE
        v_cat_name := left(nullif(trim(v_row->>'category_name'), ''), 100);
        IF v_cat_name IS NULL THEN
          RAISE EXCEPTION 'row %: expense category is required', v_idx;
        END IF;
        SELECT id INTO v_category_id FROM expense_categories
        WHERE tenant_id = v_tenant_id AND lower(name) = lower(v_cat_name)
        ORDER BY is_active DESC, sort_order LIMIT 1;
        IF v_category_id IS NOT NULL THEN
          -- A hidden category with this name: show it again rather than add a twin.
          UPDATE expense_categories SET is_active = true, updated_at = now()
          WHERE id = v_category_id AND NOT is_active;
        ELSE
          v_sort := v_sort + 1;
          INSERT INTO expense_categories (tenant_id, name, sort_order)
          VALUES (v_tenant_id, v_cat_name, v_sort)
          RETURNING id INTO v_category_id;
          v_new_cats := v_new_cats + 1;
        END IF;
      END IF;

      INSERT INTO expenses (
        id, tenant_id, category_id, description,
        pretax_amount_minor, vat_amount_minor, total_amount_minor, currency,
        supplier_name, expense_date, created_by,
        import_batch_id, import_extra, import_fingerprint
      ) VALUES (
        gen_random_uuid(), v_tenant_id, v_category_id,
        left(coalesce(v_desc, v_name, 'Imported expense'), 500),
        v_amount, 0, v_amount, v_currency,
        v_name, v_date, v_uid,
        v_batch_id,
        v_extra
          || CASE WHEN nullif(trim(v_row->>'payment_method'), '') IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object('label', 'payment_method', 'value', trim(v_row->>'payment_method')))
               ELSE '[]'::jsonb END
          || CASE WHEN nullif(trim(v_row->>'job_name'), '') IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object('label', 'job_name', 'value', trim(v_row->>'job_name')))
               ELSE '[]'::jsonb END
          || CASE WHEN nullif(v_row->>'original_amount_minor', '') IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object(
                 'label', 'original_amount',
                 'value', concat_ws(' ', v_row->>'original_amount_minor', v_row->>'original_currency', v_row->>'exchange_rate')))
               ELSE '[]'::jsonb END,
        v_fp
      );
      v_expense := v_expense + 1;
      CONTINUE;
    END IF;

    -- income / receipt
    IF v_amount = 0 THEN
      RAISE EXCEPTION 'row %: amount cannot be zero', v_idx;
    END IF;

    IF EXISTS (SELECT 1 FROM imported_income WHERE tenant_id = v_tenant_id AND fingerprint = v_fp) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_kind = 'receipt' THEN
      -- Same receipt already on file? Skip.
      IF v_number IS NOT NULL AND EXISTS (
        SELECT 1 FROM imported_income
        WHERE tenant_id = v_tenant_id AND receipt_number = v_number
          AND receipt_book IS NOT DISTINCT FROM v_book
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_match_id := NULL;
      SELECT id INTO v_match_id FROM imported_income
      WHERE tenant_id = v_tenant_id AND income_date = v_date AND amount_minor = v_amount
        AND receipt_number IS NULL AND receipt_book IS NULL
        AND v_name IS NOT NULL AND lower(trim(payer_name)) = lower(v_name)
      ORDER BY created_at, id LIMIT 1;

      IF v_match_id IS NULL THEN
        -- No name match: take the only income row with this date and amount.
        SELECT min(id::text)::uuid INTO v_match_id FROM imported_income
        WHERE tenant_id = v_tenant_id AND income_date = v_date AND amount_minor = v_amount
          AND receipt_number IS NULL AND receipt_book IS NULL
        HAVING count(*) = 1;
      END IF;

      IF v_match_id IS NOT NULL THEN
        UPDATE imported_income
        SET receipt_book = v_book,
            receipt_number = v_number,
            receipt_batch_id = v_batch_id,
            receipt_extra = v_extra
              || CASE WHEN v_desc IS NOT NULL
                   THEN jsonb_build_array(jsonb_build_object('label', 'description', 'value', v_desc))
                   ELSE '[]'::jsonb END,
            payer_name = coalesce(payer_name, v_name),
            payer_email = coalesce(payer_email, v_email)
        WHERE id = v_match_id;
        v_matched := v_matched + 1;
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO imported_income (
      tenant_id, batch_id, income_date, amount_minor,
      original_amount_minor, original_currency, exchange_rate,
      payer_name, payer_email, payment_method, job_name, description,
      receipt_book, receipt_number, receipt_batch_id, extra, fingerprint
    ) VALUES (
      v_tenant_id, v_batch_id, v_date, v_amount,
      nullif(v_row->>'original_amount_minor', '')::bigint,
      nullif(upper(trim(v_row->>'original_currency')), ''),
      nullif(v_row->>'exchange_rate', '')::numeric,
      v_name,
      v_email,
      left(nullif(trim(v_row->>'payment_method'), ''), 100),
      left(nullif(trim(v_row->>'job_name'), ''), 200),
      left(v_desc, 1000),
      v_book, v_number,
      CASE WHEN v_kind = 'receipt' THEN v_batch_id END,
      v_extra, v_fp
    );
    v_income := v_income + 1;
  END LOOP;

  UPDATE finance_import_batches
  SET income_count = v_income, expense_count = v_expense,
      receipts_matched_count = v_matched, skipped_count = v_skipped
  WHERE id = v_batch_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  VALUES (v_tenant_id, v_uid, 'CREATE', 'finance_import_batches', v_batch_id);

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'income', v_income,
    'expenses', v_expense,
    'receipts_matched', v_matched,
    'skipped', v_skipped,
    'new_categories', v_new_cats
  );
END;
$$;
REVOKE ALL ON FUNCTION public.import_finance_rows(TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_finance_rows(TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_finance_import(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_tenant_id   UUID;
  v_income      INT;
  v_expenses    INT;
  v_receipts    INT;
  v_kept        INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = v_uid AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  PERFORM 1 FROM finance_import_batches
  WHERE id = p_batch_id AND tenant_id = v_tenant_id AND undone_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'import not found or already undone';
  END IF;

  -- Corrections need an active category: switch back on any the studio has since hidden.
  UPDATE expense_categories c SET is_active = true, updated_at = now()
  WHERE c.tenant_id = v_tenant_id AND NOT c.is_active
    AND c.id IN (SELECT e.category_id FROM expenses e WHERE e.import_batch_id = p_batch_id);

  INSERT INTO expenses (
    id, tenant_id, category_id, description,
    pretax_amount_minor, vat_amount_minor, total_amount_minor, currency,
    supplier_name, expense_date, corrects_expense_id, created_by, import_batch_id
  )
  SELECT gen_random_uuid(), e.tenant_id, e.category_id,
         left('[Correction] ' || e.description, 500),
         -e.pretax_amount_minor, 0, -e.total_amount_minor, e.currency,
         e.supplier_name, e.expense_date, e.id, v_uid, p_batch_id
  FROM expenses e
  WHERE e.import_batch_id = p_batch_id AND e.tenant_id = v_tenant_id
    AND e.corrects_expense_id IS NULL;
  GET DIAGNOSTICS v_expenses = ROW_COUNT;

  UPDATE imported_income
  SET receipt_book = NULL, receipt_number = NULL, receipt_batch_id = NULL, receipt_extra = '[]'::jsonb
  WHERE tenant_id = v_tenant_id AND receipt_batch_id = p_batch_id AND batch_id <> p_batch_id
    AND payment_id IS NULL;
  GET DIAGNOSTICS v_receipts = ROW_COUNT;

  -- A row that already became a payment with a receipt stays: that payment is real money
  -- with a tax document, so undo never takes it away.
  DELETE FROM imported_income WHERE tenant_id = v_tenant_id AND batch_id = p_batch_id AND payment_id IS NULL;
  GET DIAGNOSTICS v_income = ROW_COUNT;
  SELECT count(*) INTO v_kept FROM imported_income WHERE tenant_id = v_tenant_id AND batch_id = p_batch_id;

  UPDATE finance_import_batches SET undone_at = now(), undone_by = v_uid WHERE id = p_batch_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  VALUES (v_tenant_id, v_uid, 'DELETE', 'finance_import_batches', p_batch_id);

  RETURN jsonb_build_object('income', v_income, 'expense_corrections', v_expenses, 'receipts_detached', v_receipts, 'kept_as_payments', v_kept);
END;
$$;
REVOKE ALL ON FUNCTION public.undo_finance_import(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_finance_import(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  net_revenue_minor        BIGINT,
  payment_count            BIGINT,
  outstanding_engagements  BIGINT,
  failed_payments_7d       BIGINT,
  net_expenses_minor       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_season_id UUID;
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

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  SELECT id INTO v_season_id
  FROM seasons
  WHERE tenant_id = v_tenant_id AND status = 'active'
  LIMIT 1;

  RETURN QUERY
  SELECT
    (COALESCE((
      SELECT SUM(total_amount_minor)
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status IN ('succeeded', 'partially_refunded')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0) + COALESCE((
      SELECT SUM(amount_minor)
      FROM imported_income
      WHERE tenant_id = v_tenant_id
        -- Once a receipt is sent the row is a payment, counted above.
        AND payment_id IS NULL
        AND income_date BETWEEN p_start_date AND p_end_date
    ), 0))::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'succeeded'
        AND charge_type IN ('initial', 'renewal')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM engagements
      WHERE tenant_id = v_tenant_id
        AND status = 'pending_payment'
        AND season_id IS NOT DISTINCT FROM v_season_id
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'failed'
        AND created_at >= (now() - interval '7 days')
    ), 0)::bigint,
    COALESCE((
      SELECT SUM(total_amount_minor)
      FROM expenses
      WHERE tenant_id = v_tenant_id
        AND expense_date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint;
END;
$$;
REVOKE ALL ON FUNCTION public.get_finance_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_summary(DATE, DATE) TO authenticated;
