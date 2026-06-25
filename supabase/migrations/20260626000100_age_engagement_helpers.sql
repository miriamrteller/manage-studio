-- =============================================================================
-- Age snapshot helper + guest engagement age gate (PR A)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.engagement_age_at_season_start(
  p_person_id UUID,
  p_offering_id UUID
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dob DATE;
  v_season_start DATE;
BEGIN
  SELECT p.date_of_birth INTO v_dob
  FROM people p
  WHERE p.id = p_person_id;

  SELECT s.start_date INTO v_season_start
  FROM offerings o
  JOIN seasons s ON s.id = o.season_id
  WHERE o.id = p_offering_id;

  IF v_dob IS NULL OR v_season_start IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN EXTRACT(YEAR FROM age(v_season_start, v_dob))::INT;
END;
$$;

REVOKE ALL ON FUNCTION public.engagement_age_at_season_start(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engagement_age_at_season_start(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_age_at_season_start(UUID, UUID) TO service_role;

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
  v_payer_account_id   UUID;
  v_billing_account_id UUID;
  v_engagement_id      UUID;
  v_dob                DATE;
  v_min_age            INT;
  v_max_age            INT;
  v_season_start       DATE;
  v_student_age        INT;
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

  SELECT p.date_of_birth, o.min_age, o.max_age, s.start_date
  INTO v_dob, v_min_age, v_max_age, v_season_start
  FROM people p
  CROSS JOIN offerings o
  LEFT JOIN seasons s ON s.id = o.season_id
  WHERE p.id = p_student_person_id
    AND o.id = p_offering_id;

  IF v_dob IS NOT NULL
     AND v_season_start IS NOT NULL
     AND (v_min_age IS NOT NULL OR v_max_age IS NOT NULL)
  THEN
    v_student_age := EXTRACT(YEAR FROM age(v_season_start, v_dob))::INT;

    IF (v_min_age IS NOT NULL AND v_student_age < v_min_age)
       OR (v_max_age IS NOT NULL AND v_student_age > v_max_age)
    THEN
      RAISE EXCEPTION 'AGE_INELIGIBLE';
    END IF;
  END IF;

  SELECT account_id INTO v_payer_account_id
  FROM people
  WHERE id = v_payer_person_id;

  IF v_payer_account_id IS NOT NULL THEN
    SELECT id INTO v_billing_account_id
    FROM billing_accounts
    WHERE tenant_id = v_tenant_id
      AND account_id = v_payer_account_id
      AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_billing_account_id IS NULL THEN
    SELECT id INTO v_billing_account_id
    FROM billing_accounts
    WHERE tenant_id = v_tenant_id
      AND person_id = v_payer_person_id
      AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_billing_account_id IS NULL THEN
    INSERT INTO billing_accounts (tenant_id, account_id, person_id, status)
    VALUES (v_tenant_id, v_payer_account_id, v_payer_person_id, 'active')
    RETURNING id INTO v_billing_account_id;
  END IF;

  INSERT INTO engagements (
    tenant_id,
    person_id,
    offering_id,
    season_id,
    billing_account_id,
    status,
    age_at_season_start
  )
  VALUES (
    v_tenant_id,
    p_student_person_id,
    p_offering_id,
    p_season_id,
    v_billing_account_id,
    'pending_payment',
    engagement_age_at_season_start(p_student_person_id, p_offering_id)
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
