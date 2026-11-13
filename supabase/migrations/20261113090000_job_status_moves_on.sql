-- =============================================================================
-- Project status moves on by itself (owner, 13 Nov 2026: fewest interactions).
--
--   booked                  → shot       the day after the shoot day
--   booked / shot / editing → delivered  once the client can see the gallery
--                                        (link set and released or all paid),
--                                        or a photo order has been sent
--
-- Each automatic move happens once per project (job_details.auto_status), so
-- a status the studio sets back by hand is never overridden. Only forward,
-- never for cancelled projects. Called hourly by run-shoot-emails.
-- DEPENDENCIES: 20261030000100_job_details.sql, 20261030000200_job_payment_requests.sql,
--               job_photo_orders (photo shop)
-- =============================================================================

ALTER TABLE job_details ADD COLUMN IF NOT EXISTS auto_status TEXT
  CHECK (auto_status IS NULL OR auto_status IN ('shot', 'delivered'));

COMMENT ON COLUMN job_details.auto_status IS
  'The last status advance_job_statuses() set by itself. Each automatic move happens once, so a status changed back by hand stays.';

CREATE OR REPLACE FUNCTION advance_job_statuses(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := (p_now AT TIME ZONE 'Asia/Jerusalem')::date;
  v_delivered INT;
  v_shot INT;
BEGIN
  UPDATE job_details jd
  SET job_status = 'delivered', auto_status = 'delivered'
  FROM engagements e
  WHERE e.id = jd.engagement_id
    AND e.status <> 'cancelled'
    AND jd.job_status IN ('booked', 'shot', 'editing')
    AND jd.auto_status IS DISTINCT FROM 'delivered'
    AND (
      (NULLIF(trim(jd.gallery_url), '') IS NOT NULL
        AND (jd.gallery_released_at IS NOT NULL OR job_payment_requests_all_paid(jd.engagement_id)))
      OR EXISTS (SELECT 1 FROM job_photo_orders o
                 WHERE o.engagement_id = jd.engagement_id AND o.status = 'delivered')
    );
  GET DIAGNOSTICS v_delivered = ROW_COUNT;

  UPDATE job_details jd
  SET job_status = 'shot', auto_status = 'shot'
  FROM engagements e
  WHERE e.id = jd.engagement_id
    AND e.status <> 'cancelled'
    AND jd.job_status = 'booked'
    AND jd.auto_status IS NULL
    AND e.booked_starts_at IS NOT NULL
    AND (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date < v_today;
  GET DIAGNOSTICS v_shot = ROW_COUNT;

  RETURN jsonb_build_object('delivered', v_delivered, 'shot', v_shot);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_job_statuses(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_job_statuses(TIMESTAMPTZ) TO service_role;

-- ---------------------------------------------------------------------------
-- The chosen SmugMug gallery's own web address (Album.WebUri, "the album's page
-- on the SmugMug website": https://api.smugmug.com/api/v2/doc/reference/album.html),
-- saved by "Check gallery" so the project's gallery link can be filled in one
-- click instead of pasted. Written only by the smugmug-connection function.
-- ---------------------------------------------------------------------------
ALTER TABLE job_photo_shops ADD COLUMN IF NOT EXISTS gallery_web_url TEXT
  CHECK (gallery_web_url IS NULL OR (gallery_web_url ~* '^https://' AND length(gallery_web_url) <= 500));

COMMENT ON COLUMN job_photo_shops.gallery_web_url IS
  'The chosen SmugMug gallery''s page (Album.WebUri), from the last Check gallery. Offered as the project''s gallery link.';
