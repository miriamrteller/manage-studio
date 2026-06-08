-- =============================================================================
-- 002100: Guest enrolment intake RPCs (anon-safe, no edge function required)
-- Billing-account resolution, email dedup, idempotent engagement create.
-- DEPENDENCIES: 000300, 001100, 001300
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guest_enrolment_check_email(
  p_subdomain TEXT,
  p_email     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  UUID;
  v_registered BOOLEAN;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN jsonb_build_object('registered', false);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM people
    WHERE tenant_id = v_tenant_id
      AND email IS NOT NULL
      AND lower(trim(email)) = lower(trim(p_email))
  ) INTO v_registered;

  RETURN jsonb_build_object('registered', v_registered);
END;
$$;

CREATE OR REPLACE FUNCTION public.guest_enrolment_create_family(
  p_subdomain      TEXT,
  p_guardian_name  TEXT,
  p_guardian_email TEXT,
  p_guardian_phone TEXT,
  p_student_name   TEXT,
  p_student_dob    DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id   UUID;
  v_guardian_id UUID;
  v_account_id  UUID;
  v_student_id  UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF p_guardian_name IS NULL OR trim(p_guardian_name) = '' THEN
    RAISE EXCEPTION 'Guardian name is required';
  END IF;
  IF p_guardian_email IS NULL OR trim(p_guardian_email) = '' THEN
    RAISE EXCEPTION 'Guardian email is required';
  END IF;
  IF p_student_name IS NULL OR trim(p_student_name) = '' THEN
    RAISE EXCEPTION 'Student name is required';
  END IF;
  IF p_student_dob IS NULL THEN
    RAISE EXCEPTION 'Student date of birth is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM people
    WHERE tenant_id = v_tenant_id
      AND email IS NOT NULL
      AND lower(trim(email)) = lower(trim(p_guardian_email))
  ) THEN
    RAISE EXCEPTION 'EXISTING_EMAIL';
  END IF;

  INSERT INTO people (tenant_id, name, email, emergency_contact_phone, status)
  VALUES (
    v_tenant_id,
    trim(p_guardian_name),
    lower(trim(p_guardian_email)),
    NULLIF(trim(p_guardian_phone), ''),
    'active'
  )
  RETURNING id INTO v_guardian_id;

  INSERT INTO accounts (tenant_id, name, person_id)
  VALUES (v_tenant_id, trim(p_guardian_name) || ' family', v_guardian_id)
  RETURNING id INTO v_account_id;

  INSERT INTO people (tenant_id, name, date_of_birth, account_id, status)
  VALUES (v_tenant_id, trim(p_student_name), p_student_dob, v_account_id, 'active')
  RETURNING id INTO v_student_id;

  INSERT INTO account_members (tenant_id, account_id, person_id, role, user_profile_id)
  VALUES (v_tenant_id, v_account_id, v_guardian_id, 'account_holder', NULL);

  RETURN jsonb_build_object(
    'accountId', v_account_id,
    'guardianPersonId', v_guardian_id,
    'studentPersonId', v_student_id,
    'guardianEmail', lower(trim(p_guardian_email))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guest_enrolment_create_adult(
  p_subdomain     TEXT,
  p_name          TEXT,
  p_email         TEXT,
  p_phone         TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_person_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM people
    WHERE tenant_id = v_tenant_id
      AND email IS NOT NULL
      AND lower(trim(email)) = lower(trim(p_email))
  ) THEN
    RAISE EXCEPTION 'EXISTING_EMAIL';
  END IF;

  INSERT INTO people (tenant_id, name, email, emergency_contact_phone, date_of_birth, status)
  VALUES (
    v_tenant_id,
    trim(p_name),
    lower(trim(p_email)),
    NULLIF(trim(p_phone), ''),
    p_date_of_birth,
    'active'
  )
  RETURNING id INTO v_person_id;

  RETURN jsonb_build_object(
    'personId', v_person_id,
    'email', lower(trim(p_email))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guest_enrolment_create_engagement(
  p_subdomain         TEXT,
  p_student_person_id UUID,
  p_offering_id       UUID,
  p_season_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id          UUID;
  v_student_account_id UUID;
  v_payer_person_id    UUID;
  v_billing_account_id UUID;
  v_engagement_id      UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id = p_student_person_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Person not found';
  END IF;

  SELECT account_id INTO v_student_account_id
  FROM people
  WHERE id = p_student_person_id;

  IF v_student_account_id IS NOT NULL THEN
    SELECT am.person_id INTO v_payer_person_id
    FROM account_members am
    WHERE am.account_id = v_student_account_id
      AND am.role = 'account_holder'
    LIMIT 1;
  END IF;

  IF v_payer_person_id IS NULL THEN
    v_payer_person_id := p_student_person_id;
  END IF;

  SELECT id INTO v_engagement_id
  FROM engagements
  WHERE tenant_id = v_tenant_id
    AND person_id = p_student_person_id
    AND offering_id = p_offering_id
    AND season_id = p_season_id
  LIMIT 1;

  IF v_engagement_id IS NOT NULL THEN
    RETURN jsonb_build_object('engagementId', v_engagement_id);
  END IF;

  SELECT id INTO v_billing_account_id
  FROM billing_accounts
  WHERE tenant_id = v_tenant_id
    AND person_id = v_payer_person_id
    AND status = 'active'
  LIMIT 1;

  IF v_billing_account_id IS NULL THEN
    INSERT INTO billing_accounts (tenant_id, person_id, status)
    VALUES (v_tenant_id, v_payer_person_id, 'active')
    RETURNING id INTO v_billing_account_id;
  END IF;

  INSERT INTO engagements (
    tenant_id, person_id, offering_id, season_id, billing_account_id, status
  )
  VALUES (
    v_tenant_id,
    p_student_person_id,
    p_offering_id,
    p_season_id,
    v_billing_account_id,
    'pending_payment'
  )
  RETURNING id INTO v_engagement_id;

  RETURN jsonb_build_object('engagementId', v_engagement_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.guest_enrolment_check_email(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_enrolment_check_email(TEXT, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.guest_enrolment_create_family(TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_enrolment_create_family(TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;

GRANT EXECUTE ON FUNCTION public.guest_enrolment_create_adult(TEXT, TEXT, TEXT, TEXT, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_enrolment_create_adult(TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;

GRANT EXECUTE ON FUNCTION public.guest_enrolment_create_engagement(TEXT, UUID, UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_enrolment_create_engagement(TEXT, UUID, UUID, UUID) TO authenticated;
