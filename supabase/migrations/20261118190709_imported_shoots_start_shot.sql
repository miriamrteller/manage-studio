-- =============================================================================
-- Past shoots from the client import start as "Shot", not "Delivered"
-- (owner, 18 Nov 2026).
--
-- 20261117114500 added each imported past shoot as delivered. A photographer
-- imported clients whose shoots had happened but whose photos had not been sent
-- yet. "Delivered" was wrong for them, and it showed to the client too.
--   * client_import_add_shoots: new imported shoots are 'shot' (auto_status
--     'shot', so the hourly move to Shot is not repeated). advance_job_statuses
--     still moves them to Delivered once the gallery is shared or photos are
--     delivered, the same as any other shoot.
--   * list_due_shoot_emails: imported shoots were left out of every shoot
--     email. Now only the shoot reminder and the thank-you are skipped, because
--     the shoot happened before OpalSwift. The gallery-ready email and the
--     review request go out as usual when the studio shares the gallery.
-- Shoots already imported as delivered are corrected by the prod task
-- supabase/prod-tasks/20261118191000_imported_shoots_to_shot.sql.
-- Same signatures: grants are kept.
-- DEPENDENCIES: 20261117114500_client_import_past_shoots.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.client_import_add_shoots(
  p_tenant_id UUID,
  p_batch_id  UUID,
  p_person_id UUID,
  p_shoots    JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shoot       JSONB;
  v_offering_id UUID;
  v_date        DATE;
  v_starts      TIMESTAMPTZ;
  v_client      RECORD;
  v_eng_id      UUID;
  v_added       INT := 0;
BEGIN
  IF p_shoots IS NULL OR jsonb_typeof(p_shoots) <> 'array' OR jsonb_array_length(p_shoots) = 0 THEN
    RETURN 0;
  END IF;
  IF jsonb_array_length(p_shoots) > 50 THEN
    RAISE EXCEPTION 'at most 50 shoots per client';
  END IF;

  -- The client model a shoot needs (an account), as a new shoot makes it.
  SELECT * INTO v_client FROM job_resolve_client(p_tenant_id, p_person_id, NULL, NULL, NULL);

  FOR v_shoot IN SELECT value FROM jsonb_array_elements(p_shoots) LOOP
    CONTINUE WHEN jsonb_typeof(v_shoot) <> 'object'
              OR NULLIF(trim(coalesce(v_shoot->>'name', '')), '') IS NULL;
    v_offering_id := client_import_shoot_package(p_tenant_id, v_shoot->>'name');

    BEGIN
      v_date := NULLIF(v_shoot->>'date', '')::date;
    EXCEPTION WHEN others THEN
      v_date := NULL;
    END;
    -- Past shoots only: a date after today (or before 1900) is left out.
    IF v_date IS NOT NULL
       AND (v_date > (now() AT TIME ZONE 'Asia/Jerusalem')::date OR v_date < DATE '1900-01-01') THEN
      v_date := NULL;
    END IF;

    -- Never twice: a shoot on this package on the same day, or either undated.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM engagements e
      JOIN job_details jd ON jd.engagement_id = e.id
      WHERE e.tenant_id = p_tenant_id
        AND e.person_id = v_client.person_id
        AND e.offering_id = v_offering_id
        AND e.status <> 'cancelled'
        AND (v_date IS NULL OR e.booked_starts_at IS NULL
             OR (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date = v_date)
    );

    v_starts := CASE WHEN v_date IS NULL THEN NULL
                     ELSE (v_date + TIME '10:00') AT TIME ZONE 'Asia/Jerusalem' END;
    v_eng_id := job_insert(p_tenant_id, v_client.person_id, v_offering_id, v_starts, NULL, NULL, NULL, NULL);
    UPDATE job_details
    SET job_status = 'shot', auto_status = 'shot'
    WHERE engagement_id = v_eng_id;
    INSERT INTO client_import_shoots (engagement_id, tenant_id, batch_id)
    VALUES (v_eng_id, p_tenant_id, p_batch_id);
    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;


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
           COALESCE(p.email, pp.email) AS email, COALESCE(p.name, pp.name) AS name,
           EXISTS (SELECT 1 FROM client_import_shoots cis WHERE cis.engagement_id = jd.engagement_id) AS imported
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
      AND NOT s.imported
    UNION ALL
    SELECT 'shoot_thank_you', s.* FROM shoots s
    WHERE s.job_status IN ('booked', 'shot', 'editing', 'delivered')
      AND s.shoot_day BETWEEN v_today - 3 AND v_today - 1
      -- A shoot from a client import happened before OpalSwift: no thank-you.
      AND NOT s.imported
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

COMMENT ON TABLE client_import_shoots IS
  'Past shoots added by a client import. Written only by import_clients; they start as shot and get no shoot reminder or thank-you email.';
