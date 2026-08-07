-- =============================================================================
-- 002150: Waiver flow RPCs (post-auth guest waiver signing)
-- get_pending_waiver_engagement — fetch engagement details, authorized by JWT email.
-- get_engagement_person_id      — find unlinked person for an engagement.
-- DEPENDENCIES: 000300, 001300
-- =============================================================================

-- Authorizes adult self-enrolment, guardian email on the family account, or linked user_profile.
CREATE OR REPLACE FUNCTION get_pending_waiver_engagement(p_engagement_id UUID)
RETURNS TABLE(person_id UUID, offering_id UUID, current_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      e.person_id,
      e.offering_id,
      e.status::TEXT AS current_status
    FROM engagements e
    JOIN people p ON p.id = e.person_id
    WHERE e.id = p_engagement_id
      AND (
        (p.email IS NOT NULL AND lower(trim(p.email)) = lower(trim(auth.email())))
        OR
        EXISTS (
          SELECT 1
          FROM account_members am
          JOIN people guardian ON guardian.id = am.person_id
          WHERE p.account_id IS NOT NULL
            AND am.account_id = p.account_id
            AND am.role = 'account_holder'
            AND guardian.email IS NOT NULL
            AND lower(trim(guardian.email)) = lower(trim(auth.email()))
        )
        OR
        EXISTS (
          SELECT 1
          FROM account_members am
          WHERE p.account_id IS NOT NULL
            AND am.account_id = p.account_id
            AND am.user_profile_id = auth.uid()
        )
      );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_pending_waiver_engagement(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_pending_waiver_engagement(UUID) TO authenticated;

-- Security guard: only returns a result if the person is NOT yet linked to an auth
-- account (user_profile_id IS NULL), preventing hijacking of linked records.
CREATE OR REPLACE FUNCTION get_engagement_person_id(p_engagement_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_person_id UUID;
BEGIN
  SELECT p.id
    INTO v_person_id
    FROM engagements e
    JOIN people p ON p.id = e.person_id
   WHERE e.id = p_engagement_id
     AND p.user_profile_id IS NULL   -- only unlinked guest records
  LIMIT 1;

  RETURN v_person_id; -- NULL if not found or already linked
END;
$$;

REVOKE EXECUTE ON FUNCTION get_engagement_person_id(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_engagement_person_id(UUID) TO authenticated;

-- =============================================================================
-- RPC: get_tenant_waiver_link_secret — service_role only.
-- Per-tenant HMAC secret for waiver/pay link tokens (key-id pattern: the
-- verifier reads tid from the unverified payload purely as a lookup key,
-- then verifies against this secret). Generated lazily on first use so
-- provisioning needs no change; never entered or seen by a human.
-- Distinct from WAIVER_HMAC_KEY_V* (evidence seal), which deliberately
-- stays OUT of the database — a seal stored with the thing it seals
-- proves nothing.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_tenant_waiver_link_secret(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  enc_key  TEXT;
  v_secret TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_waiver_link_secret: service_role only';
  END IF;

  enc_key := get_app_encryption_key();

  SELECT pgp_sym_decrypt(t.waiver_link_secret_enc, enc_key)
    INTO v_secret
    FROM tenants t
   WHERE t.id = p_tenant_id
     AND t.waiver_link_secret_enc IS NOT NULL;

  IF v_secret IS NOT NULL THEN
    RETURN v_secret;
  END IF;

  -- First use for this tenant: generate, persist, return. The WHERE guard
  -- makes concurrent first calls converge on whichever write lands first.
  v_secret := encode(gen_random_bytes(32), 'base64');
  UPDATE tenants
     SET waiver_link_secret_enc = pgp_sym_encrypt(v_secret, enc_key)
   WHERE id = p_tenant_id
     AND waiver_link_secret_enc IS NULL;

  SELECT pgp_sym_decrypt(t.waiver_link_secret_enc, enc_key)
    INTO v_secret
    FROM tenants t
   WHERE t.id = p_tenant_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'get_tenant_waiver_link_secret: unknown tenant %', p_tenant_id;
  END IF;

  RETURN v_secret;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_tenant_waiver_link_secret(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_tenant_waiver_link_secret(UUID) TO service_role;

-- =============================================================================
-- After deploy, schedule the waiver deadline checker via pg_cron + pg_net:
--
-- SELECT cron.schedule(
--   'waiver-deadline-check',
--   '0 */6 * * *',
--   $$
--     SELECT net.http_post(
--       url     := current_setting('app.supabase_functions_url') || '/send-waiver-reminder',
--       headers := '{"Content-Type":"application/json"}',
--       body    := '{}'
--     )
--   $$
-- );
-- =============================================================================
