-- OpalSwift's own billing (step B1): only the platform owner saves or sees OpalSwift's Takbull
-- keys, only the service role decrypts them, studios can't read the billing tables, and a
-- month can be paid only once. Fixture: client-portal seed; admin …0e runs studio …01.
SELECT set_config('app.encryption_key', 'test-key-for-platform-billing', false);

DO $$
DECLARE
  owner_id UUID := 'b0000000-0000-4000-8000-0000000000f1';
  admin    UUID := 'b0000000-0000-4000-8000-00000000000e';
  photo    UUID := 'a0000000-0000-4000-8000-000000000001';
  r RECORD;
  n INT;
BEGIN
  -- The platform owner signs up on the platform host (super_admin, no studio).
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (owner_id, 'admin@opalswift.com', '{}'::jsonb);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);

  -- 1. Nothing saved yet: status says so; charging is off.
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, false);
  SELECT * INTO r FROM platform_billing_status();
  IF r.keys_saved OR r.keys_saved_at IS NOT NULL OR r.charging_enabled THEN RAISE EXCEPTION 'FAIL fresh status %', r; END IF;
  RAISE NOTICE 'ok  no keys and charging off by default';

  -- 2. The owner saves the keys: encrypted, status says saved.
  PERFORM save_platform_takbull_credentials('  pkey-9876 ', ' psecret-wxyz ');
  SELECT * INTO r FROM platform_billing_settings;
  IF r.takbull_api_key_enc IS NULL OR position('pkey-9876' IN encode(r.takbull_api_key_enc, 'escape')) > 0 THEN
    RAISE EXCEPTION 'FAIL key not encrypted';
  END IF;
  IF position('psecret-wxyz' IN encode(r.takbull_api_secret_enc, 'escape')) > 0 THEN RAISE EXCEPTION 'FAIL secret not encrypted'; END IF;
  IF r.takbull_credentials_updated_by IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'FAIL updated_by %', r.takbull_credentials_updated_by; END IF;
  SELECT * INTO r FROM platform_billing_status();
  IF NOT r.keys_saved OR r.keys_saved_at IS NULL THEN RAISE EXCEPTION 'FAIL status after save %', r; END IF;
  SELECT count(*) INTO n FROM platform_billing_overview() WHERE tenant_id = photo AND NOT founder AND failed_attempts = 0;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL overview row for studio (%)', n; END IF;
  RAISE NOTICE 'ok  the owner saves the keys encrypted and sees every studio';

  -- 3. The owner can't decrypt; a studio admin can't save, see status, the overview or the tables.
  BEGIN
    PERFORM * FROM get_platform_takbull_credentials();
    RAISE EXCEPTION 'FAIL the owner decrypted the keys in the browser';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  BEGIN
    PERFORM save_platform_takbull_credentials('k', 's');
    RAISE EXCEPTION 'FAIL a studio admin saved platform keys';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM platform_billing_status();
    RAISE EXCEPTION 'FAIL a studio admin read the billing status';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM platform_billing_overview();
    RAISE EXCEPTION 'FAIL a studio admin read the overview';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  only the owner reaches the billing functions; nobody decrypts in the browser';

  -- 4. The service role decrypts; a month can succeed only once.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
  SELECT * INTO r FROM get_platform_takbull_credentials();
  IF r.api_key <> 'pkey-9876' OR r.api_secret <> 'psecret-wxyz' THEN RAISE EXCEPTION 'FAIL service read'; END IF;
  INSERT INTO platform_payments (tenant_id, period_month, attempt, amount_agorot, status)
  VALUES (photo, '2027-01-01', 1, 100, 'failed'), (photo, '2027-01-01', 2, 100, 'succeeded');
  BEGIN
    INSERT INTO platform_payments (tenant_id, period_month, attempt, amount_agorot, status)
    VALUES (photo, '2027-01-01', 3, 100, 'succeeded');
    RAISE EXCEPTION 'FAIL a month was paid twice';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO platform_payments (tenant_id, period_month, amount_agorot) VALUES (photo, '2027-02-15', 100);
    RAISE EXCEPTION 'FAIL a mid-month period was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok  service role decrypts; one successful charge per month';
