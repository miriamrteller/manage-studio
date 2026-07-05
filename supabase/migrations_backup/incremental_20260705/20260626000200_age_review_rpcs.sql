-- =============================================================================
-- Age review request + admin approve/decline RPCs (PR B)
-- DEPENDENCIES: 20260626000100_age_engagement_helpers.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_age_ineligible_for_offering(
  p_person_id UUID,
  p_offering_id UUID,
  p_tenant_id UUID
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dob          DATE;
  v_min_age      INT;
  v_max_age      INT;
  v_season_start DATE;
  v_age          INT;
BEGIN
  SELECT p.date_of_birth, o.min_age, o.max_age, s.start_date
  INTO v_dob, v_min_age, v_max_age, v_season_start
  FROM people p
  JOIN offerings o ON o.id = p_offering_id AND o.tenant_id = p_tenant_id
  LEFT JOIN seasons s ON s.id = o.season_id
  WHERE p.id = p_person_id
    AND p.tenant_id = p_tenant_id;

  IF v_dob IS NULL
     OR v_season_start IS NULL
     OR (v_min_age IS NULL AND v_max_age IS NULL)
  THEN
    RAISE EXCEPTION 'AGE_ELIGIBLE';
  END IF;

  v_age := EXTRACT(YEAR FROM age(v_season_start, v_dob))::INT;

  IF (v_min_age IS NULL OR v_age >= v_min_age)
     AND (v_max_age IS NULL OR v_age <= v_max_age)
  THEN
    RAISE EXCEPTION 'AGE_ELIGIBLE';
  END IF;

  RETURN v_age;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_engagement_billing_account(
  p_tenant_id          UUID,
  p_student_person_id  UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_account_id UUID;
  v_payer_person_id    UUID;
  v_payer_account_id   UUID;
  v_billing_account_id UUID;
BEGIN
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

  SELECT account_id INTO v_payer_account_id
  FROM people
  WHERE id = v_payer_person_id;

  IF v_payer_account_id IS NOT NULL THEN
    SELECT id INTO v_billing_account_id
    FROM billing_accounts
    WHERE tenant_id = p_tenant_id
      AND account_id = v_payer_account_id
      AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_billing_account_id IS NULL THEN
    SELECT id INTO v_billing_account_id
    FROM billing_accounts
    WHERE tenant_id = p_tenant_id
      AND person_id = v_payer_person_id
      AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_billing_account_id IS NULL THEN
    INSERT INTO billing_accounts (tenant_id, account_id, person_id, status)
    VALUES (p_tenant_id, v_payer_account_id, v_payer_person_id, 'active')
    RETURNING id INTO v_billing_account_id;
  END IF;

  RETURN v_billing_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_can_request_age_review(
  p_person_id UUID,
  p_tenant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = p_tenant_id
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Use admin override, not review';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id = p_person_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Person not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = p_tenant_id
      AND person_id = p_person_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM people p
    WHERE p.id = p_person_id
      AND p.tenant_id = p_tenant_id
      AND p.account_id IN (SELECT get_my_account_ids())
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION public.request_age_review_engagement(
  p_person_id   UUID,
  p_offering_id UUID,
  p_season_id   UUID,
  p_note        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id          UUID;
  v_note               TEXT;
  v_age_snapshot       INT;
  v_billing_account_id UUID;
  v_engagement_id      UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  PERFORM assert_can_request_age_review(p_person_id, v_tenant_id);

  v_note := NULLIF(trim(p_note), '');
  IF v_note IS NULL OR length(v_note) < 10 OR length(v_note) > 1000 THEN
    RAISE EXCEPTION 'INVALID_NOTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM offerings
    WHERE id = p_offering_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Offering not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = p_season_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Season not found';
  END IF;

  v_age_snapshot := assert_age_ineligible_for_offering(p_person_id, p_offering_id, v_tenant_id);

  IF EXISTS (
    SELECT 1 FROM engagements
    WHERE tenant_id = v_tenant_id
      AND person_id = p_person_id
      AND offering_id = p_offering_id
      AND season_id = p_season_id
      AND status NOT IN ('cancelled', 'withdrawn')
  ) THEN
    RAISE EXCEPTION 'Duplicate engagement';
  END IF;

  v_billing_account_id := resolve_engagement_billing_account(v_tenant_id, p_person_id);

  INSERT INTO engagements (
    tenant_id,
    person_id,
    offering_id,
    season_id,
    billing_account_id,
    status,
    age_review_note,
    age_at_season_start
  )
  VALUES (
    v_tenant_id,
    p_person_id,
    p_offering_id,
    p_season_id,
    v_billing_account_id,
    'admin_review',
    v_note,
    v_age_snapshot
  )
  RETURNING id INTO v_engagement_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id,
    auth.uid(),
    'CREATE',
    'engagements',
    v_engagement_id,
    NULL,
    jsonb_build_object(
      'status', 'admin_review',
      'person_id', p_person_id,
      'offering_id', p_offering_id,
      'season_id', p_season_id,
      'age_at_season_start', v_age_snapshot
    )
  );

  RETURN jsonb_build_object('engagementId', v_engagement_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.guest_enrolment_request_age_review(
  p_subdomain         TEXT,
  p_student_person_id UUID,
  p_offering_id       UUID,
  p_season_id         UUID,
  p_note              TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id          UUID;
  v_note               TEXT;
  v_age_snapshot       INT;
  v_billing_account_id UUID;
  v_engagement_id      UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND tenant_id = v_tenant_id
        AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
    ) THEN
      RAISE EXCEPTION 'Use admin override, not review';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id = p_student_person_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Person not found';
  END IF;

  v_note := NULLIF(trim(p_note), '');
  IF v_note IS NULL OR length(v_note) < 10 OR length(v_note) > 1000 THEN
    RAISE EXCEPTION 'INVALID_NOTE';
  END IF;

  v_age_snapshot := assert_age_ineligible_for_offering(
    p_student_person_id,
    p_offering_id,
    v_tenant_id
  );

  IF EXISTS (
    SELECT 1 FROM engagements
    WHERE tenant_id = v_tenant_id
      AND person_id = p_student_person_id
      AND offering_id = p_offering_id
      AND season_id = p_season_id
      AND status NOT IN ('cancelled', 'withdrawn')
  ) THEN
    RAISE EXCEPTION 'Duplicate engagement';
  END IF;

  v_billing_account_id := resolve_engagement_billing_account(v_tenant_id, p_student_person_id);

  INSERT INTO engagements (
    tenant_id,
    person_id,
    offering_id,
    season_id,
    billing_account_id,
    status,
    age_review_note,
    age_at_season_start
  )
  VALUES (
    v_tenant_id,
    p_student_person_id,
    p_offering_id,
    p_season_id,
    v_billing_account_id,
    'admin_review',
    v_note,
    v_age_snapshot
  )
  RETURNING id INTO v_engagement_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id,
    auth.uid(),
    'CREATE',
    'engagements',
    v_engagement_id,
    NULL,
    jsonb_build_object(
      'status', 'admin_review',
      'person_id', p_student_person_id,
      'offering_id', p_offering_id,
      'season_id', p_season_id,
      'age_at_season_start', v_age_snapshot,
      'guest', true
    )
  );

  RETURN jsonb_build_object('engagementId', v_engagement_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_age_review_engagement(
  p_engagement_id UUID,
  p_admin_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  UUID;
  v_row        engagements%ROWTYPE;
  v_old_status TEXT;
  v_reason     TEXT;
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

  v_reason := NULLIF(trim(p_admin_reason), '');

  SELECT * INTO v_row
  FROM engagements
  WHERE id = p_engagement_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  v_old_status := v_row.status;

  IF v_row.status <> 'admin_review' THEN
    RAISE EXCEPTION 'Engagement is not pending age review';
  END IF;

  UPDATE engagements
  SET
    status              = 'pending_payment',
    age_override_at     = now(),
    age_override_by     = auth.uid(),
    age_override_reason = v_reason,
    updated_at          = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id,
    auth.uid(),
    'UPDATE',
    'engagements',
    v_row.id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object(
      'status', 'pending_payment',
      'age_override_at', v_row.age_override_at,
      'age_override_by', v_row.age_override_by,
      'transition', 'approve_age_review'
    )
  );

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_age_review_engagement(
  p_engagement_id UUID,
  p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  UUID;
  v_row        engagements%ROWTYPE;
  v_old_status TEXT;
  v_reason     TEXT;
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

  v_reason := COALESCE(NULLIF(trim(p_reason), ''), 'age_review_declined');

  SELECT * INTO v_row
  FROM engagements
  WHERE id = p_engagement_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  v_old_status := v_row.status;

  IF v_row.status <> 'admin_review' THEN
    RAISE EXCEPTION 'Engagement is not pending age review';
  END IF;

  UPDATE engagements
  SET
    status              = 'cancelled',
    cancelled_at        = now(),
    cancelled_by        = auth.uid(),
    cancellation_reason = v_reason,
    updated_at          = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id,
    auth.uid(),
    'UPDATE',
    'engagements',
    v_row.id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object(
      'status', 'cancelled',
      'cancellation_reason', v_reason,
      'transition', 'decline_age_review'
    )
  );

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_age_ineligible_for_offering(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_age_ineligible_for_offering(UUID, UUID, UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.request_age_review_engagement(UUID, UUID, UUID, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.guest_enrolment_request_age_review(TEXT, UUID, UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_enrolment_request_age_review(TEXT, UUID, UUID, UUID, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.approve_age_review_engagement(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_age_review_engagement(UUID, TEXT) TO authenticated;
