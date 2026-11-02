-- Grow payment notices must be authenticated (payments audit P1 #1).
--
-- The Grow notify handlers now REJECT a notice when the studio has no webhook key
-- stored (before, no key meant "accept anything"). This migration gives the
-- settings screen what it needs to create and show that key:
--
--   rotate_grow_webhook_key()      tenant_admin: generates a new random key on the
--                                  server, stores it encrypted, returns it ONCE so
--                                  the owner can paste it into Grow. The previous
--                                  key stays valid for 24 hours (rotation overlap).
--   get_grow_webhook_key_status()  tenant_admin: whether a key exists and when it
--                                  was made. Never returns the key.
--   get_grow_webhook_secret()      service_role: now returns EVERY active key, so
--                                  the 24-hour overlap really accepts both keys
--                                  (it used to return only the newest).
--
-- Additive and backward-compatible: same signature for get_grow_webhook_secret,
-- two new functions, no table changes.

CREATE OR REPLACE FUNCTION public.get_grow_webhook_secret(p_tenant_id uuid)
 RETURNS TABLE(webhook_secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_grow_webhook_secret: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY
  SELECT pgp_sym_decrypt(s.secret_enc::bytea, enc_key)
  FROM grow_webhook_secrets s
  WHERE s.tenant_id = p_tenant_id
    AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY s.key_version DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_grow_webhook_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_grow_webhook_secret(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rotate_grow_webhook_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
  v_version   INT;
  v_key       TEXT;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;

  enc_key := get_app_encryption_key();
  v_key := encode(gen_random_bytes(32), 'hex');

  -- Serialise concurrent rotations for one tenant.
  PERFORM pg_advisory_xact_lock(hashtext('grow_webhook_key:' || v_tenant_id::text));

  SELECT COALESCE(MAX(key_version), 0) + 1
    INTO v_version
  FROM grow_webhook_secrets
  WHERE tenant_id = v_tenant_id;

  -- Every key still active (no expiry) gets 24 hours, so Grow can be updated without losing notices.
  UPDATE grow_webhook_secrets
  SET expires_at = now() + interval '24 hours',
      rotated_at = now()
  WHERE tenant_id = v_tenant_id
    AND expires_at IS NULL;

  INSERT INTO grow_webhook_secrets (tenant_id, secret_enc, key_version)
  VALUES (v_tenant_id, pgp_sym_encrypt(v_key, enc_key), v_version);

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, after_state)
  VALUES (v_tenant_id, auth.uid(), 'grow_webhook_key.rotated', 'tenant',
          jsonb_build_object('key_version', v_version));

  RETURN v_key;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rotate_grow_webhook_key() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rotate_grow_webhook_key() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_grow_webhook_key_status()
 RETURNS TABLE(configured boolean, key_version integer, created_at timestamptz)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;

  RETURN QUERY
  SELECT true, s.key_version, s.created_at
  FROM grow_webhook_secrets s
  WHERE s.tenant_id = v_tenant_id
    AND s.expires_at IS NULL
  ORDER BY s.key_version DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::integer, NULL::timestamptz;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_grow_webhook_key_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_grow_webhook_key_status() TO authenticated;
