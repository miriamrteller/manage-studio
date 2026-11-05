-- Expense categories: catalogue, per-skin sets, older defaults. Plain Postgres + the client-portal stub schema.
DO $$
DECLARE
  v_photo UUID;
  v_dance UUID;
  v_keys  TEXT[];
  v_want  TEXT[];
BEGIN
  -- 1. A studio created the way the set-up wizard does gets exactly its skin's set,
  --    even though provision_studio still inserts the older Hebrew list.
  v_photo := provision_studio('Lens', 'lens-test', 'essential', 'photographer', 'owner@lens.test');
  SELECT array_agg(catalog_key ORDER BY catalog_key) INTO v_keys FROM expense_categories WHERE tenant_id = v_photo;
  SELECT array_agg(k ORDER BY k) INTO v_want FROM unnest((SELECT expense_categories FROM verticals WHERE id = 'photographer')) k;
  IF v_keys IS DISTINCT FROM v_want THEN RAISE EXCEPTION 'FAIL photographer set: got %, want %', v_keys, v_want; END IF;
  IF EXISTS (SELECT 1 FROM expense_categories WHERE tenant_id = v_photo AND (catalog_key IS NULL OR NOT is_active)) THEN
    RAISE EXCEPTION 'FAIL an older default or an inactive row was added';
  END IF;
  IF (SELECT name FROM expense_categories WHERE tenant_id = v_photo AND catalog_key = 'printing') <> 'הדפסות ואלבומים' THEN
    RAISE EXCEPTION 'FAIL the stored name is not the Hebrew catalogue name';
  END IF;
  RAISE NOTICE 'ok  a new photographer studio gets its set and nothing else';

  v_dance := provision_studio('Plié', 'plie-test', 'professional', 'dance-studio', 'owner@plie.test');
  IF NOT EXISTS (SELECT 1 FROM expense_categories WHERE tenant_id = v_dance AND catalog_key = 'costumes')
     OR EXISTS (SELECT 1 FROM expense_categories WHERE tenant_id = v_dance AND catalog_key = 'printing') THEN
    RAISE EXCEPTION 'FAIL dance studio set';
  END IF;
  RAISE NOTICE 'ok  a new dance studio gets the dance set';

  -- 2. A data skin with no list of its own uses the generic set.
  INSERT INTO verticals (id, display_name, status) VALUES ('yoga-test', 'Yoga', 'live');
  INSERT INTO tenants (name, subdomain, skin, contact_email) VALUES ('Om', 'om-test', 'yoga-test', 'om@x.test');
  SELECT array_agg(ec.catalog_key ORDER BY ec.catalog_key) INTO v_keys
  FROM expense_categories ec JOIN tenants t ON t.id = ec.tenant_id WHERE t.subdomain = 'om-test';
  SELECT array_agg(k ORDER BY k) INTO v_want FROM unnest((SELECT expense_categories FROM verticals WHERE id = 'generic')) k;
  IF v_keys IS DISTINCT FROM v_want THEN RAISE EXCEPTION 'FAIL data skin should use the generic set: %', v_keys; END IF;
  RAISE NOTICE 'ok  a data skin uses the generic set';

  -- 3. Older names match the catalogue (used for existing studios).
  IF private.expense_catalog_key_for_name('שכירות סטודיו') <> 'rent'
     OR private.expense_catalog_key_for_name(' ציוד ') <> 'equipment'
     OR private.expense_catalog_key_for_name('Insurance') <> 'insurance'
     OR private.expense_catalog_key_for_name('My own thing') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL older names do not match the catalogue';
  END IF;
  RAISE NOTICE 'ok  older names match the catalogue';

  -- 4. After set-up, a studio can still add its own category with any name.
  PERFORM set_config('opalswift.expense_seeded_tenant', '', true);
  INSERT INTO expense_categories (tenant_id, name) VALUES (v_photo, 'שיווק');
  IF NOT EXISTS (SELECT 1 FROM expense_categories WHERE tenant_id = v_photo AND name = 'שיווק' AND catalog_key IS NULL) THEN
    RAISE EXCEPTION 'FAIL a studio''s own category was skipped';
  END IF;
  RAISE NOTICE 'ok  a studio adds its own categories as before';

  -- 5. Every catalogue key in a skin set exists, and studios can only read the catalogue.
  IF EXISTS (SELECT 1 FROM verticals v, unnest(v.expense_categories) k
             WHERE NOT EXISTS (SELECT 1 FROM expense_category_catalog c WHERE c.key = k)) THEN
    RAISE EXCEPTION 'FAIL a skin set names an unknown category';
  END IF;
  IF NOT has_table_privilege('authenticated', 'expense_category_catalog', 'SELECT')
     OR has_table_privilege('authenticated', 'expense_category_catalog', 'INSERT')
     OR has_table_privilege('anon', 'expense_category_catalog', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL catalogue grants';
  END IF;
  RAISE NOTICE 'ok  skin sets are valid and the catalogue is read-only';
END $$;
