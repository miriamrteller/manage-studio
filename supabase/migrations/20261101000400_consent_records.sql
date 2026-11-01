-- =============================================================================
-- Consent records: photo/media consent per purpose, photography portfolio
-- opt-in, marketing consent per channel — with proof.
-- (docs/legal/APP-GAPS.md "Marketing consent" and "Photo / media consent";
--  wording in docs/legal/08-marketing-consent.md and 09-in-app-consent-texts.md)
--
-- consent_records  Append-only history. The current state of a consent is the
--                  latest row for (subject, kind). Each row keeps the exact
--                  wording shown, a wording version, where it was given, who
--                  recorded it, and the request IP / user agent.
-- Subjects: a person (student, parent, client) or a lead (inquiry form).
--
-- people.photo_consent / media_consent and leads.marketing_consent stay as
-- quick flags and are kept in sync by record_consents().
-- =============================================================================

CREATE TABLE IF NOT EXISTS consent_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  person_id        UUID        REFERENCES people(id) ON DELETE CASCADE,
  lead_id          UUID        REFERENCES leads(id) ON DELETE CASCADE,
  kind             TEXT        NOT NULL CHECK (kind IN (
                     'photo_internal', 'photo_parents_group', 'photo_public',
                     'portfolio',
                     'marketing_email', 'marketing_sms', 'marketing_whatsapp'
                   )),
  granted          BOOLEAN     NOT NULL,
  wording          TEXT        CHECK (wording IS NULL OR length(wording) <= 2000),
  wording_version  TEXT        CHECK (wording_version IS NULL OR length(wording_version) <= 64),
  source           TEXT        NOT NULL CHECK (source IN (
                     'enrolment', 'inquiry', 'booking', 'signup', 'portal',
                     'admin', 'contract', 'unsubscribe', 'sms_reply'
                   )),
  engagement_id    UUID        REFERENCES engagements(id) ON DELETE SET NULL,
  recorded_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address       INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((person_id IS NOT NULL) <> (lead_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_consent_records_person
  ON consent_records (person_id, kind, created_at DESC) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consent_records_lead
  ON consent_records (lead_id, kind, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consent_records_tenant
  ON consent_records (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_consent_record_update()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'consent_records rows are append-only; record a new row instead';
END;
$$;

DROP TRIGGER IF EXISTS consent_records_append_only ON consent_records;
CREATE TRIGGER consent_records_append_only
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION prevent_consent_record_update();

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin reads consent_records" ON consent_records
  FOR SELECT USING (is_super_admin());
CREATE POLICY "admins read own tenant consent_records" ON consent_records
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );
CREATE POLICY "account holders read own consent_records" ON consent_records
  FOR SELECT USING (
    person_id IS NOT NULL
    AND tenant_id = get_my_tenant_id()
    AND (
      person_id = get_my_person_id()
      OR person_id IN (SELECT p.id FROM people p WHERE p.account_id IN (SELECT get_my_account_ids()))
    )
  );

REVOKE ALL ON TABLE consent_records FROM anon, authenticated;
GRANT SELECT ON TABLE consent_records TO authenticated;
GRANT ALL ON TABLE consent_records TO service_role;

-- -----------------------------------------------------------------------------
-- Current state per kind for a person (latest row wins).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_person_consents(p_person_id UUID)
RETURNS TABLE (kind TEXT, granted BOOLEAN, wording TEXT, source TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (cr.kind) cr.kind, cr.granted, cr.wording, cr.source, cr.created_at
  FROM consent_records cr
  WHERE cr.person_id = p_person_id
  ORDER BY cr.kind, cr.created_at DESC, cr.id DESC;
$$;

GRANT EXECUTE ON FUNCTION get_person_consents(UUID) TO authenticated;

-- Which of these people have currently opted in to marketing on a channel?
-- Used by send-notification (service role) for marketing blasts.
CREATE OR REPLACE FUNCTION marketing_optins(p_tenant_id UUID, p_person_ids UUID[], p_kind TEXT)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT latest.person_id
  FROM (
    SELECT DISTINCT ON (cr.person_id) cr.person_id, cr.granted
    FROM consent_records cr
    WHERE cr.tenant_id = p_tenant_id
      AND cr.kind = p_kind
      AND cr.person_id = ANY (p_person_ids)
    ORDER BY cr.person_id, cr.created_at DESC, cr.id DESC
  ) latest
  WHERE latest.granted;
$$;

-- Tier: service (definer-execute.json). Supabase grants anon/authenticated directly; revoke both.
REVOKE ALL ON FUNCTION marketing_optins(UUID, UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION marketing_optins(UUID, UUID[], TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- record_consents — the client write path.
--
-- p_items: [{"kind": "...", "granted": true|false, "wording": "exact text"}]
-- Allowed callers:
--   * a tenant admin, for any person in the tenant (source 'admin');
--   * a signed-in parent/client, for themselves or people on their account;
--   * a guest during enrolment, only for the student of a pending engagement
--     of this tenant or people on the student's account.
-- Lead consents are written by the crm-lead-capture function (service role).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_consents(
  p_tenant_id      UUID,
  p_person_id      UUID,
  p_items          JSONB,
  p_wording_version TEXT,
  p_source         TEXT,
  p_engagement_id  UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_person    people%ROWTYPE;
  v_allowed   BOOLEAN := false;
  v_headers   JSONB;
  v_ip        INET;
  v_ua        TEXT;
  v_item      JSONB;
  v_kind      TEXT;
  v_target    UUID;
  v_count     INTEGER := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;
  IF p_source NOT IN ('enrolment', 'booking', 'signup', 'portal', 'admin', 'contract') THEN
    RAISE EXCEPTION 'invalid source';
  END IF;

  SELECT * INTO v_person FROM people WHERE id = p_person_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'person not found in this tenant';
  END IF;

  IF v_uid IS NOT NULL THEN
    v_allowed :=
      is_super_admin()
      OR EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.id = v_uid AND up.tenant_id = p_tenant_id AND 'tenant_admin' = ANY(up.role)
      )
      OR (
        EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = v_uid AND up.tenant_id = p_tenant_id)
        AND (
          v_person.user_profile_id = v_uid
          OR v_person.account_id IN (SELECT get_my_account_ids())
        )
      );
  END IF;

  IF NOT v_allowed AND p_engagement_id IS NOT NULL THEN
    v_allowed := EXISTS (
      SELECT 1
      FROM engagements e
      JOIN people student ON student.id = e.person_id
      WHERE e.id = p_engagement_id
        AND e.tenant_id = p_tenant_id
        AND e.status LIKE 'pending%'
        AND (
          student.id = p_person_id
          OR (student.account_id IS NOT NULL AND student.account_id = v_person.account_id)
        )
    );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not allowed to record consent for this person';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NOT NULL THEN
    BEGIN
      v_ip := split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)::inet;
    EXCEPTION WHEN others THEN
      v_ip := NULL;
    END;
    v_ua := left(v_headers->>'user-agent', 512);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_kind := v_item->>'kind';
    IF v_kind IS NULL OR jsonb_typeof(v_item->'granted') <> 'boolean' THEN
      RAISE EXCEPTION 'each item needs kind and boolean granted';
    END IF;
    -- Marketing goes to the contact, not a child: for a minor on an account,
    -- record it against the account's primary contact (the parent).
    v_target := p_person_id;
    IF v_kind LIKE 'marketing\_%' AND v_person.account_id IS NOT NULL
       AND v_person.date_of_birth IS NOT NULL AND is_minor(v_person.date_of_birth) THEN
      SELECT a.person_id INTO v_target FROM accounts a WHERE a.id = v_person.account_id;
      v_target := coalesce(v_target, p_person_id);
    END IF;

    INSERT INTO consent_records (
      tenant_id, person_id, kind, granted, wording, wording_version, source,
      engagement_id, recorded_by, ip_address, user_agent
    ) VALUES (
      p_tenant_id, v_target, v_kind, (v_item->>'granted')::boolean,
      left(v_item->>'wording', 2000), left(p_wording_version, 64), p_source,
      p_engagement_id, v_uid, v_ip, v_ua
    );
    v_count := v_count + 1;
  END LOOP;

  -- Keep the quick flags on people in step with the latest records.
  UPDATE people p SET
    photo_consent = EXISTS (
      SELECT 1 FROM get_person_consents(p.id) c
      WHERE c.kind IN ('photo_internal', 'photo_parents_group', 'photo_public') AND c.granted
    ),
    media_consent = EXISTS (
      SELECT 1 FROM get_person_consents(p.id) c
      WHERE c.kind = 'photo_public' AND c.granted
    )
  WHERE p.id = p_person_id;

  RETURN v_count;
END;
$$;

-- Tier: public (guests give consent during guest enrolment).
REVOKE ALL ON FUNCTION record_consents(UUID, UUID, JSONB, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_consents(UUID, UUID, JSONB, TEXT, TEXT, UUID) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Phone lookup for SMS / WhatsApp "STOP" replies (twilio-inbound, service role).
-- The Twilio sender is shared by all studios, so a STOP opts the number out
-- everywhere it appears. Matches on the last 9 digits (Israeli numbers in
-- 05x / +9725x form).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_contacts_by_phone(p_phone TEXT)
RETURNS TABLE (tenant_id UUID, person_id UUID, lead_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH needle AS (
    SELECT right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) AS d
  )
  SELECT cp.tenant_id, cp.person_id, NULL::uuid
  FROM contact_preferences cp, needle
  WHERE length(needle.d) = 9
    AND cp.person_id IS NOT NULL
    AND right(regexp_replace(coalesce(cp.whatsapp_number, ''), '\D', '', 'g'), 9) = needle.d
  UNION
  SELECT l.tenant_id, NULL::uuid, l.id
  FROM leads l, needle
  WHERE length(needle.d) = 9
    AND right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 9) = needle.d;
$$;

-- Tier: service.
REVOKE ALL ON FUNCTION find_contacts_by_phone(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION find_contacts_by_phone(TEXT) TO service_role;
