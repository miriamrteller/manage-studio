-- =============================================================================
-- get_my_last_signer_details(): fall back to the caller's own stored phone.
--
-- A signed-in parent with no earlier signed form (or whose last signer block has
-- no phone) was asked for a phone OpalSwift already has. The phone lives in
-- contact_preferences.whatsapp_number (people has no phone column). When there is
-- no earlier phone, the function now returns that stored number in the same
-- signer-block shape: the full last block with "phone" filled in, or
-- {"phone": "..."} alone when the caller has never signed.
--
-- Still the caller's own records only: the waiver row must be theirs (member row
-- or own person row) and the phone comes from the contact_preferences row of
-- their own person record or their own account_members row, in their own tenant.
-- people.emergency_contact_phone is NOT used: it is someone else's number.
-- Same signature, return type and grants; already listed in
-- supabase/security/definer-execute.json (authenticated tier).
-- =============================================================================

CREATE OR REPLACE FUNCTION get_my_last_signer_details()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_last  JSONB;
  v_phone TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  SELECT w.signer_details -> 'signer' INTO v_last
  FROM waiver_evidence w
  WHERE w.tenant_id = get_my_tenant_id()
    AND w.signer_details IS NOT NULL
    AND (
      w.account_member_id IN (SELECT id FROM account_members WHERE user_profile_id = auth.uid())
      OR w.person_id = get_my_person_id()
    )
  ORDER BY w.signed_at DESC
  LIMIT 1;

  IF NULLIF(trim(coalesce(v_last ->> 'phone', '')), '') IS NOT NULL THEN
    RETURN v_last;
  END IF;

  -- Household (account member) row first, like the client's pickContactPreferenceRow.
  SELECT NULLIF(trim(cp.whatsapp_number), '') INTO v_phone
  FROM contact_preferences cp
  WHERE cp.tenant_id = get_my_tenant_id()
    AND NULLIF(trim(coalesce(cp.whatsapp_number, '')), '') IS NOT NULL
    AND (
      cp.account_member_id IN (SELECT id FROM account_members WHERE user_profile_id = auth.uid())
      OR cp.person_id = get_my_person_id()
    )
  ORDER BY (cp.account_member_id IS NOT NULL) DESC, cp.updated_at DESC
  LIMIT 1;

  IF v_phone IS NULL THEN RETURN v_last; END IF;
  RETURN coalesce(v_last, '{}'::jsonb) || jsonb_build_object('phone', v_phone);
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_last_signer_details() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_my_last_signer_details() TO authenticated, service_role;
