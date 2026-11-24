-- =============================================================================
-- Import clients from a spreadsheet (owner, 13 Nov 2026).
--
-- * client_import_batches: one row per imported sheet (file name, counts).
-- * client_import_people: every person an import added. The studio login page
--   uses it so an imported client with an email can sign in (client-sign-in
--   "prepare"), the same as a booked client. Nothing is emailed on import.
-- * client_import_matches: for the import screen's duplicate check. Which rows
--   are already clients (same email or phone) or share a name with one.
-- * import_clients: adds the clients in one transaction, the same records a
--   studio makes by hand:
--     photographer studios  client + their own account (like a new shoot);
--                           phone kept in contact_preferences. No families.
--     family studios        a row with students: parent, family account and
--                           students (like admin enrolment);
--     everyone else         an adult client (like guest adult enrolment).
--   Rows whose email or phone already belongs to a client are skipped.
--
-- ADDITIVE: new tables and functions only.
-- =============================================================================

CREATE TABLE client_import_batches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name      TEXT        NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  sheet_name     TEXT        CHECK (sheet_name IS NULL OR char_length(sheet_name) <= 255),
  mapping        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  clients_count  INT         NOT NULL DEFAULT 0,
  students_count INT         NOT NULL DEFAULT 0,
  skipped_count  INT         NOT NULL DEFAULT 0,
  created_by     UUID        NOT NULL REFERENCES user_profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_import_batches_tenant ON client_import_batches(tenant_id, created_at DESC);
CREATE INDEX idx_client_import_batches_created_by ON client_import_batches(created_by);

COMMENT ON TABLE client_import_batches IS
  'One imported client spreadsheet tab. Written only by import_clients.';

CREATE TABLE client_import_people (
  person_id  UUID        PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id   UUID        NOT NULL REFERENCES client_import_batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_import_people_batch ON client_import_people(batch_id);
CREATE INDEX idx_client_import_people_tenant ON client_import_people(tenant_id);

COMMENT ON TABLE client_import_people IS
  'People added by a client import. Lets an imported client with an email sign in at the studio (client-sign-in prepare).';

ALTER TABLE client_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_import_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_import_batches_super_admin ON client_import_batches
  FOR ALL USING (is_super_admin());
CREATE POLICY client_import_batches_admin_select ON client_import_batches
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role))
  );

CREATE POLICY client_import_people_super_admin ON client_import_people
  FOR ALL USING (is_super_admin());
CREATE POLICY client_import_people_admin_select ON client_import_people
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role))
  );

-- Prod gives new tables no rights by default: grant what each role needs.
GRANT SELECT ON public.client_import_batches TO authenticated;
GRANT SELECT ON public.client_import_people TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.client_import_batches FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.client_import_people FROM authenticated;
REVOKE ALL ON public.client_import_batches FROM anon;
REVOKE ALL ON public.client_import_people FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_import_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_import_people TO service_role;

-- -----------------------------------------------------------------------------
-- client_import_phone_key: a phone number reduced to digits, Israeli +972 as 0,
-- for matching ("+972 50-123-4567" = "050 1234567"). NULL when too short.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_import_phone_key(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN char_length(k) >= 7 THEN k END
  FROM (
    SELECT CASE
      WHEN d LIKE '00972%' THEN '0' || substr(d, 6)
      WHEN d LIKE '972%' AND char_length(d) >= 11 THEN '0' || substr(d, 4)
      ELSE d
    END AS k
    FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS d) s
  ) t;
$$;

