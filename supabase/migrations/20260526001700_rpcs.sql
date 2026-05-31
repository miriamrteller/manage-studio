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
