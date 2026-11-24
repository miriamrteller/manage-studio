-- Studio shop catalogue: only the studio admin adds, changes or deletes items; sizes keep
-- their order and stock; no sizes means "One size"; pictures must be in the studio's folder.
-- Fixture: client-portal seed: studio …01 (admin …0e, client Alice …0a), studio …02 (Dina …0d).
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS studio,
  'b0000000-0000-4000-8000-00000000000e'::uuid AS admin,
  'b0000000-0000-4000-8000-00000000000a'::uuid AS alice_u,
  'b0000000-0000-4000-8000-00000000000d'::uuid AS dina_u;
GRANT SELECT ON ids TO PUBLIC;
CREATE TEMP TABLE saved (id UUID);
GRANT ALL ON saved TO PUBLIC;

CREATE FUNCTION pg_temp.as_user(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

-- 1. A parent cannot add items.
DO $$
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  PERFORM save_shop_product('{"name":"Leotard","price_minor":12000}');
  RAISE EXCEPTION 'FAIL parent added an item';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  parents cannot add items';
END $$;

-- 2. The admin adds an item with sizes and stock; the order of sizes is kept.
DO $$
DECLARE v_id UUID; v_labels TEXT; v_stock TEXT;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  v_id := save_shop_product(jsonb_build_object(
    'name', ' Black leotard ', 'price_minor', 12000,
    'image_path', (SELECT studio FROM ids)::text || '/00000000-0000-4000-8000-000000000001.jpg',
    'variants', jsonb_build_array(
      jsonb_build_object('label', 'Age 4-6', 'stock', 5),
      jsonb_build_object('label', 'Age 7-9', 'stock', 0),
      jsonb_build_object('label', 'Adult S'))));
  INSERT INTO saved VALUES (v_id);
  SELECT string_agg(label, ',' ORDER BY position), string_agg(COALESCE(stock::text, '-'), ',' ORDER BY position)
    INTO v_labels, v_stock FROM shop_product_variants WHERE product_id = v_id;
  IF v_labels <> 'Age 4-6,Age 7-9,Adult S' OR v_stock <> '5,0,-' THEN
    RAISE EXCEPTION 'FAIL sizes: % / %', v_labels, v_stock;
  END IF;
  IF (SELECT name FROM shop_products WHERE id = v_id) <> 'Black leotard'
     OR (SELECT currency FROM shop_products WHERE id = v_id) <> 'ILS' THEN
    RAISE EXCEPTION 'FAIL item row';
  END IF;
  RAISE NOTICE 'ok  admin adds an item with sizes in order, stock optional';
END $$;

-- 3. Editing keeps size ids, removes sizes left out, and can swap labels around.
DO $$
DECLARE v_id UUID := (SELECT id FROM saved); v_a UUID; v_b UUID; v_labels TEXT;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  SELECT id INTO v_a FROM shop_product_variants WHERE product_id = v_id AND label = 'Age 4-6';
  SELECT id INTO v_b FROM shop_product_variants WHERE product_id = v_id AND label = 'Age 7-9';
  PERFORM save_shop_product(jsonb_build_object('id', v_id, 'name', 'Black leotard', 'price_minor', 13000,
    'variants', jsonb_build_array(
      jsonb_build_object('id', v_b, 'label', 'Age 4-6', 'stock', 2),
      jsonb_build_object('id', v_a, 'label', 'Age 7-9', 'stock', 1))));
  SELECT string_agg(label || '=' || id::text, ',' ORDER BY position) INTO v_labels
    FROM shop_product_variants WHERE product_id = v_id;
  IF v_labels <> 'Age 4-6=' || v_b || ',Age 7-9=' || v_a THEN RAISE EXCEPTION 'FAIL edit: %', v_labels; END IF;
  IF (SELECT price_minor FROM shop_products WHERE id = v_id) <> 13000
     OR (SELECT image_path FROM shop_products WHERE id = v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL item not updated';
  END IF;
  RAISE NOTICE 'ok  editing keeps sizes by id, drops the rest';
END $$;

-- 4. No sizes = "One size"; duplicate sizes, bad pictures and missing prices are refused.
DO $$
DECLARE v_id UUID;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  v_id := save_shop_product('{"name":"Hair net","price_minor":1500}');
  IF (SELECT string_agg(label, ',') FROM shop_product_variants WHERE product_id = v_id) <> 'One size' THEN
    RAISE EXCEPTION 'FAIL one size';
  END IF;
  BEGIN
    PERFORM save_shop_product('{"name":"X","price_minor":100,"variants":[{"label":"S"},{"label":"S"}]}');
    RAISE EXCEPTION 'FAIL duplicate sizes';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%duplicate_size%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM save_shop_product(jsonb_build_object('name', 'X', 'price_minor', 100,
      'image_path', 'a0000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000001.jpg'));
    RAISE EXCEPTION 'FAIL another studio''s picture';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%bad_image%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM save_shop_product('{"name":"X","price_minor":0}');
    RAISE EXCEPTION 'FAIL no price';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%price_required%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  one size by default; duplicates, other folders and no price refused';
END $$;

-- 5. Another studio's admin cannot see or change the items; delete returns the picture.
DO $$
DECLARE v_id UUID := (SELECT id FROM saved); v_path TEXT;
BEGIN
  UPDATE user_profiles SET role = '{tenant_admin}' WHERE id = (SELECT dina_u FROM ids);
  PERFORM pg_temp.as_user((SELECT dina_u FROM ids));
  BEGIN
    PERFORM save_shop_product(jsonb_build_object('id', v_id, 'name', 'Mine', 'price_minor', 1));
    RAISE EXCEPTION 'FAIL other studio changed it';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%not_found%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM delete_shop_product(v_id);
    RAISE EXCEPTION 'FAIL other studio deleted it';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  PERFORM save_shop_product(jsonb_build_object('id', v_id, 'name', 'Black leotard', 'price_minor', 13000,
    'image_path', (SELECT studio FROM ids)::text || '/00000000-0000-4000-8000-000000000009.jpg'));
  v_path := delete_shop_product(v_id);
  IF v_path NOT LIKE '%000000000009.jpg' OR EXISTS (SELECT 1 FROM shop_product_variants WHERE product_id = v_id) THEN
    RAISE EXCEPTION 'FAIL delete: %', v_path;
  END IF;
  RAISE NOTICE 'ok  other studios cannot touch the items; delete returns the picture path';
END $$;
