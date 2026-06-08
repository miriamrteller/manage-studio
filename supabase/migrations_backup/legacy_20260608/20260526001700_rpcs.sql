-- =============================================================================
-- 017: Miscellaneous RPCs
-- get_my_profile — reliable profile fetch when PostgREST anon JWT causes 403
-- link_auth_user_to_person — link signup session to engagement person/account
-- DEPENDENCIES: 001, 002, 011
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.user_profiles
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT * FROM public.user_profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.link_auth_user_to_person(p_person_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_person people%ROWTYPE;
  v_profile_email TEXT;
  v_linked INT := 0;
  v_preset TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'p_person_id is required';
  END IF;

  SELECT * INTO v_person
  FROM people
  WHERE id = p_person_id
    AND tenant_id = get_my_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found or not in your tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM engagements
    WHERE person_id = p_person_id
      AND status IN ('pending_payment', 'active', 'admin_review', 'pending_offer')
  ) THEN
    RAISE EXCEPTION 'No active engagement for this person';
  END IF;

  SELECT email INTO v_profile_email FROM user_profiles WHERE id = v_uid;

  SELECT business_preset INTO v_preset
  FROM tenants WHERE id = get_my_tenant_id();

  IF v_person.account_id IS NULL OR COALESCE(v_preset, 'programs') IN ('services', 'catalog') THEN
    UPDATE people
    SET user_profile_id = v_uid, updated_at = NOW()
    WHERE id = p_person_id
      AND (user_profile_id IS NULL OR user_profile_id = v_uid);
    RETURN;
  END IF;

  UPDATE account_members
  SET user_profile_id = v_uid
  WHERE account_id = v_person.account_id
    AND role IN ('account_holder', 'member')
    AND (user_profile_id IS NULL OR user_profile_id = v_uid);

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  IF v_linked = 0 THEN
    UPDATE account_members
    SET user_profile_id = v_uid
    WHERE id = (
      SELECT id FROM account_members
      WHERE account_id = v_person.account_id
        AND role IN ('account_holder', 'member')
        AND (user_profile_id IS NULL OR user_profile_id = v_uid)
      ORDER BY created_at
      LIMIT 1
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_auth_user_to_person(UUID) TO authenticated;

-- Portal provisioning — link auth user to guardian after enrolment payment
CREATE OR REPLACE FUNCTION public.resolve_engagement_guardian(p_engagement_id UUID)
RETURNS TABLE (
  guardian_person_id UUID,
  guardian_email TEXT,
  guardian_name TEXT,
  student_person_id UUID,
  account_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_account_id UUID;
BEGIN
  SELECT e.person_id INTO v_student_id
  FROM engagements e
  WHERE e.id = p_engagement_id
    AND e.tenant_id = get_my_tenant_id();

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  SELECT p.account_id INTO v_account_id
  FROM people p
  WHERE p.id = v_student_id
    AND p.tenant_id = get_my_tenant_id();

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Student has no family account';
  END IF;

  RETURN QUERY
  SELECT
    gp.id,
    gp.email,
    gp.name,
    v_student_id,
    v_account_id
  FROM account_members am
  JOIN people gp ON gp.id = am.person_id
  WHERE am.account_id = v_account_id
    AND am.role = 'account_holder'
    AND am.tenant_id = get_my_tenant_id()
  ORDER BY am.created_at
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_engagement_guardian(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_auth_user_to_guardian_for_engagement(p_engagement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_auth_email TEXT;
  v_guardian_id UUID;
  v_guardian_email TEXT;
  v_account_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_engagement_id IS NULL THEN
    RAISE EXCEPTION 'p_engagement_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM engagements
    WHERE id = p_engagement_id
      AND tenant_id = get_my_tenant_id()
      AND status IN ('pending_payment', 'active', 'admin_review', 'pending_offer')
  ) THEN
    RAISE EXCEPTION 'No eligible engagement found';
  END IF;

  SELECT email INTO v_auth_email FROM auth.users WHERE id = v_uid;

  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = v_uid
      AND tenant_id = get_my_tenant_id()
      AND 'tenant_admin' = ANY(role)
  ) INTO v_is_admin;

  SELECT guardian_person_id, guardian_email, account_id
  INTO v_guardian_id, v_guardian_email, v_account_id
  FROM resolve_engagement_guardian(p_engagement_id);

  IF v_guardian_id IS NULL THEN
    RAISE EXCEPTION 'Guardian not found for this engagement';
  END IF;

  IF v_guardian_email IS NULL OR trim(v_guardian_email) = '' THEN
    RAISE EXCEPTION 'Guardian email is required for portal access';
  END IF;

  IF lower(trim(v_auth_email)) <> lower(trim(v_guardian_email)) THEN
    RAISE EXCEPTION 'Sign in with the guardian email on file (%).', v_guardian_email;
  END IF;

  IF v_is_admin THEN
    RAISE EXCEPTION 'Admin accounts cannot be linked as guardians via this enrolment';
  END IF;

  UPDATE account_members
  SET user_profile_id = v_uid
  WHERE account_id = v_account_id
    AND person_id = v_guardian_id
    AND role = 'account_holder'
    AND (user_profile_id IS NULL OR user_profile_id = v_uid);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not link guardian membership';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_auth_user_to_guardian_for_engagement(UUID) TO authenticated;
