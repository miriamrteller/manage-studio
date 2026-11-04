-- Takbull keys: a studio admin saves them encrypted without changing the provider; only the
-- service role decrypts them; parents and other studios can't save or read them.
-- Fixture: client-portal seed. Photo (…01) has admin …0e; Dance (…02) has parent Dina …0d.
SELECT set_config('app.encryption_key', 'test-key-for-takbull-suite', false);

DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
  before_provider TEXT;
  r RECORD;
  n INT;
BEGIN
  SELECT payment_provider INTO before_provider FROM tenants WHERE id = photo;

  -- 1. Admin saves the keys: stored, secret encrypted, provider untouched, audited without the keys.
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  PERFORM save_tenant_takbull_credentials('  key-1234  ', ' secret-abcd ');
  SELECT * INTO r FROM tenants WHERE id = photo;
  IF r.takbull_api_key_enc IS NULL OR position('key-1234' IN encode(r.takbull_api_key_enc, 'escape')) > 0 THEN
    RAISE EXCEPTION 'FAIL key not encrypted';
  END IF;
  IF r.takbull_api_secret_enc IS NULL OR position('secret-abcd' IN encode(r.takbull_api_secret_enc, 'escape')) > 0 THEN
    RAISE EXCEPTION 'FAIL secret not encrypted';
  END IF;
  IF r.payment_provider IS DISTINCT FROM before_provider THEN RAISE EXCEPTION 'FAIL provider changed to %', r.payment_provider; END IF;
  IF NOT tenant_takbull_connected() THEN RAISE EXCEPTION 'FAIL admin does not see connected'; END IF;
  SELECT count(*) INTO n FROM audit_log
  WHERE tenant_id = photo AND entity_type = 'takbull_credentials'
    AND after_state->>'api_key_last4' = '1234' AND after_state::text NOT LIKE '%secret%';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL audit row wrong (%)', n; END IF;
  RAISE NOTICE 'ok  admin saves keys encrypted; provider unchanged; audited without the keys';

  -- 2. Only the service role reads them back.
  BEGIN
    PERFORM * FROM get_tenant_takbull_credentials(photo);
    RAISE EXCEPTION 'FAIL an admin decrypted the keys';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
  SELECT * INTO r FROM get_tenant_takbull_credentials(photo);
  IF r.api_key <> 'key-1234' OR r.api_secret <> 'secret-abcd' THEN RAISE EXCEPTION 'FAIL service read: %', r; END IF;
  SELECT count(*) INTO n FROM get_tenant_takbull_credentials('a0000000-0000-4000-8000-000000000002');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL a studio without keys returned a row'; END IF;
  RAISE NOTICE 'ok  only the service role decrypts';

  -- 3. Empty keys are refused; a parent can't save keys or see "connected".
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  BEGIN
    PERFORM save_tenant_takbull_credentials('k', '  ');
    RAISE EXCEPTION 'FAIL empty secret accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'p_api_secret%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', dina::text, false);
  BEGIN
    PERFORM save_tenant_takbull_credentials('k', 's');
    RAISE EXCEPTION 'FAIL a parent saved keys';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF tenant_takbull_connected() THEN RAISE EXCEPTION 'FAIL a parent sees connected'; END IF;
  RAISE NOTICE 'ok  empty keys refused; parents can neither save nor see them';
END $$;
