-- link_my_guardian_accounts(): connects a signed-in parent to their family account.
--
-- Bug: a parent who enrolled as a guest has a family account (account_members with
-- user_profile_id NULL) but no login. When they later sign in with the same email
-- they get a login, and nothing connected the two unless they paid on the same
-- browser (portalEngagementId) or finished /enrol/complete. The parent dashboard
-- then found no family account for the login and showed "Failed to load dashboard".
--
-- This function links the caller's own login to the family rows that carry the
-- caller's email. It is deliberately narrow:
--   * only when the login's email is CONFIRMED (auth.users.email_confirmed_at set);
--   * the email is compared case-insensitively and trimmed, against the email of the
--     person on the family row;
--   * only rows with user_profile_id IS NULL: an existing link is never changed;
--   * only roles account_holder and member;
--   * only in the tenant of the caller's own user_profiles row (there is no tenant
--     parameter, so a caller cannot choose one);
--   * every link is written to audit_log;
--   * returns how many rows were linked (0 when there is nothing to do).
-- If two unlinked rows in the tenant match, both are linked.

CREATE OR REPLACE FUNCTION public.link_my_guardian_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant_id UUID;
  v_email     TEXT;
  v_confirmed TIMESTAMPTZ;
  v_row       RECORD;
  v_linked    INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM user_profiles WHERE id = v_uid;
  IF v_tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT lower(btrim(email)), email_confirmed_at
    INTO v_email, v_confirmed
  FROM auth.users
  WHERE id = v_uid;

  IF v_confirmed IS NULL OR v_email IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    WITH linked AS (
      UPDATE account_members am
      SET user_profile_id = v_uid
      FROM people p
      WHERE p.id = am.person_id
        AND p.tenant_id = v_tenant_id
        AND am.tenant_id = v_tenant_id
        AND am.user_profile_id IS NULL
        AND am.role IN ('account_holder', 'member')
        AND lower(btrim(p.email)) = v_email
      RETURNING am.id
    )
    SELECT id FROM linked
  LOOP
    INSERT INTO audit_log (tenant_id, actor_id, actor_email, action, entity_type, entity_id, after_state)
    VALUES (
      v_tenant_id,
      v_uid,
      v_email,
      'UPDATE',
      'account_members',
      v_row.id,
      jsonb_build_object('linked_by', 'link_my_guardian_accounts', 'user_profile_id', v_uid)
    );
    v_linked := v_linked + 1;
  END LOOP;

  RETURN v_linked;
END;
$$;

-- Tier: authenticated (supabase/security/definer-execute.json). Supabase grants
-- anon/authenticated directly, so revoke from anon explicitly.
REVOKE ALL ON FUNCTION public.link_my_guardian_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_guardian_accounts() TO authenticated;
