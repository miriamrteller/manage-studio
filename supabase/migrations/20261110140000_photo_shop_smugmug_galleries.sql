-- Photo shop: a shoot's photos can come from the photographer's own SmugMug gallery.
--
-- The studio picks a gallery on the shoot; the smugmug-connection Edge Function then runs
-- "Check gallery" (watermark on, largest size capped, downloads off, the Large size loads,
-- nothing bigger loads without signing in) and saves the result here with the list of
-- photos it read (file name + the watermarked Large link, never the original).
--
-- Clients still see nothing from SmugMug until the live check with a photographer's real
-- key has passed: the hard gate stays in supabase/functions/_shared/photo-shop/gallery.ts.

ALTER TABLE job_photo_shops
  ADD COLUMN smugmug_check      JSONB,
  ADD COLUMN smugmug_photos     JSONB,
  ADD COLUMN smugmug_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN job_photo_shops.smugmug_check IS
  'Last "Check gallery" result for the SmugMug gallery: {album_key, passed, items:[{code, ok, value}]}. Applies only while album_key = gallery_key.';
COMMENT ON COLUMN job_photo_shops.smugmug_photos IS
  'Photos read at the last passed check: [{key, fileName, previewUrl}] (watermarked Large size). NULL when the check did not pass.';
COMMENT ON COLUMN job_photo_shops.smugmug_checked_at IS
  'When the gallery last passed the check. NULL = not passed.';

-- ---------------------------------------------------------------------------
-- RPC (service): save the shoot's SmugMug gallery and its check. Called by the
-- smugmug-connection Edge Function after it read the gallery as the studio's
-- connected photographer. Creates the shop from the prefill if needed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_job_photo_shop_smugmug_check(
  p_tenant_id     UUID,
  p_engagement_id UUID,
  p_actor_id      UUID,
  p_album_key     TEXT,
  p_album_name    TEXT,
  p_check         JSONB,
  p_photos        JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_passed BOOLEAN;
  v_shop   JSONB;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'save_job_photo_shop_smugmug_check: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagements WHERE id = p_engagement_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'save_job_photo_shop_smugmug_check: job not found';
  END IF;
  IF p_album_key IS NULL OR p_album_key !~ '^[A-Za-z0-9]{1,64}$' THEN
    RAISE EXCEPTION 'save_job_photo_shop_smugmug_check: bad_album';
  END IF;
  IF p_check IS NULL OR jsonb_typeof(p_check) <> 'object' THEN
    RAISE EXCEPTION 'save_job_photo_shop_smugmug_check: bad_check';
  END IF;
  v_passed := COALESCE((p_check->>'passed')::BOOLEAN, false)
              AND p_photos IS NOT NULL AND jsonb_typeof(p_photos) = 'array' AND jsonb_array_length(p_photos) > 0;

  IF NOT EXISTS (SELECT 1 FROM job_photo_shops WHERE engagement_id = p_engagement_id) THEN
    v_shop := photo_shop_prefill(p_engagement_id);
    INSERT INTO job_photo_shops (
      engagement_id, tenant_id, provider, gallery_key, included_photos,
      price_per_photo_minor, all_photos_price_minor, currency, closes_at
    ) VALUES (
      p_engagement_id, p_tenant_id, 'smugmug', p_album_key,
      COALESCE((v_shop->>'included_photos')::INT, 0),
      (v_shop->>'price_per_photo_minor')::INT,
      (v_shop->>'all_photos_price_minor')::INT,
      v_shop->>'currency',
      (v_shop->>'closes_at')::TIMESTAMPTZ
    );
  END IF;

  UPDATE job_photo_shops SET
    provider           = 'smugmug',
    gallery_key        = p_album_key,
    gallery_name       = NULLIF(left(trim(COALESCE(p_album_name, '')), 200), ''),
    smugmug_check      = jsonb_build_object('album_key', p_album_key, 'passed', v_passed,
                                            'items', COALESCE(p_check->'items', '[]'::jsonb)),
    smugmug_photos     = CASE WHEN v_passed THEN p_photos END,
    smugmug_checked_at = CASE WHEN v_passed THEN now() END
  WHERE engagement_id = p_engagement_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (p_tenant_id, p_actor_id, 'job_photo_shop.smugmug_checked', 'engagement', p_engagement_id,
          jsonb_build_object('album_key', p_album_key, 'passed', v_passed,
                             'photos', CASE WHEN v_passed THEN jsonb_array_length(p_photos) ELSE 0 END));
END;
$$;
REVOKE ALL ON FUNCTION save_job_photo_shop_smugmug_check(UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_job_photo_shop_smugmug_check(UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB) TO service_role;
