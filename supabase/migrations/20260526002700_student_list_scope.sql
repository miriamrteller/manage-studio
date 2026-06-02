-- Student list / search: family children or people with an active enrolment.
-- Excludes guardian-only adults who are not enrolled in any class.

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
  v_tenant_id UUID;
  v_normalized TEXT;
  v_digits TEXT;
  v_result JSONB;
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
      gp.id AS guardian_id,
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
      AND e.status IN ('active', 'pending_payment', 'admin_review', 'waitlisted')
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
      AND (
        s.account_id IS NOT NULL
        OR COALESCE(array_length(cn.names, 1), 0) > 0
      )
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
        'activeClassNames', to_jsonb(m.active_class_names)
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
