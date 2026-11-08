-- Spreadsheet import: import_finance_rows, undo_finance_import, get_finance_summary.
CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS other_studio,
  gen_random_uuid() AS admin, gen_random_uuid() AS other_admin, gen_random_uuid() AS parent,
  gen_random_uuid() AS rent;
GRANT SELECT ON ids TO authenticated;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT studio, 'Lens studio', 'fi-' || substr(md5(random()::text), 1, 8), 'l@example.test' FROM ids
UNION ALL
SELECT other_studio, 'Other studio', 'fi-o-' || substr(md5(random()::text), 1, 8), 'o@example.test' FROM ids;

INSERT INTO auth.users (id, email)
SELECT admin, 'fi-admin@example.test' FROM ids
UNION ALL SELECT other_admin, 'fi-other@example.test' FROM ids
UNION ALL SELECT parent, 'fi-parent@example.test' FROM ids;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT admin, studio, ARRAY['tenant_admin'], 'fi-admin@example.test' FROM ids
UNION ALL SELECT other_admin, other_studio, ARRAY['tenant_admin'], 'fi-other@example.test' FROM ids
UNION ALL SELECT parent, studio, ARRAY['parent'], 'fi-parent@example.test' FROM ids
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

INSERT INTO expense_categories (id, tenant_id, name) SELECT rent, studio, 'Rent' FROM ids
ON CONFLICT DO NOTHING;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

