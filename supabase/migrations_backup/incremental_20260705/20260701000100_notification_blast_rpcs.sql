-- In-scope engagement statuses for blast recipient resolution:
-- active, pending_payment, pending_waiver, admin_review, pending_offer

CREATE OR REPLACE FUNCTION public.resolve_notification_blast_recipients(
  p_tenant_id UUID,
  p_scope TEXT,
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;
  IF p_scope NOT IN ('all', 'level', 'class') THEN
    RAISE EXCEPTION 'Invalid scope: %', p_scope;
  END IF;
  IF p_scope = 'level' AND p_category_id IS NULL THEN
    RAISE EXCEPTION 'category_id required for level scope';
  END IF;
  IF p_scope = 'class' AND p_offering_id IS NULL THEN
    RAISE EXCEPTION 'offering_id required for class scope';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT DISTINCT ac.id AS account_id
    FROM engagements e
    INNER JOIN people student
      ON student.id = e.person_id AND student.tenant_id = e.tenant_id
    INNER JOIN accounts ac
      ON ac.id = student.account_id AND ac.tenant_id = e.tenant_id
    INNER JOIN offerings o
      ON o.id = e.offering_id AND o.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND student.account_id IS NOT NULL
      AND e.status IN (
        'active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer'
      )
      AND (
        p_scope = 'all'
        OR (p_scope = 'level' AND o.category_id = p_category_id)
        OR (p_scope = 'class' AND e.offering_id = p_offering_id)
      )
  ),
  candidates AS (
    SELECT
      lower(trim(contact.email)) AS email_key,
      trim(contact.email) AS recipient_email,
      contact.name AS recipient_name,
      contact.id AS person_id,
      am.id AS account_member_id,
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
    c.account_member_id
  FROM candidates c
  WHERE c.email_opted_in
    AND c.notify_announcements
  ORDER BY c.email_key, c.recipient_name;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_notification_blast_recipients(UUID, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_notification_blast_recipients(UUID, TEXT, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.preview_notification_blast_recipients(
  p_scope TEXT,
  p_category_id UUID DEFAULT NULL,
  p_offering_id UUID DEFAULT NULL
)
RETURNS TABLE (
  recipient_email TEXT,
  recipient_name TEXT,
  person_id UUID,
  account_member_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  RETURN QUERY
  SELECT * FROM public.resolve_notification_blast_recipients(
    v_tenant_id, p_scope, p_category_id, p_offering_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_notification_blast_recipients(TEXT, UUID, UUID) TO authenticated;
