-- Add guardian_confirmed to waiver_evidence.
-- When the signer is acting as a guardian for a minor, they must explicitly
-- declare their parental/guardian authority. This is stored in the tamper-evident
-- record and included in the canonical HMAC (now covering 15 fields, up from 14).
--
-- DB reset assumed — no IF NOT EXISTS guards needed.

ALTER TABLE waiver_evidence
  ADD COLUMN guardian_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Drop the current 25-param overload (introduced in 20260609000400_waiver_evidence_offering_link)
-- before redefining with the new 26-param signature.
DROP FUNCTION IF EXISTS sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID
);

CREATE OR REPLACE FUNCTION sign_waiver(
  p_id                    UUID,
  p_tenant_id             UUID,
  p_person_id             UUID,
  p_account_member_id     UUID,          -- NULL for self-signing adults
  p_consent_template_id   UUID,
  p_consent_version       INT,
  p_consent_version_hash  TEXT,
  p_wording_snapshot      TEXT,
  p_pdf_storage_path      TEXT,
  p_pdf_sha256            TEXT,
  p_record_hmac           TEXT,          -- hmac-sha256-hex over canonical 15-field JSON
  p_hmac_key_version      SMALLINT,
  p_viewed_at             TIMESTAMPTZ,
  p_signed_by_name        TEXT,
  p_signed_by_email       TEXT,
  p_signed_by_role        TEXT,
  p_signature_method      TEXT,
  p_signed_at             TIMESTAMPTZ,
  p_ip_address            INET,
  p_user_agent            TEXT,
  p_accept_language       TEXT,
  p_idempotency_key       TEXT,
  p_otp_verify_sid        TEXT,
  p_actor_id              UUID,
  p_offering_id           UUID    DEFAULT NULL,
  p_guardian_confirmed    BOOLEAN DEFAULT false
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_evidence_id UUID;
BEGIN
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

  -- Idempotency: if row already existed, return its id
  IF v_evidence_id IS NULL THEN
    SELECT id INTO v_evidence_id FROM waiver_evidence
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
    RETURN v_evidence_id;
  END IF;

  INSERT INTO waiver_events (tenant_id, waiver_evidence_id, event_type, actor_id, metadata)
  VALUES (p_tenant_id, v_evidence_id, 'accepted', p_actor_id,
          jsonb_build_object(
            'ip',                p_ip_address::TEXT,
            'consent_version',   p_consent_version,
            'offering_id',       p_offering_id::TEXT,
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
