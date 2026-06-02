-- Admin enrolment: guardian lookup by email

CREATE OR REPLACE FUNCTION public.admin_enrolment_lookup_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_row RECORD;
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

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT
    p.id AS guardian_person_id,
    p.name AS guardian_name,
    p.email AS guardian_email,
    COALESCE(am.account_id, ac.id) AS account_id
  INTO v_row
  FROM people p
  LEFT JOIN account_members am
    ON am.person_id = p.id
    AND am.tenant_id = p.tenant_id
    AND am.role = 'account_holder'
  LEFT JOIN accounts ac
    ON ac.person_id = p.id
    AND ac.tenant_id = p.tenant_id
  WHERE p.tenant_id = v_tenant_id
    AND p.email IS NOT NULL
    AND lower(trim(p.email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_row IS NULL OR v_row.account_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'guardianPersonId', v_row.guardian_person_id,
    'accountId', v_row.account_id,
    'guardianName', v_row.guardian_name,
    'guardianEmail', v_row.guardian_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_enrolment_lookup_email(TEXT) TO authenticated;