END $$;

-- 5. Browser roles have no table access at all (the functions above are the only way in).
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'platform_billing_settings', 'SELECT')
     OR has_table_privilege('authenticated', 'studio_subscriptions', 'SELECT')
     OR has_table_privilege('authenticated', 'platform_payments', 'SELECT')
     OR has_table_privilege('anon', 'studio_subscriptions', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL a browser role can read a billing table';
  END IF;
  RAISE NOTICE 'ok  browser roles cannot read the billing tables';
END $$;

-- 6. Step B2: the card token is saved encrypted by the service role only; a studio admin sees
--    their own card and last charge (never the token); other roles can't.
DO $$
DECLARE
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  r RECORD;
  v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  BEGIN
    PERFORM save_studio_card_token(photo, 'tok', '4242', '12/30', '2027-02-01');
    RAISE EXCEPTION 'FAIL an admin saved a card token';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
  PERFORM save_studio_card_token(photo, ' tok-secret-1 ', '4242', '12/30', '2027-02-01');
  SELECT * INTO r FROM studio_subscriptions WHERE tenant_id = photo;
  IF position('tok-secret-1' IN encode(r.card_token_enc, 'escape')) > 0 THEN RAISE EXCEPTION 'FAIL token not encrypted'; END IF;
  IF r.card_last4 <> '4242' OR r.card_expiry <> '12/30' OR r.next_charge_on <> '2027-02-01' THEN RAISE EXCEPTION 'FAIL card row %', r; END IF;
  SELECT get_studio_card_token(photo) INTO v;
  IF v <> 'tok-secret-1' THEN RAISE EXCEPTION 'FAIL token read back'; END IF;
  -- A new card replaces the old one and clears failed attempts.
  UPDATE studio_subscriptions SET failed_attempts = 2 WHERE tenant_id = photo;
  PERFORM save_studio_card_token(photo, 'tok-2', 'x', 'bad', NULL);
  SELECT * INTO r FROM studio_subscriptions WHERE tenant_id = photo;
  IF r.card_last4 IS NOT NULL OR r.card_expiry IS NOT NULL OR r.failed_attempts <> 0 OR r.next_charge_on <> '2027-02-01' THEN
    RAISE EXCEPTION 'FAIL replace card %', r;
  END IF;
  RAISE NOTICE 'ok  only the service role saves and reads the card token, encrypted';

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  BEGIN
    PERFORM get_studio_card_token(photo);
    RAISE EXCEPTION 'FAIL an admin read the card token';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT * INTO r FROM my_studio_subscription();
  IF r.next_charge_on <> '2027-02-01' OR r.last_payment_status <> 'succeeded' THEN RAISE EXCEPTION 'FAIL admin view %', r; END IF;
  PERFORM set_config('request.jwt.claim.sub', dina::text, false);
  BEGIN
    PERFORM * FROM my_studio_subscription();
    RAISE EXCEPTION 'FAIL a parent read the plan billing';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  a studio admin sees their own plan card; a parent cannot';
END $$;

-- 7. Step B3: only the platform owner switches the monthly charge on or off.
DO $$
DECLARE
  owner_id UUID := 'b0000000-0000-4000-8000-0000000000f1';
  admin    UUID := 'b0000000-0000-4000-8000-00000000000e';
  r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  BEGIN
    PERFORM set_platform_charging(true);
    RAISE EXCEPTION 'FAIL a studio admin switched charging on';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, false);
  PERFORM set_platform_charging(true);
  SELECT * INTO r FROM platform_billing_status();
  IF NOT r.charging_enabled THEN RAISE EXCEPTION 'FAIL charging not on'; END IF;
  PERFORM set_platform_charging(false);
  SELECT * INTO r FROM platform_billing_status();
  IF r.charging_enabled THEN RAISE EXCEPTION 'FAIL charging not off'; END IF;
  RAISE NOTICE 'ok  only the platform owner switches monthly charging';
END $$;