CREATE FUNCTION pg_temp.error_of(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

DO $$
DECLARE
  v ids%ROWTYPE;
  v_res jsonb;
  v_res2 jsonb;
  v_entries jsonb;
  v_receipts jsonb;
  v_err text;
  v_sum record;
  v_count int;
  v_batch uuid;
BEGIN
  SELECT * INTO v FROM ids;
  PERFORM pg_temp.act_as(v.admin);

  v_entries := jsonb_build_array(
    jsonb_build_object('kind', 'income', 'date', '2025-03-04', 'amount_minor', 120000, 'name', 'Client A',
      'payment_method', 'Bit', 'job_name', 'Wedding', 'fingerprint', 'e1',
      'extra', jsonb_build_array(jsonb_build_object('label', 'Hashkafa', 'value', 'x'))),
    jsonb_build_object('kind', 'income', 'date', '2025-03-05', 'amount_minor', 36500,
      'original_amount_minor', 10000, 'original_currency', 'usd', 'exchange_rate', '3.65',
      'name', 'Client B', 'fingerprint', 'e2'),
    jsonb_build_object('kind', 'expense', 'date', '2025-03-06', 'amount_minor', 50000, 'name', 'Landlord',
      'category_id', v.rent, 'description', 'March rent', 'fingerprint', 'e3'),
    jsonb_build_object('kind', 'expense', 'date', '2025-03-07', 'amount_minor', 7000, 'name', 'Print shop',
      'category_name', 'Albums', 'fingerprint', 'e4'),
    jsonb_build_object('kind', 'expense', 'date', '2025-03-08', 'amount_minor', 3000,
      'category_name', 'albums', 'fingerprint', 'e5')
  );

  -- 1. Only studio admins can import.
  PERFORM pg_temp.act_as(v.parent);
  v_err := pg_temp.error_of(format('SELECT import_finance_rows(%L, NULL, NULL, NULL, %L::jsonb)', 'a.xlsx', v_entries));
  IF v_err IS DISTINCT FROM 'Forbidden' THEN RAISE EXCEPTION 'FAIL parent import: %', v_err; END IF;
  PERFORM pg_temp.act_as(v.admin);
  RAISE NOTICE 'ok  only studio admins can import';

  -- 2. Entries import: income history, expenses, one new category used twice.
  v_res := import_finance_rows('book.xlsx', 'Entries', 'fp1', '{"date":"Date"}', v_entries);
  IF (v_res->>'income')::int <> 2 OR (v_res->>'expenses')::int <> 3 OR (v_res->>'new_categories')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL entries counts: %', v_res;
  END IF;
  IF (SELECT count(*) FROM expense_categories WHERE tenant_id = v.studio AND lower(name) = 'albums') <> 1 THEN
    RAISE EXCEPTION 'FAIL new category added twice';
  END IF;
  IF (SELECT original_currency FROM imported_income WHERE fingerprint = 'e2') <> 'USD' THEN
    RAISE EXCEPTION 'FAIL original currency not kept';
  END IF;
  IF (SELECT description FROM expenses WHERE import_fingerprint = 'e4') <> 'Print shop' THEN
    RAISE EXCEPTION 'FAIL expense description falls back to the supplier';
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE tenant_id = v.studio) THEN
    RAISE EXCEPTION 'FAIL import created payments';
  END IF;
  RAISE NOTICE 'ok  entries import income history, expenses and new categories';

  -- 3. The Finance page totals include imported income and expenses.
  SELECT * INTO v_sum FROM get_finance_summary('2025-01-01', '2025-12-31');
  IF v_sum.net_revenue_minor <> 156500 OR v_sum.net_expenses_minor <> 60000 THEN
    RAISE EXCEPTION 'FAIL summary: revenue %, expenses %', v_sum.net_revenue_minor, v_sum.net_expenses_minor;
  END IF;
  RAISE NOTICE 'ok  finance summary counts imported income and expenses';

  -- 4. Re-importing the same sheet adds nothing.
  v_res2 := import_finance_rows('book.xlsx', 'Entries', 'fp1', '{}', v_entries);
  IF (v_res2->>'skipped')::int <> 5 OR (v_res2->>'income')::int <> 0 OR (v_res2->>'expenses')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL re-import: %', v_res2;
  END IF;
  RAISE NOTICE 'ok  re-importing the same rows is skipped';

  -- 5. Receipts attach to their income row (by name, then by the only candidate); others become income.
  v_receipts := jsonb_build_array(
    jsonb_build_object('kind', 'receipt', 'date', '2025-03-04', 'amount_minor', 120000, 'name', 'client a',
      'receipt_book', '2', 'receipt_number', '1001', 'fingerprint', 'r1'),
    jsonb_build_object('kind', 'receipt', 'date', '2025-03-05', 'amount_minor', 36500, 'name', 'Someone else',
      'receipt_book', '2', 'receipt_number', '1002', 'fingerprint', 'r2'),
    jsonb_build_object('kind', 'receipt', 'date', '2025-04-01', 'amount_minor', 9900, 'name', 'Client C',
      'receipt_book', '2', 'receipt_number', '1003', 'fingerprint', 'r3')
  );
  v_res := import_finance_rows('book.xlsx', 'Receipts', 'fp2', '{}', v_receipts);
  IF (v_res->>'receipts_matched')::int <> 2 OR (v_res->>'income')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL receipts: %', v_res;
  END IF;
  IF (SELECT receipt_number FROM imported_income WHERE fingerprint = 'e1') <> '1001' THEN
    RAISE EXCEPTION 'FAIL receipt not attached by name';
  END IF;
  SELECT * INTO v_sum FROM get_finance_summary('2025-01-01', '2025-12-31');
  IF v_sum.net_revenue_minor <> 166400 THEN
    RAISE EXCEPTION 'FAIL receipts counted twice: %', v_sum.net_revenue_minor;
  END IF;
  v_res2 := import_finance_rows('book.xlsx', 'Receipts', 'fp2', '{}', v_receipts);
  IF (v_res2->>'skipped')::int <> 3 THEN RAISE EXCEPTION 'FAIL receipts re-import: %', v_res2; END IF;
  RAISE NOTICE 'ok  receipts attach to income, unmatched ones become income, re-import skipped';

  -- 6. Bad rows stop the whole import.
  v_err := pg_temp.error_of($q$SELECT import_finance_rows('x.csv', NULL, NULL, NULL,
    '[{"kind":"expense","date":"2999-01-01","amount_minor":100,"category_name":"X","fingerprint":"z"}]')$q$);
  IF v_err NOT LIKE 'row 1: date is in the future' THEN RAISE EXCEPTION 'FAIL future date: %', v_err; END IF;
  v_err := pg_temp.error_of($q$SELECT import_finance_rows('x.csv', NULL, NULL, NULL,
    '[{"kind":"transfer","date":"2025-01-01","amount_minor":100,"fingerprint":"z"}]')$q$);
  IF v_err NOT LIKE 'row 1: kind%' THEN RAISE EXCEPTION 'FAIL bad kind: %', v_err; END IF;
  RAISE NOTICE 'ok  invalid rows are refused';

  -- 7. Other studios see none of it.
  v_batch := (SELECT id FROM finance_import_batches WHERE tenant_id = v.studio AND sheet_name = 'Receipts' ORDER BY created_at LIMIT 1);
  PERFORM pg_temp.act_as(v.other_admin);
  v_err := pg_temp.error_of(format('SELECT undo_finance_import(%L)', v_batch));
  IF v_err NOT LIKE '%not found%' THEN RAISE EXCEPTION 'FAIL other studio could undo: %', v_err; END IF;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM imported_income;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL other studio sees % imported income rows', v_count; END IF;
  SELECT count(*) INTO v_count FROM finance_import_batches;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL other studio sees batches'; END IF;
  RESET ROLE;
  PERFORM pg_temp.act_as(v.admin);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM imported_income;
  RESET ROLE;
  IF v_count <> 3 THEN RAISE EXCEPTION 'FAIL admin sees % imported income rows', v_count; END IF;
  RAISE NOTICE 'ok  imports are private to the studio';

  -- 8. Undo the receipts import: receipts detach, its own income row goes.
  PERFORM undo_finance_import((SELECT id FROM finance_import_batches WHERE tenant_id = v.studio AND sheet_name = 'Receipts' ORDER BY created_at LIMIT 1));
  IF EXISTS (SELECT 1 FROM imported_income WHERE tenant_id = v.studio AND receipt_number IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL receipts still attached after undo';
  END IF;
  IF (SELECT count(*) FROM imported_income WHERE tenant_id = v.studio) <> 2 THEN
    RAISE EXCEPTION 'FAIL receipt income row not removed';
  END IF;

  -- 9. Undo the entries import: income removed, expenses corrected to zero.
  PERFORM undo_finance_import((SELECT id FROM finance_import_batches WHERE tenant_id = v.studio AND sheet_name = 'Entries' AND income_count > 0));
  SELECT * INTO v_sum FROM get_finance_summary('2025-01-01', '2025-12-31');
  IF v_sum.net_revenue_minor <> 0 OR v_sum.net_expenses_minor <> 0 THEN
    RAISE EXCEPTION 'FAIL after undo: revenue %, expenses %', v_sum.net_revenue_minor, v_sum.net_expenses_minor;
  END IF;
  IF (SELECT count(*) FROM expenses WHERE tenant_id = v.studio AND corrects_expense_id IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'FAIL expected 3 correction rows';
  END IF;
  v_err := pg_temp.error_of(format('SELECT undo_finance_import(%L)',
    (SELECT id FROM finance_import_batches WHERE tenant_id = v.studio AND sheet_name = 'Entries' AND income_count > 0)));
  IF v_err NOT LIKE '%already undone%' THEN RAISE EXCEPTION 'FAIL double undo: %', v_err; END IF;

  -- After undo the same sheet can be imported again.
  v_res := import_finance_rows('book.xlsx', 'Entries', 'fp1', '{}', v_entries);
  IF (v_res->>'income')::int <> 2 OR (v_res->>'expenses')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL import after undo: %', v_res;
  END IF;
  RAISE NOTICE 'ok  undo removes income, corrects expenses, and allows a fresh import';
END;
$$;
