-- Photo shop uploads: the first upload saves and opens the shop, paths stay in the shoot's
-- own folder, only the studio admin adds or removes previews, and a bought photo stays.
-- Fixture: client-portal seed (see photo-shop test): photo studio …01, admin …0e,
-- Alice …0a (shoot A), Bob …0b (shoot B).
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS photo,
  'b0000000-0000-4000-8000-00000000000e'::uuid AS admin,
  'b0000000-0000-4000-8000-00000000000a'::uuid AS alice_u,
  'c0000000-0000-4000-8000-00000000000a'::uuid AS alice,
  'f0000000-0000-4000-8000-00000000000a'::uuid AS shoot_a,
  'f0000000-0000-4000-8000-00000000000b'::uuid AS shoot_b;
GRANT SELECT ON ids TO PUBLIC;

CREATE FUNCTION pg_temp.as_user(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

-- n photos for a shoot: paths in its own folder, camera-style file names.
CREATE FUNCTION pg_temp.photos(p_shoot UUID, p_from INT, p_to INT) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'path', (SELECT photo FROM ids)::text || '/' || p_shoot::text || '/' ||
            '00000000-0000-4000-8000-' || lpad(g::text, 12, '0') || '.jpg',
    'file_name', 'IMG_' || lpad(g::text, 4, '0') || '.jpg') ORDER BY g)
  FROM generate_series(p_from, p_to) g;
$$;

INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled) SELECT photo, 'billing:photo_shop', true FROM ids;
INSERT INTO tenant_photo_shop_settings (tenant_id, price_per_photo_minor, gallery_open_days) SELECT photo, 3000, 30 FROM ids;

-- 1. New shops start on uploads, with no gallery yet.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  r := get_job_photo_shop((SELECT shoot_a FROM ids));
  IF r->>'provider' <> 'upload' OR r->>'gallery_key' IS NOT NULL THEN RAISE EXCEPTION 'FAIL prefill: %', r; END IF;
  RAISE NOTICE 'ok  new shops start on uploads';
END $$;

-- 2. A client cannot add previews.
DO $$
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  PERFORM add_job_photo_shop_photos((SELECT shoot_a FROM ids), pg_temp.photos((SELECT shoot_a FROM ids), 1, 1));
  RAISE EXCEPTION 'FAIL client added a photo';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  client cannot add photos';
END $$;

-- 3. Paths must be in this shoot's own folder.
DO $$
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  PERFORM add_job_photo_shop_photos((SELECT shoot_a FROM ids), pg_temp.photos((SELECT shoot_b FROM ids), 1, 1));
  RAISE EXCEPTION 'FAIL accepted another shoot''s folder';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%bad_path%' THEN RAISE; END IF;
  RAISE NOTICE 'ok  another shoot''s folder is refused';
END $$;

-- 4. The first upload saves the shop (prefilled) and opens its gallery; repeats are ignored.
DO $$
DECLARE r JSONB; n INT;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  r := add_job_photo_shop_photos((SELECT shoot_a FROM ids), pg_temp.photos((SELECT shoot_a FROM ids), 1, 3));
  IF (r->>'added')::int <> 3 THEN RAISE EXCEPTION 'FAIL added: %', r; END IF;
  r := add_job_photo_shop_photos((SELECT shoot_a FROM ids), pg_temp.photos((SELECT shoot_a FROM ids), 3, 4));
  IF (r->>'added')::int <> 1 THEN RAISE EXCEPTION 'FAIL repeat not ignored: %', r; END IF;
  SELECT count(*) INTO n FROM job_photo_shop_photos WHERE engagement_id = (SELECT shoot_a FROM ids);
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL photo count %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM job_photo_shop_photos WHERE engagement_id = (SELECT shoot_a FROM ids)
                 AND file_name = 'IMG_0004.jpg' AND position = 4) THEN
    RAISE EXCEPTION 'FAIL file name or order not kept';
  END IF;
  r := get_job_photo_shop((SELECT shoot_a FROM ids));
  IF NOT (r->>'saved')::bool OR r->>'provider' <> 'upload' OR r->>'gallery_key' <> (SELECT shoot_a FROM ids)::text
     OR (r->>'price_per_photo_minor')::int <> 3000 THEN
    RAISE EXCEPTION 'FAIL shop not opened: %', r;
  END IF;
  RAISE NOTICE 'ok  first upload saves and opens the shop; file names and order kept';
END $$;

-- 5. The client's shop is open now.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  r := get_client_photo_shop((SELECT shoot_a FROM ids));
  IF NOT (r->>'has_shop')::bool OR NOT (r->>'open')::bool THEN RAISE EXCEPTION 'FAIL client shop: %', r; END IF;
  RAISE NOTICE 'ok  client sees an open shop';
END $$;

-- 6. A bought photo stays; others can be removed (admin only).
DO $$
DECLARE v_bought UUID; v_other UUID; v_path TEXT;
BEGIN
  SELECT id INTO v_bought FROM job_photo_shop_photos WHERE file_name = 'IMG_0001.jpg';
  SELECT id INTO v_other  FROM job_photo_shop_photos WHERE file_name = 'IMG_0002.jpg';
  PERFORM create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids),
    jsonb_build_array(jsonb_build_object('image_key', v_bought::text, 'file_name', 'IMG_0001.jpg')));

  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  BEGIN
    PERFORM delete_job_photo_shop_photo(v_other);
    RAISE EXCEPTION 'FAIL client removed a photo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  BEGIN
    PERFORM delete_job_photo_shop_photo(v_bought);
    RAISE EXCEPTION 'FAIL removed a bought photo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%already_bought%' THEN RAISE; END IF;
  END;
  v_path := delete_job_photo_shop_photo(v_other);
  IF v_path NOT LIKE '%-000000000002.jpg' OR EXISTS (SELECT 1 FROM job_photo_shop_photos WHERE id = v_other) THEN
    RAISE EXCEPTION 'FAIL remove: %', v_path;
  END IF;
  RAISE NOTICE 'ok  bought photo stays; admin removes others; clients cannot';
END $$;
