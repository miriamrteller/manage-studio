-- =============================================================================
-- 001200: Waiver Evidence + Waiver Events + sign_waiver()
-- Immutable signed-waiver records and append-only lifecycle events.
-- Placed BEFORE engagements so engagements.waiver_evidence_id is a real FK.
-- All writes go through sign_waiver() (SECURITY DEFINER, service_role only).
-- DEPENDENCIES: 000200, 000300, 000500 (offerings), 000700 (audit_log), 000900 (consent_templates)
-- =============================================================================

CREATE TABLE waiver_evidence (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES tenants(id),
  person_id            UUID        NOT NULL REFERENCES people(id),
  -- signer when a guardian signs for a minor; NULL when the person signs for themselves
  account_member_id    UUID        REFERENCES account_members(id),
  -- which class this signature was collected for (waivers are signed pre-engagement)
  offering_id          UUID        REFERENCES offerings(id),
  consent_template_id  UUID        NOT NULL REFERENCES consent_templates(id),
  consent_version      INT         NOT NULL,
  consent_version_hash VARCHAR(64) NOT NULL,  -- sha256hex of wording_snapshot
  wording_snapshot     TEXT        NOT NULL,  -- exact legal text accepted at signing time
  pdf_storage_path     TEXT        NOT NULL,  -- waiver-pdfs bucket path
  pdf_sha256           VARCHAR(64) NOT NULL,  -- sha256hex of rendered PDF bytes
  record_hmac          VARCHAR(64) NOT NULL,  -- hmac-sha256-hex over canonical 15-field JSON (see SPEC §4.2.9)
  hmac_key_version     SMALLINT    NOT NULL DEFAULT 1,
  viewed_at            TIMESTAMPTZ,           -- server timestamp from waiver-viewed; NULL until scroll confirmed
  signed_by_name       TEXT        NOT NULL,  -- typed legal name from signer
  signed_by_email      TEXT,
  signed_by_role       TEXT        NOT NULL DEFAULT 'guardian'
                       CHECK (signed_by_role IN ('guardian', 'self', 'admin_attestation')),
  signature_method     TEXT        NOT NULL DEFAULT 'typed_name_checkbox'
                       CHECK (signature_method IN ('typed_name_checkbox', 'admin_upload')),
  -- guardian explicitly declares parental/guardian authority when signing for a minor
  guardian_confirmed   BOOLEAN     NOT NULL DEFAULT false,
  signed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address           INET,
  user_agent           TEXT,
  accept_language      TEXT,
  idempotency_key      TEXT        NOT NULL,
  otp_verify_sid       TEXT,                  -- Twilio Verify SID; NULL when waiver_require_otp = false
  -- status is always 'signed' in V1 (trigger blocks all UPDATEs).
  status               TEXT        NOT NULL DEFAULT 'signed'
                       CHECK (status IN ('signed', 'superseded', 'revoked')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE waiver_events (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  -- NULL for 'viewed' events that precede evidence creation; NOT NULL otherwise
  waiver_evidence_id UUID        REFERENCES waiver_evidence(id),
  event_type         TEXT        NOT NULL
                     CHECK (event_type IN ('requested','viewed','accepted','superseded','revoked','admin_attested')),
  actor_id           UUID        REFERENCES user_profiles(id),
  metadata           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutability triggers — waiver_evidence rows can never be modified or deleted
CREATE OR REPLACE FUNCTION prevent_waiver_evidence_update()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'waiver_evidence rows are immutable';
END;
$$;

CREATE TRIGGER waiver_evidence_immutable
  BEFORE UPDATE ON waiver_evidence FOR EACH ROW
  EXECUTE FUNCTION prevent_waiver_evidence_update();

CREATE TRIGGER waiver_evidence_no_delete
  BEFORE DELETE ON waiver_evidence FOR EACH ROW
  EXECUTE FUNCTION prevent_waiver_evidence_update();

CREATE INDEX idx_waiver_evidence_tenant   ON waiver_evidence(tenant_id);
CREATE INDEX idx_waiver_evidence_person   ON waiver_evidence(person_id);
CREATE INDEX idx_waiver_evidence_offering ON waiver_evidence(offering_id);
CREATE INDEX idx_waiver_evidence_template ON waiver_evidence(consent_template_id, consent_version);
CREATE INDEX idx_waiver_events_evidence   ON waiver_events(waiver_evidence_id);

ALTER TABLE waiver_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiver_events   ENABLE ROW LEVEL SECURITY;

-- waiver_evidence SELECT: own tenant + own person or account members, or admin
CREATE POLICY waiver_evidence_select ON waiver_evidence FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_service_role()
      OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
      OR person_id IN (
        SELECT p.id FROM people p
        WHERE p.tenant_id = get_my_tenant_id()
          AND (
            p.id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
            OR p.account_id IN (
              SELECT account_id FROM account_members WHERE user_profile_id = auth.uid()
            )
          )
      )
    )
  );

-- waiver_evidence INSERT: service_role ONLY — no direct client insert permitted
CREATE POLICY waiver_evidence_insert ON waiver_evidence FOR INSERT
  WITH CHECK (is_service_role());

-- waiver_events SELECT: same scoping as waiver_evidence
CREATE POLICY waiver_events_select ON waiver_events FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_service_role()
      OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
      OR waiver_evidence_id IN (
        SELECT we.id FROM waiver_evidence we
        JOIN people p ON p.id = we.person_id
        WHERE p.tenant_id = get_my_tenant_id()
          AND (
            p.id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
            OR p.account_id IN (
              SELECT account_id FROM account_members WHERE user_profile_id = auth.uid()
            )
          )
      )
      -- 'viewed' pre-acceptance events (waiver_evidence_id IS NULL) scoped only by tenant_id above
      OR waiver_evidence_id IS NULL
    )
  );

