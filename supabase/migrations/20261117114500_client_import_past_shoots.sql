-- =============================================================================
-- Past shoots from the client import (owner, 17 Nov 2026).
--
-- A photographer's old clients each had a shoot before OpalSwift. The client
-- sheet can now carry a "Shoot" column (the same name on every row) and an
-- optional "Shoot date" column. Each client on the sheet gets one finished
-- (delivered) shoot with that name:
--   * a client already in OpalSwift (same email or phone, or a same-name client
--     the studio did not add again) is not added twice: the shoot goes on them;
--   * the package is the studio's package with that name; when there is none, a
--     package with that name is added, hidden from the Book page;
--   * running the import again never adds a second shoot: a client who already
--     has a shoot on that package (same day, or either undated) is left alone;
--   * nothing is emailed: imported shoots are left out of every shoot email.
--
-- client_import_shoots records the shoots an import added.
-- import_clients keeps its signature; each client may carry
--   person_id  the existing client the screen matched (optional)
--   shoots     [{ "name", "date": 'YYYY-MM-DD' | null }] (optional)
-- and the result adds "shoots" (how many shoots were added).
-- ADDITIVE: new table, column and helpers; two functions replaced.
-- DEPENDENCIES: 20261113070306_client_spreadsheet_import.sql,
--               20261115090000_gallery_ready_when_paid.sql
-- =============================================================================

ALTER TABLE client_import_batches ADD COLUMN IF NOT EXISTS shoots_count INT NOT NULL DEFAULT 0;

CREATE TABLE client_import_shoots (
  engagement_id UUID        PRIMARY KEY REFERENCES engagements(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id      UUID        NOT NULL REFERENCES client_import_batches(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_import_shoots_batch ON client_import_shoots(batch_id);
CREATE INDEX idx_client_import_shoots_tenant ON client_import_shoots(tenant_id);

COMMENT ON TABLE client_import_shoots IS
  'Past shoots added by a client import. Written only by import_clients; these shoots never send shoot emails.';

ALTER TABLE client_import_shoots ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_import_shoots_super_admin ON client_import_shoots
  FOR ALL USING (is_super_admin());
CREATE POLICY client_import_shoots_admin_select ON client_import_shoots
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role))
  );

GRANT SELECT ON public.client_import_shoots TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.client_import_shoots FROM authenticated;
REVOKE ALL ON public.client_import_shoots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_import_shoots TO service_role;

-- -----------------------------------------------------------------------------
-- client_import_shoot_package(tenant, name): the studio's package with this
-- name (case and spaces ignored), or a new one hidden from the Book page.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_import_shoot_package(p_tenant_id UUID, p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := left(NULLIF(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), ''), 200);
  v_id   UUID;
