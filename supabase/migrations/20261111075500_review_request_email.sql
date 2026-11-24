-- =============================================================================
-- Review request: an automatic email that asks the client for a review, sent
-- 5 days after the studio shares the gallery. It goes out only when the studio
-- has added a review link (tenants.review_url) and has not switched it off.
-- The edge function run-shoot-emails reads the link from the tenant row.
-- DEPENDENCIES: 20261030000300_quotes.sql, 20261030000500_contract_signed_emails.sql
-- =============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS review_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_review_url_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_review_url_check
      CHECK (review_url IS NULL OR (review_url ~* '^https?://' AND length(review_url) <= 500));
  END IF;
END $$;

COMMENT ON COLUMN tenants.review_url IS
  'Link the review request email opens (for example the studio''s Google reviews page). NULL = no review request is sent.';

-- Read and saved by the automatic email settings. Writes go through the existing
-- admin UPDATE policy on tenants.
GRANT SELECT (review_url) ON TABLE tenants TO authenticated;

ALTER TABLE tenant_automatic_emails
  DROP CONSTRAINT IF EXISTS tenant_automatic_emails_email_key_check;
ALTER TABLE tenant_automatic_emails
  ADD CONSTRAINT tenant_automatic_emails_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio', 'review_request'));

ALTER TABLE automatic_email_log
  DROP CONSTRAINT IF EXISTS automatic_email_log_email_key_check;
ALTER TABLE automatic_email_log
  ADD CONSTRAINT automatic_email_log_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio', 'review_request'));

-- Same signature as before (grants are kept); adds the review_request rows.
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
           jd.job_status, jd.gallery_url, jd.gallery_released_at,
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
    WHERE s.gallery_released_at IS NOT NULL AND s.gallery_url IS NOT NULL
      AND s.gallery_released_at BETWEEN p_now - interval '7 days' AND p_now
    UNION ALL
    -- Review request: 5 days after the gallery is shared (window to 12 days
    -- tolerates missed runs), only when the studio has added a review link.
    SELECT 'review_request', s.* FROM shoots s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.gallery_released_at IS NOT NULL
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
