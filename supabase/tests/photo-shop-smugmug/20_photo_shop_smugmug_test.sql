-- Photo shop SmugMug gallery check: only the service role (the smugmug-connection Edge
-- Function) saves it, it stays in the studio's own shoots, a passed check keeps the
-- photos it read, a failed one keeps none, and it is tied to the gallery it checked.
-- Fixture: client-portal seed: photo studio …01, admin …0e, shoot A …f…0a.
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS photo,
  'b0000000-0000-4000-8000-00000000000e'::uuid AS admin,
  'f0000000-0000-4000-8000-00000000000a'::uuid AS shoot_a;
GRANT SELECT ON ids TO PUBLIC;

CREATE FUNCTION pg_temp.as_service() RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
$$;
CREATE FUNCTION pg_temp.as_admin() RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false),
         set_config('request.jwt.claim.sub', (SELECT admin FROM ids)::text, false);
$$;

INSERT INTO tenant_photo_shop_settings (tenant_id, price_per_photo_minor, gallery_open_days) SELECT photo, 3000, 30 FROM ids;

-- 1. A studio admin cannot save a check themselves.
DO $$
BEGIN
  PERFORM pg_temp.as_admin();
  PERFORM save_job_photo_shop_smugmug_check((SELECT photo FROM ids), (SELECT shoot_a FROM ids), (SELECT admin FROM ids),
    'abc123', 'Cohen family', '{"passed":true,"items":[]}', '[{"key":"K1","fileName":"IMG_1.jpg","previewUrl":"https://x/K1-L.jpg"}]');
  RAISE EXCEPTION 'FAIL admin saved a check';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  only the service role saves a check';
END $$;

-- 2. Another studio's shoot is refused.
DO $$
BEGIN
  PERFORM pg_temp.as_service();
  PERFORM save_job_photo_shop_smugmug_check('a0000000-0000-4000-8000-0000000000ff', (SELECT shoot_a FROM ids), NULL,
    'abc123', 'x', '{"passed":true}', '[{"key":"K1"}]');
  RAISE EXCEPTION 'FAIL another studio''s shoot accepted';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%job not found%' THEN RAISE; END IF;
  RAISE NOTICE 'ok  another studio''s shoot is refused';
END $$;

-- 3. A passed check creates the shop from the prefill and keeps the photos.
DO $$
DECLARE s job_photo_shops%ROWTYPE;
BEGIN
  PERFORM pg_temp.as_service();
  PERFORM save_job_photo_shop_smugmug_check((SELECT photo FROM ids), (SELECT shoot_a FROM ids), (SELECT admin FROM ids),
    'abc123', 'Cohen family', '{"passed":true,"items":[{"code":"watermark","ok":true}]}',
    '[{"key":"K1","fileName":"IMG_1.jpg","previewUrl":"https://x/K1-L.jpg"}]');
  SELECT * INTO s FROM job_photo_shops WHERE engagement_id = (SELECT shoot_a FROM ids);
  IF s.provider <> 'smugmug' OR s.gallery_key <> 'abc123' OR s.gallery_name <> 'Cohen family'
     OR s.price_per_photo_minor <> 3000 OR s.smugmug_checked_at IS NULL
     OR jsonb_array_length(s.smugmug_photos) <> 1 OR (s.smugmug_check->>'album_key') <> 'abc123'
     OR (s.smugmug_check->>'passed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL passed check: %', to_jsonb(s);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'job_photo_shop.smugmug_checked' AND entity_id = s.engagement_id) THEN
    RAISE EXCEPTION 'FAIL no audit row';
  END IF;
  RAISE NOTICE 'ok  passed check saves the gallery, prices from the prefill, and its photos';
END $$;

-- 4. A failed check (or one with no photos) keeps nothing and clears the pass.
DO $$
DECLARE s job_photo_shops%ROWTYPE;
BEGIN
  PERFORM pg_temp.as_service();
  PERFORM save_job_photo_shop_smugmug_check((SELECT photo FROM ids), (SELECT shoot_a FROM ids), NULL,
    'def456', 'Other', '{"passed":false,"items":[{"code":"watermark","ok":false}]}',
    '[{"key":"K1","fileName":"IMG_1.jpg","previewUrl":"https://x/K1-L.jpg"}]');
  SELECT * INTO s FROM job_photo_shops WHERE engagement_id = (SELECT shoot_a FROM ids);
  IF s.gallery_key <> 'def456' OR s.smugmug_photos IS NOT NULL OR s.smugmug_checked_at IS NOT NULL
     OR (s.smugmug_check->>'passed')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL failed check: %', to_jsonb(s);
  END IF;
  PERFORM save_job_photo_shop_smugmug_check((SELECT photo FROM ids), (SELECT shoot_a FROM ids), NULL,
    'def456', 'Other', '{"passed":true}', '[]');
  SELECT * INTO s FROM job_photo_shops WHERE engagement_id = (SELECT shoot_a FROM ids);
  IF s.smugmug_checked_at IS NOT NULL OR (s.smugmug_check->>'passed')::boolean THEN
    RAISE EXCEPTION 'FAIL passed with no photos: %', to_jsonb(s);
  END IF;
  RAISE NOTICE 'ok  failed check keeps no photos';
END $$;

-- 5. Bad album keys are refused; the admin can still read the result.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_service();
  BEGIN
    PERFORM save_job_photo_shop_smugmug_check((SELECT photo FROM ids), (SELECT shoot_a FROM ids), NULL,
      '../x', 'x', '{"passed":true}', '[{"key":"K1"}]');
    RAISE EXCEPTION 'FAIL bad key accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%bad_album%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_admin();
  r := get_job_photo_shop((SELECT shoot_a FROM ids));
  IF r->>'provider' <> 'smugmug' OR r->'smugmug_check' IS NULL THEN RAISE EXCEPTION 'FAIL admin view: %', r; END IF;
  RAISE NOTICE 'ok  bad album keys refused; admin sees the result';
END $$;