BEGIN
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'shoot name is required';
  END IF;
  SELECT o.id INTO v_id FROM offerings o
  WHERE o.tenant_id = p_tenant_id
    AND o.offering_type = 'appointment'
    AND lower(regexp_replace(trim(o.name), '\s+', ' ', 'g')) = lower(v_name)
  ORDER BY (o.status = 'active') DESC, o.created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO offerings (
      tenant_id, name, offering_type, duration_mins, max_capacity, price_minor,
      is_public, waiver_required, season_id
    )
    VALUES (p_tenant_id, v_name, 'appointment', 60, 1, 0, false, false, NULL)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_import_shoot_package(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- client_import_add_shoots(tenant, batch, person, shoots): adds each past shoot
-- the client does not have yet, as delivered. Returns how many were added.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_import_add_shoots(
  p_tenant_id UUID,
  p_batch_id  UUID,
  p_person_id UUID,
  p_shoots    JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shoot       JSONB;
  v_offering_id UUID;
  v_date        DATE;
  v_starts      TIMESTAMPTZ;
  v_client      RECORD;
  v_eng_id      UUID;
  v_added       INT := 0;
BEGIN
  IF p_shoots IS NULL OR jsonb_typeof(p_shoots) <> 'array' OR jsonb_array_length(p_shoots) = 0 THEN
    RETURN 0;
  END IF;
  IF jsonb_array_length(p_shoots) > 50 THEN
    RAISE EXCEPTION 'at most 50 shoots per client';
  END IF;

  -- The client model a shoot needs (an account), as a new shoot makes it.
  SELECT * INTO v_client FROM job_resolve_client(p_tenant_id, p_person_id, NULL, NULL, NULL);

  FOR v_shoot IN SELECT value FROM jsonb_array_elements(p_shoots) LOOP
    CONTINUE WHEN jsonb_typeof(v_shoot) <> 'object'
              OR NULLIF(trim(coalesce(v_shoot->>'name', '')), '') IS NULL;
    v_offering_id := client_import_shoot_package(p_tenant_id, v_shoot->>'name');

    BEGIN
      v_date := NULLIF(v_shoot->>'date', '')::date;
    EXCEPTION WHEN others THEN
      v_date := NULL;
    END;
    -- Past shoots only: a date after today (or before 1900) is left out.
    IF v_date IS NOT NULL
       AND (v_date > (now() AT TIME ZONE 'Asia/Jerusalem')::date OR v_date < DATE '1900-01-01') THEN
      v_date := NULL;
    END IF;

    -- Never twice: a shoot on this package on the same day, or either undated.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM engagements e
      JOIN job_details jd ON jd.engagement_id = e.id
      WHERE e.tenant_id = p_tenant_id
        AND e.person_id = v_client.person_id
        AND e.offering_id = v_offering_id
        AND e.status <> 'cancelled'
        AND (v_date IS NULL OR e.booked_starts_at IS NULL
             OR (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date = v_date)
    );

    v_starts := CASE WHEN v_date IS NULL THEN NULL
                     ELSE (v_date + TIME '10:00') AT TIME ZONE 'Asia/Jerusalem' END;
    v_eng_id := job_insert(p_tenant_id, v_client.person_id, v_offering_id, v_starts, NULL, NULL, NULL, NULL);
    UPDATE job_details
    SET job_status = 'delivered', auto_status = 'delivered'
    WHERE engagement_id = v_eng_id;
    INSERT INTO client_import_shoots (engagement_id, tenant_id, batch_id)
    VALUES (v_eng_id, p_tenant_id, p_batch_id);
    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.client_import_add_shoots(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- import_clients: as before, plus person_id and shoots on each client (above).
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
  v_shoots       INT := 0;
  v_existing_id  UUID;
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

    -- Already a client? The screen sends person_id for a client it matched (email,
    -- phone, or a same-name client the studio did not add again); otherwise the same
    -- email or phone, including earlier rows of this sheet. The client is not added
    -- again, but their past shoots are.
    v_existing_id := NULL;
    IF NULLIF(v_row->>'person_id', '') IS NOT NULL THEN
      BEGIN
        SELECT p.id INTO v_existing_id FROM people p
        WHERE p.id = (v_row->>'person_id')::uuid AND p.tenant_id = v_tenant_id;
      EXCEPTION WHEN invalid_text_representation THEN
        v_existing_id := NULL;
      END;
      IF v_existing_id IS NULL THEN
        RAISE EXCEPTION 'client %: client not found', v_idx;
      END IF;
    ELSE
      SELECT f.person_id INTO v_existing_id FROM client_import_find_client(v_tenant_id, v_email, v_phone) f;
    END IF;
    IF v_existing_id IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      v_shoots := v_shoots + client_import_add_shoots(v_tenant_id, v_batch_id, v_existing_id, v_row->'shoots');
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

    v_shoots := v_shoots + client_import_add_shoots(v_tenant_id, v_batch_id, v_person_id, v_row->'shoots');
    v_clients := v_clients + 1;
  END LOOP;

  UPDATE client_import_batches
  SET clients_count = v_clients, students_count = v_students, skipped_count = v_skipped,
      shoots_count = v_shoots
  WHERE id = v_batch_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (
    v_tenant_id, v_uid, 'INSERT', 'client_import_batches', v_batch_id,
    jsonb_build_object('clients', v_clients, 'students', v_students, 'skipped', v_skipped, 'shoots', v_shoots)
  );

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'clients', v_clients,
    'students', v_students,
    'skipped', v_skipped,
    'shoots', v_shoots
  );
END;
$$;

-- Same signature: the grants from 20261113070306 are kept.

-- -----------------------------------------------------------------------------
-- Shoot emails: as in 20261115090000, but past shoots from an import are left out.
-- Same signature: grants are kept.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_due_shoot_emails(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
  email_key TEXT, tenant_id UUID, engagement_id UUID, recipient_email TEXT, recipient_name TEXT,
  shoot_starts_at TIMESTAMPTZ, location TEXT, gallery_url TEXT, offering_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_today DATE := (p_now AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  RETURN QUERY
  WITH shoots AS (
    SELECT e.id AS engagement_id, e.tenant_id, e.booked_starts_at,
           (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date AS shoot_day,
           jd.job_status, jd.gallery_url,
           COALESCE(jd.gallery_released_at, jd.gallery_shared_at) AS gallery_released_at,
           (jd.gallery_released_at IS NOT NULL OR job_payment_requests_all_paid(jd.engagement_id)) AS gallery_visible,
           COALESCE(jd.location, o.location) AS location, o.name AS offering_name,
           COALESCE(p.email, pp.email) AS email, COALESCE(p.name, pp.name) AS name
    FROM job_details jd
    JOIN engagements e ON e.id = jd.engagement_id
    JOIN people p      ON p.id = e.person_id
    LEFT JOIN accounts a ON a.id = p.account_id
    LEFT JOIN people pp  ON pp.id = a.person_id
    LEFT JOIN offerings o ON o.id = e.offering_id
    WHERE jd.job_status <> 'cancelled' AND e.status <> 'cancelled'
      -- Past shoots added by a client import never send an email.
      AND NOT EXISTS (SELECT 1 FROM client_import_shoots cis WHERE cis.engagement_id = jd.engagement_id)
  ), due AS (
    SELECT 'shoot_reminder'::text AS k, s.* FROM shoots s
    WHERE s.job_status = 'booked' AND s.shoot_day BETWEEN v_today + 1 AND v_today + 2
    UNION ALL
    SELECT 'shoot_thank_you', s.* FROM shoots s
    WHERE s.job_status IN ('booked', 'shot', 'editing', 'delivered')
      AND s.shoot_day BETWEEN v_today - 3 AND v_today - 1
    UNION ALL
    SELECT 'gallery_ready', s.* FROM shoots s
    WHERE s.gallery_released_at IS NOT NULL AND s.gallery_url IS NOT NULL AND s.gallery_visible
      AND s.gallery_released_at BETWEEN p_now - interval '7 days' AND p_now
    UNION ALL
    -- Review request: 5 days after the gallery is shared (window to 12 days
    -- tolerates missed runs), only when the studio has added a review link.
    SELECT 'review_request', s.* FROM shoots s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.gallery_released_at IS NOT NULL AND s.gallery_visible
      AND NULLIF(trim(t.review_url), '') IS NOT NULL
      AND s.gallery_released_at BETWEEN p_now - interval '12 days' AND p_now - interval '5 days'
  )
  SELECT d.k, d.tenant_id, d.engagement_id, d.email, d.name, d.booked_starts_at,
         d.location, d.gallery_url, d.offering_name
  FROM due d
  WHERE d.email IS NOT NULL
    AND is_automatic_email_enabled(d.tenant_id, d.k)
    AND NOT EXISTS (
      SELECT 1 FROM automatic_email_log l
      WHERE l.email_key = d.k AND l.engagement_id = d.engagement_id
        AND (l.status = 'sent' OR l.attempts >= 3))
  LIMIT 200;
END;
$$;
