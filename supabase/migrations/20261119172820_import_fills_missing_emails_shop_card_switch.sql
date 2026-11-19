-- =============================================================================
-- 19 Nov 2026 (photographer reports):
--
-- 1. Client import fills in a missing email. A row that matches a client already
--    in OpalSwift used to leave that client as it was, so a client imported first
--    without an email kept none even after a sheet with emails was imported again,
--    and Send gallery said "no client email". Now, when the existing client has no
--    email and the row has one that no other client of the studio uses, the email
--    is saved. An email already there is never changed. import_clients returns
--    "emails_added" (how many). Same signature: grants are kept.
--
-- 2. Photo shop card payments switch (owner: card payments off until they are set
--    up). tenant_photo_shop_settings.card_payments, off by default: clients then
--    only see "Pay the studio directly". The studio switches it on in
--    Settings > Payment > Photo shop. client-photo-shop refuses card while off.
--
-- ADDITIVE. DEPENDENCIES: 20261118192450_client_import_smugmug_galleries.sql
-- =============================================================================

ALTER TABLE tenant_photo_shop_settings
  ADD COLUMN IF NOT EXISTS card_payments BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN tenant_photo_shop_settings.card_payments IS
  'Photo shop: clients may also pay by card. Off (default): clients only pay the studio directly (cash, bank transfer or other).';

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
  v_links        JSONB := '[]'::jsonb;
  v_emails_added INT := 0;
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
      -- The client has no email yet and this row has one that no other client uses:
      -- keep it, so the studio can email them (19 Nov 2026: a re-imported sheet's
      -- emails were dropped, and Send gallery said "no client email").
      IF v_email IS NOT NULL THEN
        UPDATE people p SET email = v_email, updated_at = now()
        WHERE p.id = v_existing_id
          AND NULLIF(trim(coalesce(p.email, '')), '') IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM people o
            WHERE o.tenant_id = v_tenant_id AND o.id <> v_existing_id AND lower(o.email) = v_email
          );
        IF FOUND THEN
          v_emails_added := v_emails_added + 1;
        END IF;
      END IF;
      v_shoots := v_shoots + client_import_add_shoots(v_tenant_id, v_batch_id, v_existing_id, v_row->'shoots');
      v_links := v_links || client_import_shoot_links(v_tenant_id, v_idx - 1, v_existing_id, v_row->'shoots');
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
    v_links := v_links || client_import_shoot_links(v_tenant_id, v_idx - 1, v_person_id, v_row->'shoots');
    v_clients := v_clients + 1;
  END LOOP;

  UPDATE client_import_batches
  SET clients_count = v_clients, students_count = v_students, skipped_count = v_skipped,
      shoots_count = v_shoots
  WHERE id = v_batch_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (
    v_tenant_id, v_uid, 'INSERT', 'client_import_batches', v_batch_id,
    jsonb_build_object('clients', v_clients, 'students', v_students, 'skipped', v_skipped, 'shoots', v_shoots,
      'emails_added', v_emails_added)
  );

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'clients', v_clients,
    'students', v_students,
    'skipped', v_skipped,
    'shoots', v_shoots,
    'emails_added', v_emails_added,
    'shoot_links', v_links
  );
END;
$$;
