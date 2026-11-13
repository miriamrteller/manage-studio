-- =============================================================================
-- Studios with family accounts switched off (photographers, beauticians, any
-- studio that turns "Parents pay for children" off): a client's login is linked
-- to the client's own record, never only to their billing account.
--
-- Every client has a billing account (accounts + account_members) behind the
-- scenes, whatever the studio type. Until now only the business preset
-- ('services' / 'catalog') decided whether a login was linked to the person
-- directly. Photographer studios carry the default preset 'programs', so their
-- clients' logins were linked through account_members only, as if they were a
-- family, and get_my_person_id() came back empty (13 Nov 2026: a photo shop cash
-- order was refused). Families are never shown for these studios (#448); this
-- makes the data match.
--
-- 1. link_auth_user_to_person also links the person directly when the studio's
--    family_accounts is off.
-- 2. Backfill: at those studios, a client whose billing account login is set
--    but whose own record has none gets the same login on their own record.
--    Only the account holder's own record, only where it is empty, and only
--    when that login is not already on another record at the studio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.link_auth_user_to_person(p_person_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_person        people%ROWTYPE;
  v_linked        INT := 0;
  v_preset        TEXT;
  v_families      BOOLEAN;
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

  -- pending_waiver included: a guest who paid but has not yet signed the waiver
  -- must still be able to link their auth account.
  IF NOT EXISTS (
    SELECT 1 FROM engagements
    WHERE person_id = p_person_id
      AND status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'pending_waiver')
  ) THEN
    RAISE EXCEPTION 'No active engagement for this person';
  END IF;

  SELECT business_preset, family_accounts INTO v_preset, v_families
  FROM tenants WHERE id = get_my_tenant_id();

  -- No families at this studio: the login is the client's own.
  IF v_person.account_id IS NULL
     OR COALESCE(v_preset, 'programs') IN ('services', 'catalog')
     OR v_families IS FALSE THEN
    UPDATE people
    SET user_profile_id = v_uid, updated_at = NOW()
    WHERE id = p_person_id
      AND (user_profile_id IS NULL OR user_profile_id = v_uid);
    IF v_families IS FALSE AND v_person.account_id IS NOT NULL THEN
      -- Keep the billing account's login in step, so paying "for my account" still works.
      UPDATE account_members
      SET user_profile_id = v_uid
      WHERE account_id = v_person.account_id
        AND person_id = p_person_id
        AND role IN ('account_holder', 'member')
        AND user_profile_id IS NULL;
    END IF;
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

REVOKE ALL ON FUNCTION public.link_auth_user_to_person(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_person(UUID) TO authenticated, service_role;

-- Backfill (see 2. above).
UPDATE public.people p
SET user_profile_id = m.user_profile_id, updated_at = NOW()
FROM public.account_members m
JOIN public.tenants t ON t.id = m.tenant_id
WHERE t.family_accounts IS FALSE
  AND m.person_id = p.id
  AND m.tenant_id = p.tenant_id
  AND m.role = 'account_holder'
  AND m.user_profile_id IS NOT NULL
  AND p.user_profile_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.people other
    WHERE other.tenant_id = p.tenant_id
      AND other.user_profile_id = m.user_profile_id
  );