-- waiver_events INSERT: service_role ONLY
CREATE POLICY waiver_events_insert ON waiver_events FOR INSERT
  WITH CHECK (is_service_role());

-- =============================================================================
-- sign_waiver() — atomic write function (SECURITY DEFINER, service_role only)
-- Pre-condition: caller pre-generates p_id and uploads PDF to bucket before calling.
-- Idempotency: returns existing id if (tenant_id, idempotency_key) already exists.
-- record_hmac covers the canonical 15-field JSON (guardian_confirmed is the 15th).
-- =============================================================================
CREATE OR REPLACE FUNCTION sign_waiver(
  p_id                   UUID,          -- pre-generated by Edge Function
  p_tenant_id            UUID,
  p_person_id            UUID,
  p_account_member_id    UUID,          -- NULL for self-signing adults
  p_consent_template_id  UUID,
  p_consent_version      INT,
  p_consent_version_hash TEXT,
  p_wording_snapshot     TEXT,
  p_pdf_storage_path     TEXT,
  p_pdf_sha256           TEXT,
  p_record_hmac          TEXT,          -- hmac-sha256-hex over canonical 15-field JSON
  p_hmac_key_version     SMALLINT,
  p_viewed_at            TIMESTAMPTZ,
  p_signed_by_name       TEXT,
  p_signed_by_email      TEXT,
  p_signed_by_role       TEXT,
  p_signature_method     TEXT,
  p_signed_at            TIMESTAMPTZ,
  p_ip_address           INET,
  p_user_agent           TEXT,
  p_accept_language      TEXT,
  p_idempotency_key      TEXT,
  p_otp_verify_sid       TEXT,
  p_actor_id             UUID,          -- authenticated user who triggered the signing
  p_offering_id          UUID    DEFAULT NULL,   -- which class this waiver is for
  p_guardian_confirmed   BOOLEAN DEFAULT false   -- guardian authority declaration (minors)
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_evidence_id UUID;
BEGIN
  -- Idempotency: concurrent-safe via ON CONFLICT
  INSERT INTO waiver_evidence (
    id, tenant_id, person_id, account_member_id,
    consent_template_id, consent_version, consent_version_hash, wording_snapshot,
    pdf_storage_path, pdf_sha256, record_hmac, hmac_key_version, viewed_at,
    signed_by_name, signed_by_email, signed_by_role, signature_method,
    signed_at, ip_address, user_agent, accept_language,
    idempotency_key, otp_verify_sid, status, offering_id, guardian_confirmed
  ) VALUES (
    p_id, p_tenant_id, p_person_id, p_account_member_id,
    p_consent_template_id, p_consent_version, p_consent_version_hash, p_wording_snapshot,
    p_pdf_storage_path, p_pdf_sha256, p_record_hmac, p_hmac_key_version, p_viewed_at,
    p_signed_by_name, p_signed_by_email, p_signed_by_role, p_signature_method,
    p_signed_at, p_ip_address, p_user_agent, p_accept_language,
    p_idempotency_key, p_otp_verify_sid, 'signed', p_offering_id, p_guardian_confirmed
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_evidence_id;

  -- If the row already existed (idempotent replay), fetch its id and return
  IF v_evidence_id IS NULL THEN
    SELECT id INTO v_evidence_id FROM waiver_evidence
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
    RETURN v_evidence_id;
  END IF;

  INSERT INTO waiver_events (tenant_id, waiver_evidence_id, event_type, actor_id, metadata)
  VALUES (p_tenant_id, v_evidence_id, 'accepted', p_actor_id,
          jsonb_build_object(
            'ip',                 p_ip_address::TEXT,
            'consent_version',    p_consent_version,
            'offering_id',        p_offering_id::TEXT,
            'guardian_confirmed', p_guardian_confirmed
          ));

  INSERT INTO audit_log (tenant_id, actor_id, actor_email, action, entity_type, entity_id,
                         ip_address, user_agent, after_state)
  VALUES (p_tenant_id, p_actor_id, p_signed_by_email, 'waiver_signed', 'waiver_evidence',
          v_evidence_id, p_ip_address, p_user_agent,
          jsonb_build_object(
            'person_id',          p_person_id,
            'consent_version',    p_consent_version,
            'consent_template_id', p_consent_template_id,
            'offering_id',        p_offering_id,
            'guardian_confirmed', p_guardian_confirmed
          ));

  UPDATE people
  SET waiver_accepted_at = p_signed_at,
      waiver_version     = p_consent_version::TEXT,
      updated_at         = now()
  WHERE id = p_person_id AND tenant_id = p_tenant_id;

  RETURN v_evidence_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN
) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN
) TO service_role;
