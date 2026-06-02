-- Guest enrolment: detect existing email and prompt sign-in instead of duplicate key errors.

CREATE OR REPLACE FUNCTION public.guest_enrolment_check_email(
  p_subdomain TEXT,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
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
  p_subdomain TEXT,
  p_guardian_name TEXT,
  p_guardian_email TEXT,
  p_guardian_phone TEXT,
  p_student_name TEXT,
  p_student_dob DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_guardian_id UUID;
  v_account_id UUID;
  v_student_id UUID;
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
  p_subdomain TEXT,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL,
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

GRANT EXECUTE ON FUNCTION public.guest_enrolment_check_email(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_enrolment_check_email(TEXT, TEXT) TO authenticated;
