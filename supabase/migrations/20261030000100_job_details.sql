-- =============================================================================
-- 20261030000100: job_details — per-job details for appointment-based verticals
--
-- A "job" is an existing `engagements` row (client person/account, offering =
-- package, booked_starts_at/ends_at, waiver_evidence_id = signed contract,
-- payments.engagement_id). This table adds the job-specific columns that the
-- class-oriented engagement row does not carry: a business status pipeline
-- (enquiry → booked → shot → editing → delivered), location, notes, the lead
-- it was converted from, and the delivered gallery.
--
-- Vertical-neutral in the DB: labelled "Shoot / צילום" for photographer
-- tenants via entity labels in the web app, "Job" elsewhere.
--
-- Engagement conventions for jobs (shared contract with threads B/C):
--   * season_id IS NULL. `idx_engagements_active_with_season` would otherwise
--     block a repeat client booking the same package twice in a season.
--   * engagements.status = 'active' for every live job (enquiry included) and
--     'cancelled' when the job is cancelled. 'pending_payment' is deliberately
--     NOT used: the enrolment payment-dunning cron chases that status.
--   * With season NULL and booked_starts_at set, neither partial unique index
--     applies. An UNDATED job (booked_starts_at NULL) hits
--     `idx_engagements_active_no_season`: at most one undated active job per
--     client + package. Acceptable for beta — pick a date or a different
--     package for a second open enquiry.
--   * Packages are offerings with offering_type = 'appointment', duration_mins
--     set, day_of_week/start_time/end_time NULL and season_id NULL.
--   * Client = account (couple/family); primary contact = accounts.person_id;
--     engagements.person_id = that primary contact.
--
-- ADDITIVE MIGRATION (SPEC §2.5.3): new file only, no base-chain edits.
-- DEPENDENCIES: 001300 (engagements), 20260819000100 (leads)
-- =============================================================================

