-- =============================================================================
-- 002200: Admin enrolment RPCs
-- search_enrolment_students            — fuzzy student search for admin enrolment.
-- admin_enrolment_lookup_email         — guardian lookup by email.
-- resolve_engagement_guardian          — guardian details for an engagement.
-- link_auth_user_to_guardian_for_engagement — portal provisioning post-payment.
-- DEPENDENCIES: 000200, 000300, 001300
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_enrolment_students(
  p_query TEXT,
  p_limit INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  UUID;
  v_normalized TEXT;
  v_digits     TEXT;
  v_result     JSONB;
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

  v_normalized := lower(trim(p_query));
  IF v_normalized = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  v_digits := regexp_replace(v_normalized, '[^0-9]', '', 'g');

  WITH guardians AS (
    SELECT DISTINCT ON (am.account_id)
      am.account_id,
      gp.id   AS guardian_id,
      gp.name AS guardian_name,
      gp.email AS guardian_email,
      gp.emergency_contact_phone AS guardian_phone
    FROM account_members am
    JOIN people gp ON gp.id = am.person_id AND gp.tenant_id = am.tenant_id
    WHERE am.tenant_id = v_tenant_id
      AND am.role = 'account_holder'
    ORDER BY am.account_id, am.created_at
  ),
  class_names AS (
    SELECT
      e.person_id,
      array_agg(DISTINCT o.name ORDER BY o.name) AS names
    FROM engagements e
    JOIN offerings o ON o.id = e.offering_id AND o.tenant_id = e.tenant_id
    WHERE e.tenant_id = v_tenant_id
      AND e.status IN ('active', 'pending_payment', 'admin_review', 'pending_waiver')
    GROUP BY e.person_id
  ),
  enriched AS (
    SELECT
      s.id,
      s.tenant_id,
      s.user_profile_id,
      s.account_id,
      s.name,
      s.email,
      s.date_of_birth,
      s.medical_notes,
      s.allergies,
      s.emergency_contact_name,
      s.emergency_contact_phone,
      s.photo_consent,
      s.media_consent,
      s.status,
      s.waiver_accepted_at,
      s.waiver_version,
      s.created_at,
      s.updated_at,
      ac.name AS account_name,
      g.guardian_name,
      g.guardian_email,
      g.guardian_phone,
      COALESCE(cn.names, ARRAY[]::TEXT[]) AS active_class_names,
      CASE
        WHEN s.date_of_birth IS NOT NULL THEN
          EXTRACT(YEAR FROM age(CURRENT_DATE, s.date_of_birth))::INT
        ELSE NULL
      END AS age_years,
      EXISTS (
        SELECT 1
        FROM account_members am2
        WHERE am2.tenant_id = s.tenant_id
          AND am2.person_id = s.id
          AND am2.role = 'account_holder'
      ) AS is_account_holder,
      COALESCE(
        s.account_id,
        (
          SELECT am3.account_id
          FROM account_members am3
          WHERE am3.tenant_id = s.tenant_id
            AND am3.person_id = s.id
            AND am3.role = 'account_holder'
          LIMIT 1
        )
      ) AS family_account_id,
      lower(concat_ws(' ',
        s.name,
        s.email,
        s.emergency_contact_name,
        s.emergency_contact_phone,
        regexp_replace(COALESCE(s.emergency_contact_phone, ''), '[^0-9]', '', 'g'),
        ac.name,
        g.guardian_name,
        g.guardian_email,
        g.guardian_phone,
        regexp_replace(COALESCE(g.guardian_phone, ''), '[^0-9]', '', 'g'),
        array_to_string(COALESCE(cn.names, ARRAY[]::TEXT[]), ' ')
      )) AS search_blob
    FROM people s
    LEFT JOIN accounts ac ON ac.id = s.account_id AND ac.tenant_id = s.tenant_id
    LEFT JOIN guardians g ON g.account_id = s.account_id
    LEFT JOIN class_names cn ON cn.person_id = s.id
    WHERE s.tenant_id = v_tenant_id
      AND s.status = 'active'
  ),
  tokens AS (
    SELECT trim(t) AS token
    FROM regexp_split_to_table(v_normalized, '\s+') AS t
    WHERE trim(t) <> ''
  ),
  matched AS (
    SELECT e.*
    FROM enriched e
    WHERE NOT EXISTS (
      SELECT 1
      FROM tokens tok
      WHERE NOT (
        e.search_blob LIKE '%' || tok.token || '%'
        OR (
          tok.token ~ '^\d+$'
          AND tok.token !~ '^0'
          AND e.age_years IS NOT NULL
          AND e.age_years = tok.token::INT
        )
        OR (
          length(v_digits) >= 3
          AND (
            regexp_replace(COALESCE(e.emergency_contact_phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%'
            OR regexp_replace(COALESCE(e.guardian_phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%'
            OR e.search_blob LIKE '%' || v_digits || '%'
          )
        )
      )
    )
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'person', jsonb_build_object(
          'id', m.id,
          'tenant_id', m.tenant_id,
          'user_profile_id', m.user_profile_id,
          'account_id', m.account_id,
          'name', m.name,
          'email', m.email,
          'date_of_birth', m.date_of_birth,
          'medical_notes', m.medical_notes,
          'allergies', m.allergies,
          'emergency_contact_name', m.emergency_contact_name,
          'emergency_contact_phone', m.emergency_contact_phone,
          'photo_consent', m.photo_consent,
          'media_consent', m.media_consent,
          'status', m.status,
          'waiver_accepted_at', m.waiver_accepted_at,
          'waiver_version', m.waiver_version,
          'created_at', m.created_at,
          'updated_at', m.updated_at
        ),
        'accountName', m.account_name,
        'guardianName', m.guardian_name,
        'guardianEmail', m.guardian_email,
        'guardianPhone', m.guardian_phone,
        'emergencyContactName', m.emergency_contact_name,
        'emergencyContactPhone', m.emergency_contact_phone,
        'activeClassNames', to_jsonb(m.active_class_names),
        'isAccountHolder', m.is_account_holder,
        'familyAccountId', m.family_account_id
      )
      ORDER BY m.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT * FROM matched ORDER BY name LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 15), 50))
  ) m;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_enrolment_students(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_enrolment_lookup_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_row       RECORD;
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

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT
    p.id   AS guardian_person_id,
    p.name AS guardian_name,
    p.email AS guardian_email,
    COALESCE(am.account_id, ac.id) AS account_id
  INTO v_row
  FROM people p
  LEFT JOIN account_members am
    ON am.person_id = p.id
    AND am.tenant_id = p.tenant_id
    AND am.role = 'account_holder'
  LEFT JOIN accounts ac
    ON ac.person_id = p.id
    AND ac.tenant_id = p.tenant_id
  WHERE p.tenant_id = v_tenant_id
    AND p.email IS NOT NULL
    AND lower(trim(p.email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_row IS NULL OR v_row.account_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'guardianPersonId', v_row.guardian_person_id,
    'accountId', v_row.account_id,
    'guardianName', v_row.guardian_name,
    'guardianEmail', v_row.guardian_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_enrolment_lookup_email(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_engagement_guardian(p_engagement_id UUID)
RETURNS TABLE (
  guardian_person_id UUID,
  guardian_email     TEXT,
  guardian_name      TEXT,
  student_person_id  UUID,
  account_id         UUID
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
  v_uid            UUID := auth.uid();
  v_auth_email     TEXT;
  v_guardian_id    UUID;
  v_guardian_email TEXT;
  v_account_id     UUID;
  v_is_admin       BOOLEAN;
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
      AND status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'pending_waiver')
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
