-- A hand-picked account always includes its contact.
--
-- Bug: in Notifications -> send email, choosing a single account whose students
-- have no active enrolment (e.g. the owner's own family) showed "No one matches
-- your current filters", because every scope, including 'account', started from
-- active enrolments.
--
-- Fix: for scope 'account' the chosen account is included whether or not it has
-- an enrolment. Nothing else changes: people with no email, or who opted out of
-- email or announcements, are still excluded; marketing sends are still filtered
-- to marketing opt-ins by the send-notification function (purpose = 'marketing',
-- Communications Law s.30A); the other scopes (all / level / class) are unchanged.
--
-- Same signature, SECURITY DEFINER and grants as before (CREATE OR REPLACE keeps
-- them), so supabase/security/definer-execute.json and the generated types do not change.

CREATE OR REPLACE FUNCTION public.resolve_notification_blast_recipients(
  p_tenant_id UUID,
  p_scope TEXT,
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_recipient_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID,
  account_name TEXT,
  class_names TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT;
  v_query_is_uuid BOOLEAN;
  v_active_statuses TEXT[] := ARRAY[
    'active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer'
  ];
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;
  IF p_scope NOT IN ('all', 'level', 'class', 'account') THEN
    RAISE EXCEPTION 'Invalid scope: %', p_scope;
  END IF;
  IF p_scope = 'level' AND p_category_id IS NULL THEN
    RAISE EXCEPTION 'category_id required for level scope';
  END IF;
  IF p_scope = 'class' AND p_offering_id IS NULL THEN
    RAISE EXCEPTION 'offering_id required for class scope';
  END IF;
  IF p_scope = 'account' AND p_account_id IS NULL THEN
    RAISE EXCEPTION 'account_id required for account scope';
  END IF;

  v_query := NULLIF(btrim(p_recipient_query), '');
  v_query_is_uuid := v_query IS NOT NULL
    AND v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  RETURN QUERY
  WITH scoped AS (
    -- Everyone with an active enrolment in the chosen scope (all / level / class).
    SELECT DISTINCT ac.id AS account_id
    FROM engagements e
    INNER JOIN people student
      ON student.id = e.person_id AND student.tenant_id = e.tenant_id
    INNER JOIN accounts ac
      ON ac.id = student.account_id AND ac.tenant_id = e.tenant_id
    INNER JOIN offerings o
      ON o.id = e.offering_id AND o.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND p_scope <> 'account'
      AND student.account_id IS NOT NULL
      AND e.status = ANY(v_active_statuses)
      AND (
        p_scope = 'all'
        OR (p_scope = 'level' AND o.category_id = p_category_id)
        OR (p_scope = 'class' AND e.offering_id = p_offering_id)
      )
    UNION
    -- A hand-picked account is the admin's explicit choice: it does not need an
    -- active enrolment (e.g. the owner's own family, or a family between seasons).
    -- Opt-outs and a missing email are still applied below.
    SELECT ac.id AS account_id
    FROM accounts ac
    WHERE p_scope = 'account'
      AND ac.id = p_account_id
      AND ac.tenant_id = p_tenant_id
  ),
  candidates AS (
    SELECT
      lower(trim(contact.email)) AS email_key,
      trim(contact.email) AS recipient_email,
      contact.name AS recipient_name,
      contact.id AS person_id,
      am.id AS account_member_id,
      ac.name AS account_name,
      (
        SELECT string_agg(DISTINCT o2.name, ', ' ORDER BY o2.name)
        FROM people student
        INNER JOIN engagements e2
          ON e2.person_id = student.id AND e2.tenant_id = p_tenant_id
        INNER JOIN offerings o2
          ON o2.id = e2.offering_id AND o2.tenant_id = p_tenant_id
        WHERE student.account_id = ac.id
          AND student.tenant_id = p_tenant_id
          AND e2.status = ANY(v_active_statuses)
          AND (
            p_scope = 'all'
            OR (p_scope = 'level' AND o2.category_id = p_category_id)
            OR (p_scope = 'class' AND e2.offering_id = p_offering_id)
            OR (p_scope = 'account' AND ac.id = p_account_id)
          )
      ) AS class_names,
      COALESCE(cp.email_opted_in, true) AS email_opted_in,
      COALESCE(cp.notify_announcements, true) AS notify_announcements
    FROM scoped s
    INNER JOIN accounts ac
      ON ac.id = s.account_id AND ac.tenant_id = p_tenant_id
    INNER JOIN people contact
      ON contact.id = ac.person_id AND contact.tenant_id = p_tenant_id
    LEFT JOIN account_members am
      ON am.account_id = ac.id
     AND am.person_id = contact.id
     AND am.role = 'account_holder'
    LEFT JOIN contact_preferences cp
      ON cp.person_id = contact.id
     AND cp.tenant_id = p_tenant_id
     AND cp.account_member_id IS NULL
    WHERE contact.email IS NOT NULL
      AND trim(contact.email) <> ''
  )
  SELECT DISTINCT ON (c.email_key)
    c.recipient_email,
    c.recipient_name,
    c.person_id,
    c.account_member_id,
    c.account_name,
    c.class_names
  FROM candidates c
  WHERE c.email_opted_in
    AND c.notify_announcements
    AND (
      v_query IS NULL
      OR (
        NOT v_query_is_uuid
        AND (
          c.recipient_email ILIKE '%' || v_query || '%'
          OR c.recipient_name ILIKE '%' || v_query || '%'
          OR c.account_name ILIKE '%' || v_query || '%'
          OR COALESCE(c.class_names, '') ILIKE '%' || v_query || '%'
        )
      )
    )
  ORDER BY c.email_key, c.recipient_name;
END;
$$;
