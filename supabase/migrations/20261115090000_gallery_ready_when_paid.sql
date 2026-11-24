-- =============================================================================
-- Gallery ready email for clients who paid in full (owner, 15 Nov 2026: fewest steps).
--
-- The gallery-ready email and the review request counted from
-- job_details.gallery_released_at, which only "Release anyway" sets (for a
-- client who still owes money). A client who had paid everything could see the
-- gallery but got no email. job_details.gallery_shared_at now records when the
-- client can first see it (link set, and released or all paid); it is set
-- hourly by advance_job_statuses() (run-shoot-emails calls it before sending),
-- and both emails count from the release or, failing that, from it. An email
-- only goes while the gallery is still visible.
-- DEPENDENCIES: 20261111075500_review_request_email.sql, 20261113090000_job_status_moves_on.sql
-- =============================================================================

ALTER TABLE job_details ADD COLUMN IF NOT EXISTS gallery_shared_at TIMESTAMPTZ;

COMMENT ON COLUMN job_details.gallery_shared_at IS
  'When the client could first see the gallery (link set, and released or all paid). Set by advance_job_statuses(); the gallery-ready email and review request count from it when there is no manual release.';

-- Galleries already visible: mark them from the release or the last change, so
-- only recent ones still get their email (each email still goes at most once).
UPDATE job_details jd
SET gallery_shared_at = COALESCE(jd.gallery_released_at, jd.updated_at)
WHERE jd.gallery_shared_at IS NULL
  AND NULLIF(trim(jd.gallery_url), '') IS NOT NULL
  AND (jd.gallery_released_at IS NOT NULL OR job_payment_requests_all_paid(jd.engagement_id));

CREATE OR REPLACE FUNCTION advance_job_statuses(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := (p_now AT TIME ZONE 'Asia/Jerusalem')::date;
  v_delivered INT;
  v_shot INT;
  v_shared INT;
BEGIN
  -- The moment the client can first see the gallery (link set, and released or
  -- everything paid): the gallery-ready email and review request count from it.
  UPDATE job_details jd
  SET gallery_shared_at = p_now
  FROM engagements e
  WHERE e.id = jd.engagement_id
    AND e.status <> 'cancelled'
    AND jd.gallery_shared_at IS NULL
    AND NULLIF(trim(jd.gallery_url), '') IS NOT NULL
    AND (jd.gallery_released_at IS NOT NULL OR job_payment_requests_all_paid(jd.engagement_id));
  GET DIAGNOSTICS v_shared = ROW_COUNT;

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

  RETURN jsonb_build_object('delivered', v_delivered, 'shot', v_shot, 'gallery_shared', v_shared);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_job_statuses(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_job_statuses(TIMESTAMPTZ) TO service_role;

-- Same signature as before (grants are kept); the gallery emails also count from
-- gallery_shared_at, and only while the client can see the gallery.
CREATE OR REPLACE FUNCTION list_due_shoot_emails(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
  email_key TEXT, tenant_id UUID, engagement_id UUID, recipient_email TEXT, recipient_name TEXT,
  shoot_starts_at TIMESTAMPTZ, location TEXT, gallery_url TEXT, offering_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_today DATE := (p_now AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  RETURN QUERY
  WITH shoots AS (
    SELECT e.id AS engagement_id, e.tenant_id, e.booked_starts_at,
           (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date AS shoot_day,
           jd.job_status, jd.gallery_url,
           COALESCE(jd.gallery_released_at, jd.gallery_shared_at) AS gallery_released_at,
           (jd.gallery_released_at IS NOT NULL OR job_payment_requests_all_paid(jd.engagement_id)) AS gallery_visible,
           COALESCE(jd.location, o.location) AS location, o.name AS offering_name,
           COALESCE(p.email, pp.email) AS email, COALESCE(p.name, pp.name) AS name
    FROM job_details jd
    JOIN engagements e ON e.id = jd.engagement_id
    JOIN people p      ON p.id = e.person_id
    LEFT JOIN accounts a ON a.id = p.account_id
    LEFT JOIN people pp  ON pp.id = a.person_id
    LEFT JOIN offerings o ON o.id = e.offering_id
    WHERE jd.job_status <> 'cancelled' AND e.status <> 'cancelled'
  ), due AS (
    SELECT 'shoot_reminder'::text AS k, s.* FROM shoots s
    WHERE s.job_status = 'booked' AND s.shoot_day BETWEEN v_today + 1 AND v_today + 2
    UNION ALL
    SELECT 'shoot_thank_you', s.* FROM shoots s
    WHERE s.job_status IN ('booked', 'shot', 'editing', 'delivered')
      AND s.shoot_day BETWEEN v_today - 3 AND v_today - 1
    UNION ALL
    SELECT 'gallery_ready', s.* FROM shoots s
    WHERE s.gallery_released_at IS NOT NULL AND s.gallery_url IS NOT NULL AND s.gallery_visible
      AND s.gallery_released_at BETWEEN p_now - interval '7 days' AND p_now
    UNION ALL
    -- Review request: 5 days after the gallery is shared (window to 12 days
    -- tolerates missed runs), only when the studio has added a review link.
    SELECT 'review_request', s.* FROM shoots s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.gallery_released_at IS NOT NULL AND s.gallery_visible
      AND NULLIF(trim(t.review_url), '') IS NOT NULL
      AND s.gallery_released_at BETWEEN p_now - interval '12 days' AND p_now - interval '5 days'
  )
  SELECT d.k, d.tenant_id, d.engagement_id, d.email, d.name, d.booked_starts_at,
         d.location, d.gallery_url, d.offering_name
  FROM due d
  WHERE d.email IS NOT NULL
    AND is_automatic_email_enabled(d.tenant_id, d.k)
    AND NOT EXISTS (
      SELECT 1 FROM automatic_email_log l
      WHERE l.email_key = d.k AND l.engagement_id = d.engagement_id
        AND (l.status = 'sent' OR l.attempts >= 3))
  LIMIT 200;
END;
$$;
