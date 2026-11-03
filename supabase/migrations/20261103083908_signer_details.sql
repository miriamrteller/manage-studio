-- =============================================================================
-- Signer details sealed on every signature.
--
-- Who signed, and for whom, is part of the evidence: the signer's full name, ID
-- number (or passport number and country), phone and address, the child's name and
-- date of birth when the form is for a minor, and the signer's tick "These details
-- are correct". The submitted values are stored on the signed record
-- (waiver_evidence.signer_details) and are part of record_hmac (keyed; the ID
-- number is never stored as an unkeyed hash, a 9-digit ID could be brute-forced).
--
-- The ID number is sensitive:
--   * waiver_evidence.signer_details is NOT readable with a direct SELECT by
--     anon/authenticated (column-level grants, same pattern as tenants *_enc);
--     the full value is returned only by get_signed_record_details() to a
--     studio admin of that tenant or a member of the signer's own family.
--   * lists show signer_id_masked ("••••••123"), computed at signing.
--
-- sign_waiver() repeats the structural checks and the Israeli ID check digit, so a
-- direct call cannot skip what the browser and accept-waiver already enforce.
-- =============================================================================

-- Israeli ID check digit: pad to 9 digits, multiply alternately by 1 and 2, add
-- the digits of each product; the total must be divisible by 10.
CREATE OR REPLACE FUNCTION is_valid_israeli_id(p_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE
SET search_path = public AS $$
DECLARE
  v_digits TEXT := regexp_replace(COALESCE(p_id, ''), '[[:space:]-]', '', 'g');
  v_sum    INT := 0;
  v_prod   INT;
  i        INT;
BEGIN
  IF v_digits !~ '^[0-9]{5,9}$' THEN RETURN false; END IF;
  v_digits := lpad(v_digits, 9, '0');
  IF v_digits = '000000000' THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP
    v_prod := substr(v_digits, i, 1)::INT * (((i - 1) % 2) + 1);
    IF v_prod > 9 THEN v_prod := v_prod - 9; END IF;
    v_sum := v_sum + v_prod;
  END LOOP;
  RETURN v_sum % 10 = 0;
END;
$$;

ALTER TABLE waiver_evidence
  ADD COLUMN IF NOT EXISTS signer_details   JSONB,
  ADD COLUMN IF NOT EXISTS signer_id_masked TEXT;

COMMENT ON COLUMN waiver_evidence.signer_details IS
  'Sealed signer details (version, confirmed, confirmed_wording, signer{full_name,id_type,id_number,passport_country?,phone,address}, child?{full_name,date_of_birth,dob_differs_from_profile}). Part of record_hmac. SENSITIVE: no direct SELECT for anon/authenticated; read via get_signed_record_details().';
COMMENT ON COLUMN waiver_evidence.signer_id_masked IS
  'Signer ID or passport number with all but the last 3 characters hidden. Safe for lists.';

-- Column-level SELECT: everything except signer_details. A new column needs its own
-- GRANT SELECT (col) in the migration that adds it (the security suite checks this).
REVOKE SELECT ON waiver_evidence FROM anon, authenticated;
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'waiver_evidence'
    AND column_name <> 'signer_details';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.waiver_evidence TO authenticated', v_cols);
END $$;

-- ---------------------------------------------------------------------------
-- sign_waiver(): the old 26-argument signature is replaced by one that also takes
-- p_signer_details. The new argument is last and defaulted so admin uploads
-- (no signer form) keep working; typed signatures must carry valid details.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN
);