CREATE TABLE job_details (
  engagement_id       UUID        PRIMARY KEY REFERENCES engagements(id) ON DELETE CASCADE,
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  job_status          TEXT        NOT NULL DEFAULT 'enquiry'
                      CHECK (job_status IN ('enquiry', 'booked', 'shot', 'editing', 'delivered', 'cancelled')),
  location            TEXT,
  notes               TEXT,
  lead_id             UUID        REFERENCES leads(id),
  gallery_url         TEXT,
  gallery_released_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE job_details IS
  'Per-job details for appointment-based verticals (1:1 with engagements). Labelled Shoot for photographers. Business pipeline lives in job_status; engagements.status stays active/cancelled.';
COMMENT ON COLUMN job_details.job_status IS
  'enquiry → booked → shot → editing → delivered, or cancelled. Mirrors nothing on engagements except cancelled.';
COMMENT ON COLUMN job_details.lead_id IS
  'The CRM lead this job was converted from (convert_lead_to_job). NULL for jobs created directly.';
COMMENT ON COLUMN job_details.gallery_url IS
  'Delivered gallery link. gallery_released_at is when the client was allowed to see it (gating is owned by the payment-requests migration).';

CREATE INDEX idx_job_details_tenant        ON job_details(tenant_id);
CREATE INDEX idx_job_details_tenant_status ON job_details(tenant_id, job_status);
CREATE INDEX idx_job_details_lead          ON job_details(lead_id) WHERE lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_job_details_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_job_details_updated_at
  BEFORE UPDATE ON job_details
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE job_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_details_super_admin ON job_details FOR ALL USING (is_super_admin());

CREATE POLICY job_details_admin_manage ON job_details FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Clients read their own jobs: the engagement's person is them, or a member
-- of an account they belong to (mirrors the engagements SELECT policies).
CREATE POLICY job_details_client_read ON job_details FOR SELECT
  USING (
    engagement_id IN (
      SELECT e.id FROM engagements e
      WHERE e.person_id = get_my_person_id()
         OR e.person_id IN (
           SELECT p.id FROM people p
           WHERE p.account_id IN (SELECT get_my_account_ids())
         )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_details TO authenticated;
GRANT ALL ON TABLE public.job_details TO service_role;

-- =============================================================================
-- Internal helper: resolve (or create) the client for a job.
-- Client = account; primary contact = accounts.person_id. Reuses an existing
-- person by (tenant, email) because people.email is unique per tenant.
-- Not callable by app roles — only from the SECURITY DEFINER RPCs below.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.job_resolve_client(
  p_tenant_id UUID,
  p_person_id UUID,
  p_name      TEXT,
  p_email     TEXT,
  p_phone     TEXT
)
RETURNS TABLE (person_id UUID, account_id UUID, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id  UUID;
  v_account_id UUID;
  v_email      TEXT := NULLIF(lower(trim(coalesce(p_email, ''))), '');
  v_name       TEXT := NULLIF(trim(coalesce(p_name, '')), '');
BEGIN
  IF p_person_id IS NOT NULL THEN
    SELECT p.id, p.account_id INTO v_person_id, v_account_id
    FROM people p WHERE p.id = p_person_id AND p.tenant_id = p_tenant_id;
    IF v_person_id IS NULL THEN
      RAISE EXCEPTION 'Client not found';
    END IF;
  ELSIF v_email IS NOT NULL THEN
    SELECT p.id, p.account_id INTO v_person_id, v_account_id
    FROM people p WHERE p.tenant_id = p_tenant_id AND lower(p.email) = v_email
    LIMIT 1;
  END IF;

  IF v_person_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Client name is required';
    END IF;
    -- people has no phone column; the guest-enrolment flow stores the contact
    -- phone in emergency_contact_phone, so jobs do the same.
    INSERT INTO people (tenant_id, name, email, emergency_contact_phone, status)
    VALUES (p_tenant_id, v_name, v_email, NULLIF(trim(coalesce(p_phone, '')), ''), 'active')
    RETURNING id INTO v_person_id;

    INSERT INTO accounts (tenant_id, name, person_id)
    VALUES (p_tenant_id, v_name, v_person_id)
    RETURNING id INTO v_account_id;

    UPDATE people SET account_id = v_account_id, updated_at = now() WHERE id = v_person_id;

    INSERT INTO account_members (tenant_id, account_id, person_id, role, user_profile_id)
    VALUES (p_tenant_id, v_account_id, v_person_id, 'account_holder', NULL);

    RETURN QUERY SELECT v_person_id, v_account_id, true;
    RETURN;
  END IF;

  -- Existing person without an account: give them one so the client model holds.
  IF v_account_id IS NULL THEN
    SELECT a.id INTO v_account_id FROM accounts a
    WHERE a.tenant_id = p_tenant_id AND a.person_id = v_person_id LIMIT 1;
    IF v_account_id IS NULL THEN
      INSERT INTO accounts (tenant_id, name, person_id)
      VALUES (p_tenant_id, coalesce(v_name, (SELECT name FROM people WHERE id = v_person_id)), v_person_id)
      RETURNING id INTO v_account_id;
      INSERT INTO account_members (tenant_id, account_id, person_id, role, user_profile_id)
      VALUES (p_tenant_id, v_account_id, v_person_id, 'account_holder', NULL);
    END IF;
    UPDATE people SET account_id = v_account_id, updated_at = now() WHERE id = v_person_id;
  END IF;

  RETURN QUERY SELECT v_person_id, v_account_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.job_resolve_client(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_resolve_client(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

-- =============================================================================
-- Internal helper: insert the engagement + job_details pair.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.job_insert(
  p_tenant_id        UUID,
  p_person_id        UUID,
  p_offering_id      UUID,
  p_booked_starts_at TIMESTAMPTZ,
  p_booked_ends_at   TIMESTAMPTZ,
  p_location         TEXT,
  p_notes            TEXT,
  p_lead_id          UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offering      offerings%ROWTYPE;
  v_starts        TIMESTAMPTZ := p_booked_starts_at;
  v_ends          TIMESTAMPTZ := p_booked_ends_at;
  v_engagement_id UUID;
BEGIN
  SELECT * INTO v_offering FROM offerings
  WHERE id = p_offering_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found';
  END IF;

  IF v_starts IS NOT NULL AND v_ends IS NULL THEN
    v_ends := v_starts + make_interval(mins => coalesce(v_offering.duration_mins, 60));
  END IF;
  IF v_starts IS NULL THEN
    v_ends := NULL;
  END IF;

  INSERT INTO engagements (
    tenant_id, person_id, offering_id, season_id, status,
    booked_starts_at, booked_ends_at
  )
  VALUES (
    p_tenant_id, p_person_id, p_offering_id, NULL, 'active',
    v_starts, v_ends
  )
  RETURNING id INTO v_engagement_id;

  INSERT INTO job_details (engagement_id, tenant_id, job_status, location, notes, lead_id)
  VALUES (
    v_engagement_id,
    p_tenant_id,
    CASE WHEN v_starts IS NULL THEN 'enquiry' ELSE 'booked' END,
    NULLIF(trim(coalesce(p_location, '')), ''),
    NULLIF(trim(coalesce(p_notes, '')), ''),
    p_lead_id
  );

  RETURN v_engagement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.job_insert(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_insert(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID) TO service_role;

-- =============================================================================
-- create_job — admin creates a job directly: pick an existing client
-- (p_person_id) or create one (p_client_name/email/phone), choose a package
-- and optionally a date. Returns { engagement_id, person_id, account_id }.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_job(
  p_offering_id      UUID,
  p_person_id        UUID        DEFAULT NULL,
  p_client_name      TEXT        DEFAULT NULL,
  p_client_email     TEXT        DEFAULT NULL,
  p_client_phone     TEXT        DEFAULT NULL,
  p_booked_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_booked_ends_at   TIMESTAMPTZ DEFAULT NULL,
  p_location         TEXT        DEFAULT NULL,
  p_notes            TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id     UUID;
  v_client        RECORD;
  v_engagement_id UUID;
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
  IF p_offering_id IS NULL THEN
    RAISE EXCEPTION 'Package is required';
  END IF;
  IF p_booked_starts_at IS NOT NULL AND p_booked_ends_at IS NOT NULL
     AND p_booked_ends_at <= p_booked_starts_at THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;

  SELECT * INTO v_client
  FROM job_resolve_client(v_tenant_id, p_person_id, p_client_name, p_client_email, p_client_phone);

  v_engagement_id := job_insert(
    v_tenant_id, v_client.person_id, p_offering_id,
    p_booked_starts_at, p_booked_ends_at, p_location, p_notes, NULL
  );

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (
    v_tenant_id, auth.uid(), 'INSERT', 'job_details', v_engagement_id,
    jsonb_build_object(
      'person_id', v_client.person_id,
      'account_id', v_client.account_id,
      'offering_id', p_offering_id,
      'booked_starts_at', p_booked_starts_at,
      'client_created', v_client.created
    )
  );

  RETURN jsonb_build_object(
    'engagement_id', v_engagement_id,
    'person_id', v_client.person_id,
    'account_id', v_client.account_id,
    'client_created', v_client.created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_job(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- convert_lead_to_job — one transaction: account/person for the lead (reusing
-- an existing person by email), engagement + job_details (lead_id set), and
-- the lead marked converted (converted_account_id / converted_at).
-- The package defaults to the lead's offering_id; a date is optional.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.convert_lead_to_job(
  p_lead_id          UUID,
  p_offering_id      UUID        DEFAULT NULL,
  p_booked_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_booked_ends_at   TIMESTAMPTZ DEFAULT NULL,
  p_location         TEXT        DEFAULT NULL,
  p_notes            TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id     UUID;
  v_lead          leads%ROWTYPE;
  v_offering_id   UUID;
  v_client        RECORD;
  v_engagement_id UUID;
  v_notes         TEXT;
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

  SELECT * INTO v_lead FROM leads
  WHERE id = p_lead_id AND tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  IF v_lead.converted_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead already converted';
  END IF;

  v_offering_id := coalesce(p_offering_id, v_lead.offering_id);
  IF v_offering_id IS NULL THEN
    RAISE EXCEPTION 'Package is required';
  END IF;
  IF p_booked_starts_at IS NOT NULL AND p_booked_ends_at IS NOT NULL
     AND p_booked_ends_at <= p_booked_starts_at THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;

  SELECT * INTO v_client
  FROM job_resolve_client(v_tenant_id, NULL, v_lead.name, v_lead.email, v_lead.phone);

  v_notes := coalesce(NULLIF(trim(coalesce(p_notes, '')), ''), v_lead.note);
  IF v_notes IS NULL AND v_lead.interest IS NOT NULL THEN
    v_notes := v_lead.interest;
  END IF;

  v_engagement_id := job_insert(
    v_tenant_id, v_client.person_id, v_offering_id,
    p_booked_starts_at, p_booked_ends_at, p_location, v_notes, v_lead.id
  );

  UPDATE leads
  SET converted_account_id = v_client.account_id,
      converted_at         = now(),
      updated_at           = now()
  WHERE id = v_lead.id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id, auth.uid(), 'UPDATE', 'leads', v_lead.id,
    jsonb_build_object('stage', v_lead.stage, 'converted_account_id', NULL),
    jsonb_build_object(
      'converted_account_id', v_client.account_id,
      'engagement_id', v_engagement_id,
      'offering_id', v_offering_id,
      'client_created', v_client.created,
      'transition', 'convert_lead_to_job'
    )
  );

  RETURN jsonb_build_object(
    'engagement_id', v_engagement_id,
    'person_id', v_client.person_id,
    'account_id', v_client.account_id,
    'lead_id', v_lead.id,
    'client_created', v_client.created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_lead_to_job(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