-- Fast duplicate checks (email, phone) during an import.
CREATE INDEX IF NOT EXISTS idx_people_tenant_lower_email ON people (tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_people_tenant_phone_key
  ON people (tenant_id, client_import_phone_key(emergency_contact_phone));
CREATE INDEX IF NOT EXISTS idx_contact_preferences_tenant_phone_key
  ON contact_preferences (tenant_id, client_import_phone_key(whatsapp_number));

-- The existing client a row matches: same email, else same phone. NULL when none.
CREATE OR REPLACE FUNCTION public.client_import_find_client(
  p_tenant_id UUID,
  p_email     TEXT,
  p_phone     TEXT
)
RETURNS TABLE (person_id UUID, name TEXT, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := NULLIF(lower(trim(coalesce(p_email, ''))), '');
  v_phone TEXT := client_import_phone_key(p_phone);
BEGIN
  IF v_email IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.name, 'email'::text FROM people p
      WHERE p.tenant_id = p_tenant_id AND lower(p.email) = v_email
      ORDER BY p.created_at LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF v_phone IS NOT NULL THEN
    RETURN QUERY
      SELECT m.id, m.name, 'phone'::text FROM (
        SELECT p.id, p.name, p.created_at FROM people p
        WHERE p.tenant_id = p_tenant_id AND client_import_phone_key(p.emergency_contact_phone) = v_phone
        UNION
        SELECT p.id, p.name, p.created_at FROM contact_preferences cp
        JOIN people p ON p.id = cp.person_id
        WHERE cp.tenant_id = p_tenant_id AND client_import_phone_key(cp.whatsapp_number) = v_phone
      ) m
      ORDER BY m.created_at LIMIT 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.client_import_find_client(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Studio admin check shared by the two functions below. Returns the studio id.
CREATE OR REPLACE FUNCTION public.client_import_admin_tenant()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_import_admin_tenant() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- client_import_matches(p_clients)
--
-- p_clients: [{ "name", "email", "phone" }, ...] as the screen will import them.
-- Returns [{ "index": 0-based, "person_id", "name", "reason": email|phone|name }]
-- for rows that are already a client (email, phone) or share a client's name.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_import_matches(p_clients JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID := client_import_admin_tenant();
  v_row       JSONB;
  v_idx       INT := -1;
  v_match     RECORD;
  v_out       JSONB := '[]'::jsonb;
BEGIN
  IF p_clients IS NULL OR jsonb_typeof(p_clients) <> 'array' THEN
    RAISE EXCEPTION 'clients must be an array';
  END IF;
  IF jsonb_array_length(p_clients) > 10000 THEN
    RAISE EXCEPTION 'at most 10000 clients per import';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_clients) LOOP
    v_idx := v_idx + 1;
    SELECT * INTO v_match FROM client_import_find_client(v_tenant_id, v_row->>'email', v_row->>'phone');
    IF v_match.person_id IS NULL AND NULLIF(trim(coalesce(v_row->>'name', '')), '') IS NOT NULL THEN
      SELECT p.id AS person_id, p.name, 'name'::text AS reason INTO v_match
      FROM people p
      WHERE p.tenant_id = v_tenant_id
        AND lower(trim(p.name)) = lower(trim(v_row->>'name'))
        AND p.status = 'active'
      ORDER BY p.created_at LIMIT 1;
    END IF;
    IF v_match.person_id IS NOT NULL THEN
      v_out := v_out || jsonb_build_object(
        'index', v_idx, 'person_id', v_match.person_id, 'name', v_match.name, 'reason', v_match.reason
      );
    END IF;
    v_match := NULL;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.client_import_matches(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_import_matches(JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- import_clients(p_file_name, p_sheet_name, p_mapping, p_clients)
--
-- p_clients: array of objects, already cleaned by the import screen:
--   name          client (or parent) name, required
--   email         optional; kept only when it looks like an email
--   phone         optional
--   family_name   optional family account name (family studios, with students)
--   students      optional [{ "name", "date_of_birth": 'YYYY-MM-DD' | null }]
--                 (family studios only; ignored elsewhere)
-- Returns { batch_id, clients, students, skipped }.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_clients(
  p_file_name  TEXT,
  p_sheet_name TEXT,
  p_mapping    JSONB,
  p_clients    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant_id    UUID := client_import_admin_tenant();
  v_photographer BOOLEAN;
  v_families     BOOLEAN;
  v_batch_id     UUID;
  v_row          JSONB;
  v_student      JSONB;
  v_idx          INT := 0;
  v_name         TEXT;
  v_email        TEXT;
  v_phone        TEXT;
  v_family_name  TEXT;
  v_student_name TEXT;
  v_dob          DATE;
  v_person_id    UUID;
  v_account_id   UUID;
  v_child_id     UUID;
  v_has_students BOOLEAN;
  v_clients      INT := 0;
  v_students     INT := 0;
  v_skipped      INT := 0;
BEGIN
  IF p_clients IS NULL OR jsonb_typeof(p_clients) <> 'array' THEN
    RAISE EXCEPTION 'clients must be an array';
  END IF;
  IF jsonb_array_length(p_clients) = 0 THEN
    RAISE EXCEPTION 'no clients to import';
  END IF;
  IF jsonb_array_length(p_clients) > 10000 THEN
    RAISE EXCEPTION 'at most 10000 clients per import';
  END IF;

  SELECT t.skin = 'photographer', t.family_accounts AND coalesce(t.skin, '') <> 'photographer'
  INTO v_photographer, v_families
  FROM tenants t WHERE t.id = v_tenant_id;

  INSERT INTO client_import_batches (tenant_id, file_name, sheet_name, mapping, created_by)
  VALUES (
    v_tenant_id,
    left(coalesce(nullif(trim(p_file_name), ''), 'spreadsheet'), 255),
    left(nullif(trim(p_sheet_name), ''), 255),
    CASE WHEN jsonb_typeof(p_mapping) = 'object' THEN p_mapping ELSE '{}'::jsonb END,
    v_uid
  )
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_clients) LOOP
    v_idx := v_idx + 1;
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'client %: must be an object', v_idx;
    END IF;
    v_name := left(NULLIF(trim(coalesce(v_row->>'name', '')), ''), 200);
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'client %: name is required', v_idx;
    END IF;
    v_email := NULLIF(lower(trim(coalesce(v_row->>'email', ''))), '');
    IF v_email IS NOT NULL AND (char_length(v_email) > 320 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      v_email := NULL;
    END IF;
    v_phone := left(NULLIF(trim(coalesce(v_row->>'phone', '')), ''), 40);

    -- Already a client (same email or phone, including earlier rows of this sheet)? Skip.
    IF EXISTS (SELECT 1 FROM client_import_find_client(v_tenant_id, v_email, v_phone)) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_has_students := v_families
      AND jsonb_typeof(v_row->'students') = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_row->'students') s
        WHERE NULLIF(trim(coalesce(s->>'name', '')), '') IS NOT NULL
      );

    IF v_photographer THEN
      -- The client a new shoot makes (job_resolve_client): their own account.
      INSERT INTO people (tenant_id, name, email, status)
      VALUES (v_tenant_id, v_name, v_email, 'active')
      RETURNING id INTO v_person_id;
      INSERT INTO accounts (tenant_id, name, person_id)
      VALUES (v_tenant_id, v_name, v_person_id)
      RETURNING id INTO v_account_id;
      UPDATE people SET account_id = v_account_id, updated_at = now() WHERE id = v_person_id;
      INSERT INTO account_members (tenant_id, account_id, person_id, role, user_profile_id)
      VALUES (v_tenant_id, v_account_id, v_person_id, 'account_holder', NULL);
      PERFORM job_store_client_phone(v_tenant_id, v_person_id, v_phone);
      INSERT INTO client_import_people (person_id, tenant_id, batch_id)
      VALUES (v_person_id, v_tenant_id, v_batch_id);

    ELSIF v_has_students THEN
      -- The family admin enrolment makes: parent, family account, students.
      INSERT INTO people (tenant_id, name, email, emergency_contact_phone, status)
      VALUES (v_tenant_id, v_name, v_email, v_phone, 'active')
      RETURNING id INTO v_person_id;
      v_family_name := left(coalesce(NULLIF(trim(coalesce(v_row->>'family_name', '')), ''), v_name), 200);
      INSERT INTO accounts (tenant_id, name, person_id)
      VALUES (v_tenant_id, v_family_name, v_person_id)
      RETURNING id INTO v_account_id;
      INSERT INTO account_members (tenant_id, account_id, person_id, role, user_profile_id)
      VALUES (v_tenant_id, v_account_id, v_person_id, 'account_holder', NULL);
      INSERT INTO client_import_people (person_id, tenant_id, batch_id)
      VALUES (v_person_id, v_tenant_id, v_batch_id);

      FOR v_student IN SELECT value FROM jsonb_array_elements(v_row->'students') LOOP
        v_student_name := left(NULLIF(trim(coalesce(v_student->>'name', '')), ''), 200);
        CONTINUE WHEN v_student_name IS NULL;
        BEGIN
          v_dob := NULLIF(v_student->>'date_of_birth', '')::date;
        EXCEPTION WHEN others THEN
          v_dob := NULL;
        END;
        IF v_dob IS NOT NULL AND (v_dob > current_date OR v_dob < DATE '1900-01-01') THEN
          v_dob := NULL;
        END IF;
        INSERT INTO people (tenant_id, name, date_of_birth, account_id, status)
        VALUES (v_tenant_id, v_student_name, v_dob, v_account_id, 'active')
        RETURNING id INTO v_child_id;
        INSERT INTO client_import_people (person_id, tenant_id, batch_id)
        VALUES (v_child_id, v_tenant_id, v_batch_id);
        v_students := v_students + 1;
      END LOOP;

    ELSE
      -- An adult client, as guest adult enrolment makes them.
      INSERT INTO people (tenant_id, name, email, emergency_contact_phone, status)
      VALUES (v_tenant_id, v_name, v_email, v_phone, 'active')
      RETURNING id INTO v_person_id;
      INSERT INTO client_import_people (person_id, tenant_id, batch_id)
      VALUES (v_person_id, v_tenant_id, v_batch_id);
    END IF;

    v_clients := v_clients + 1;
  END LOOP;

  UPDATE client_import_batches
  SET clients_count = v_clients, students_count = v_students, skipped_count = v_skipped
  WHERE id = v_batch_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (
    v_tenant_id, v_uid, 'INSERT', 'client_import_batches', v_batch_id,
    jsonb_build_object('clients', v_clients, 'students', v_students, 'skipped', v_skipped)
  );

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'clients', v_clients,
    'students', v_students,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_clients(TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_clients(TEXT, TEXT, JSONB, JSONB) TO authenticated;
