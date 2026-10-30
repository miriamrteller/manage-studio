-- =============================================================================
-- 20261030000400: client search also matches the WhatsApp number
--
-- search_enrolment_students only matched phones in people.emergency_contact_phone
-- (or the guardian's). Photographer clients keep their phone in
-- contact_preferences.whatsapp_number (job_store_client_phone, 000100), so the
-- "New shoot" client search found nobody by phone.
--
-- Same function, two additions: the person's contact_preferences.whatsapp_number
-- joins the search text and the digits-only phone match, and a local Israeli
-- number typed as 054… also matches a WhatsApp number stored as +972 54…. Additive only: every
-- row that matched before still matches, with the same output shape, so the
-- dance enrolment search is unchanged apart from also finding parents by their
-- WhatsApp number.
--
-- ADDITIVE MIGRATION (SPEC §2.5.3). DEPENDENCIES: 002200, 000400 (contact_preferences).
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
  v_digits_il  TEXT;
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
  -- Israeli local form (054…) also matches the stored international form (+972 54…).
  v_digits_il := CASE WHEN v_digits ~ '^0[1-9]' THEN '972' || substr(v_digits, 2) ELSE v_digits END;

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
      cp.whatsapp_number,
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
        cp.whatsapp_number,
        regexp_replace(COALESCE(cp.whatsapp_number, ''), '[^0-9]', '', 'g'),
        array_to_string(COALESCE(cn.names, ARRAY[]::TEXT[]), ' ')
      )) AS search_blob
    FROM people s
    LEFT JOIN accounts ac ON ac.id = s.account_id AND ac.tenant_id = s.tenant_id
    LEFT JOIN guardians g ON g.account_id = s.account_id
    LEFT JOIN class_names cn ON cn.person_id = s.id
    LEFT JOIN LATERAL (
      SELECT p.whatsapp_number
      FROM contact_preferences p
      WHERE p.person_id = s.id AND p.tenant_id = s.tenant_id
      LIMIT 1
    ) cp ON true
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
            OR regexp_replace(COALESCE(e.whatsapp_number, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%'
            OR regexp_replace(COALESCE(e.whatsapp_number, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits_il || '%'
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