CREATE OR REPLACE FUNCTION sign_waiver(
  p_id                   UUID,
  p_tenant_id            UUID,
  p_person_id            UUID,
  p_account_member_id    UUID,
  p_consent_template_id  UUID,
  p_consent_version      INT,
  p_consent_version_hash TEXT,
  p_wording_snapshot     TEXT,
  p_pdf_storage_path     TEXT,
  p_pdf_sha256           TEXT,
  p_record_hmac          TEXT,
  p_hmac_key_version     SMALLINT,
  p_viewed_at            TIMESTAMPTZ,
  p_signed_by_name       TEXT,
  p_signed_by_email      TEXT,
  p_signed_by_role       TEXT,
  p_signature_method     TEXT,
  p_signed_at            TIMESTAMPTZ,
  p_ip_address           INET,
  p_user_agent           TEXT,
  p_accept_language      TEXT,
  p_idempotency_key      TEXT,
  p_otp_verify_sid       TEXT,
  p_actor_id             UUID,
  p_offering_id          UUID    DEFAULT NULL,
  p_guardian_confirmed   BOOLEAN DEFAULT false,
  p_signer_details       JSONB   DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_evidence_id UUID;
  v_signer      JSONB;
  v_id_type     TEXT;
  v_id_number   TEXT;
  v_masked      TEXT;
  v_dob         DATE;
  v_minor       BOOLEAN;
BEGIN
  IF p_signature_method = 'typed_name_checkbox' THEN
    IF p_signer_details IS NULL OR jsonb_typeof(p_signer_details) <> 'object'
       OR p_signer_details -> 'confirmed' IS DISTINCT FROM 'true'::jsonb
       OR length(COALESCE(p_signer_details ->> 'confirmed_wording', '')) NOT BETWEEN 1 AND 500
       OR jsonb_typeof(p_signer_details -> 'signer') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'signer_details_required' USING ERRCODE = '22023';
    END IF;

    v_signer    := p_signer_details -> 'signer';
    v_id_type   := v_signer ->> 'id_type';
    v_id_number := v_signer ->> 'id_number';

    IF length(COALESCE(v_signer ->> 'full_name', '')) NOT BETWEEN 2 AND 120
       OR length(COALESCE(v_signer ->> 'address', '')) NOT BETWEEN 5 AND 300
       OR COALESCE(v_signer ->> 'phone', '') !~ '^[0-9+()[:space:].-]{7,25}$'
       OR length(regexp_replace(COALESCE(v_signer ->> 'phone', ''), '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15 THEN
      RAISE EXCEPTION 'signer_details_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_id_type = 'israeli_id' THEN
      IF v_id_number !~ '^[0-9]{9}$' OR NOT is_valid_israeli_id(v_id_number) THEN
        RAISE EXCEPTION 'signer_id_invalid' USING ERRCODE = '22023';
      END IF;
    ELSIF v_id_type = 'passport' THEN
      IF COALESCE(v_id_number, '') !~ '^[A-Z0-9]{5,20}$'
         OR length(COALESCE(v_signer ->> 'passport_country', '')) NOT BETWEEN 2 AND 60 THEN
        RAISE EXCEPTION 'signer_id_invalid' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'signer_id_invalid' USING ERRCODE = '22023';
    END IF;

    -- A person who is clearly a minor (2 day margin around the 18th birthday, so a
    -- timezone difference never blocks a signature) needs the child block.
    SELECT date_of_birth INTO v_dob FROM people
    WHERE id = p_person_id AND tenant_id = p_tenant_id;
    v_minor := v_dob IS NOT NULL AND v_dob > (current_date - interval '18 years' + interval '2 days');
    IF v_minor THEN
      IF jsonb_typeof(p_signer_details -> 'child') IS DISTINCT FROM 'object'
         OR length(COALESCE(p_signer_details -> 'child' ->> 'full_name', '')) NOT BETWEEN 2 AND 120
         OR COALESCE(p_signer_details -> 'child' ->> 'date_of_birth', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'signer_child_required' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_masked := repeat('•', greatest(length(v_id_number) - CASE WHEN length(v_id_number) > 3 THEN 3 ELSE 0 END, 3))
                || CASE WHEN length(v_id_number) > 3 THEN right(v_id_number, 3) ELSE '' END;
  END IF;

  INSERT INTO waiver_evidence (
    id, tenant_id, person_id, account_member_id,
    consent_template_id, consent_version, consent_version_hash, wording_snapshot,
    pdf_storage_path, pdf_sha256, record_hmac, hmac_key_version, viewed_at,
    signed_by_name, signed_by_email, signed_by_role, signature_method,
    signed_at, ip_address, user_agent, accept_language,
    idempotency_key, otp_verify_sid, status, offering_id, guardian_confirmed,
    signer_details, signer_id_masked
  ) VALUES (
    p_id, p_tenant_id, p_person_id, p_account_member_id,
    p_consent_template_id, p_consent_version, p_consent_version_hash, p_wording_snapshot,
    p_pdf_storage_path, p_pdf_sha256, p_record_hmac, p_hmac_key_version, p_viewed_at,
    p_signed_by_name, p_signed_by_email, p_signed_by_role, p_signature_method,
    p_signed_at, p_ip_address, p_user_agent, p_accept_language,
    p_idempotency_key, p_otp_verify_sid, 'signed', p_offering_id, p_guardian_confirmed,
    p_signer_details, v_masked
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_evidence_id;

  IF v_evidence_id IS NULL THEN
    SELECT id INTO v_evidence_id FROM waiver_evidence
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
    RETURN v_evidence_id;
  END IF;

  INSERT INTO waiver_events (tenant_id, waiver_evidence_id, event_type, actor_id, metadata)
  VALUES (p_tenant_id, v_evidence_id, 'accepted', p_actor_id,
          jsonb_build_object(
            'ip',                 p_ip_address::TEXT,
            'consent_version',    p_consent_version,
            'offering_id',        p_offering_id::TEXT,
            'guardian_confirmed', p_guardian_confirmed
          ));

  -- The audit row never carries the signer details (ID number): only that they were sealed.
  INSERT INTO audit_log (tenant_id, actor_id, actor_email, action, entity_type, entity_id,
                         ip_address, user_agent, after_state)
  VALUES (p_tenant_id, p_actor_id, p_signed_by_email, 'waiver_signed', 'waiver_evidence',
          v_evidence_id, p_ip_address, p_user_agent,
          jsonb_build_object(
            'person_id',           p_person_id,
            'consent_version',     p_consent_version,
            'consent_template_id', p_consent_template_id,
            'offering_id',         p_offering_id,
            'guardian_confirmed',  p_guardian_confirmed,
            'signer_details_sealed', p_signer_details IS NOT NULL
          ));

  UPDATE people
  SET waiver_accepted_at = p_signed_at,
      waiver_version     = p_consent_version::TEXT,
      updated_at         = now()
  WHERE id = p_person_id AND tenant_id = p_tenant_id;

  RETURN v_evidence_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN,JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN,JSONB
) TO service_role;

-- ---------------------------------------------------------------------------
-- Reading the sealed details
-- ---------------------------------------------------------------------------

-- Full details of one signed record: a studio admin of that tenant, or a member of
-- the signer's own family. Anyone else gets NULL (never an error that reveals the id exists).
CREATE OR REPLACE FUNCTION get_signed_record_details(p_evidence_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_row  waiver_evidence%ROWTYPE;
  v_ok   BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_row FROM waiver_evidence WHERE id = p_evidence_id;
  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM get_my_tenant_id() THEN RETURN NULL; END IF;

  -- COALESCE: a NULL comparison (caller has no person row) must read as "no", not skip the check.
  v_ok := COALESCE(
            EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
         OR v_row.person_id = get_my_person_id()
         OR v_row.account_member_id IN (SELECT id FROM account_members WHERE user_profile_id = auth.uid()),
            false);
  IF NOT v_ok THEN RETURN NULL; END IF;

  RETURN v_row.signer_details;
END;
$$;

-- The signer block of the caller's most recent signed record (their own, or one signed
-- by them for a child), so the next form can be pre-filled. NULL when there is none.
CREATE OR REPLACE FUNCTION get_my_last_signer_details()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT w.signer_details -> 'signer'
  FROM waiver_evidence w
  WHERE auth.uid() IS NOT NULL
    AND w.tenant_id = get_my_tenant_id()
    AND w.signer_details IS NOT NULL
    AND (
      w.account_member_id IN (SELECT id FROM account_members WHERE user_profile_id = auth.uid())
      OR w.person_id = get_my_person_id()
    )
  ORDER BY w.signed_at DESC
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION get_signed_record_details(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_signed_record_details(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION get_my_last_signer_details() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_my_last_signer_details() TO authenticated, service_role;
