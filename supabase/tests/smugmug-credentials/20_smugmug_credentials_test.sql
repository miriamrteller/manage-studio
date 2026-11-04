-- SmugMug: a studio admin saves her own API Key and Secret encrypted; only the service role
-- decrypts them and stores the access token; Disconnect clears the token; parents and other
-- studios can't save, read or disconnect.
-- Fixture: client-portal seed. Photo (…01) has admin …0e; Dance (…02) has parent Dina …0d.
SELECT set_config('app.encryption_key', 'test-key-for-smugmug-suite', false);

DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
  r RECORD;
  n INT;
BEGIN
  -- 1. Admin saves the keys: encrypted, audited with the last 4 of the key only.
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  PERFORM save_tenant_smugmug_credentials('  key-1234  ', ' secret-abcd ');
  SELECT * INTO r FROM tenants WHERE id = photo;
  IF r.smugmug_api_key_enc IS NULL OR position('key-1234' IN encode(r.smugmug_api_key_enc, 'escape')) > 0 THEN
    RAISE EXCEPTION 'FAIL key not encrypted';
  END IF;
  IF r.smugmug_api_secret_enc IS NULL OR position('secret-abcd' IN encode(r.smugmug_api_secret_enc, 'escape')) > 0 THEN
    RAISE EXCEPTION 'FAIL secret not encrypted';
  END IF;
  SELECT * INTO r FROM tenant_smugmug_status();
  IF NOT r.has_keys OR r.connected OR r.keys_updated_at IS NULL THEN RAISE EXCEPTION 'FAIL status after save: %', r; END IF;
  SELECT count(*) INTO n FROM audit_log
  WHERE tenant_id = photo AND entity_type = 'smugmug_credentials'
    AND after_state->>'api_key_last4' = '1234' AND after_state::text NOT LIKE '%secret%';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL audit row wrong (%)', n; END IF;
  RAISE NOTICE 'ok  admin saves keys encrypted; audited with the last 4 only';

  -- 2. Admins can't read secrets or store tokens; the service role can.
  BEGIN
    PERFORM * FROM get_tenant_smugmug_credentials(photo);
    RAISE EXCEPTION 'FAIL an admin decrypted the keys';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM save_tenant_smugmug_access_token(photo, admin, 't', 's');
    RAISE EXCEPTION 'FAIL an admin stored a token directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM set_tenant_smugmug_oauth_pending(photo, 'x');
    RAISE EXCEPTION 'FAIL an admin stored a request token directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
  PERFORM set_tenant_smugmug_oauth_pending(photo, '{"token":"rt"}');
  SELECT * INTO r FROM get_tenant_smugmug_credentials(photo);
  IF r.api_key <> 'key-1234' OR r.api_secret <> 'secret-abcd' OR r.access_token IS NOT NULL
     OR r.oauth_pending <> '{"token":"rt"}' THEN
    RAISE EXCEPTION 'FAIL service read: %', r;
  END IF;
  PERFORM save_tenant_smugmug_access_token(photo, admin, ' tok ', ' tsec ');
  SELECT * INTO r FROM get_tenant_smugmug_credentials(photo);
  IF r.access_token <> 'tok' OR r.access_secret <> 'tsec' OR r.oauth_pending IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL token not stored or pending kept: %', r;
  END IF;
  SELECT count(*) INTO n FROM get_tenant_smugmug_credentials('a0000000-0000-4000-8000-000000000002');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL a studio without keys returned a row'; END IF;
  RAISE NOTICE 'ok  only the service role decrypts and stores tokens';

  -- 3. Connected; Disconnect clears the token but keeps the keys.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  SELECT * INTO r FROM tenant_smugmug_status();
  IF NOT r.connected OR r.connected_at IS NULL THEN RAISE EXCEPTION 'FAIL not connected: %', r; END IF;
  PERFORM disconnect_tenant_smugmug();
  SELECT * INTO r FROM tenant_smugmug_status();
  IF r.connected OR NOT r.has_keys OR r.connected_at IS NOT NULL THEN RAISE EXCEPTION 'FAIL disconnect: %', r; END IF;
  SELECT smugmug_access_token_enc, smugmug_access_secret_enc INTO r FROM tenants WHERE id = photo;
  IF r.smugmug_access_token_enc IS NOT NULL OR r.smugmug_access_secret_enc IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL token left after disconnect';
  END IF;
  RAISE NOTICE 'ok  disconnect clears the token and keeps the keys';

  -- 4. New keys end the old connection (a token belongs to the key it was made with).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
  PERFORM save_tenant_smugmug_access_token(photo, admin, 'tok', 'tsec');
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  PERFORM save_tenant_smugmug_credentials('key-5678', 'secret-efgh');
  SELECT * INTO r FROM tenant_smugmug_status();
  IF r.connected THEN RAISE EXCEPTION 'FAIL new keys kept the old token'; END IF;
  RAISE NOTICE 'ok  new keys clear the old connection';

  -- 5. Empty keys are refused; a parent can't save, disconnect or see the status.
  BEGIN
    PERFORM save_tenant_smugmug_credentials('k', '  ');
    RAISE EXCEPTION 'FAIL empty secret accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'p_api_secret%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', dina::text, false);
  BEGIN
    PERFORM save_tenant_smugmug_credentials('k', 's');
    RAISE EXCEPTION 'FAIL a parent saved keys';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM disconnect_tenant_smugmug();
    RAISE EXCEPTION 'FAIL a parent disconnected';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM tenant_smugmug_status();
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL a parent sees the status'; END IF;
  RAISE NOTICE 'ok  empty keys refused; parents can neither save nor see them';
END $$;
