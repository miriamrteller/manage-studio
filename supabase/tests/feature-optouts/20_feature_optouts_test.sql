-- Studio opt-outs: a studio admin switches off non-core features it has, and back on; core and
-- features it doesn't have can't be touched; opt-outs come last in get_tenant_features.
-- Fixture: client-portal seed. Photo (…01) has admin …0e; Dance (…02) has parent Dina …0d.
DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  dance UUID := 'a0000000-0000-4000-8000-000000000002';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
  n INT;
  r RECORD;
BEGIN
  -- Photo: free beta (everything), monthly only, no classes.
  UPDATE tenants SET plan = 'essential', sub_status = 'trialing', trial_ends_at = NULL,
                     payment_flow = 'recurring', teaches_classes = false, family_accounts = false,
                     client_booking = true
  WHERE id = photo;
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);

  -- 1. The page lists only non-core features the studio has.
  SELECT count(*) INTO n FROM studio_feature_states(photo)
  WHERE feature_key IN ('people:contacts.manage', 'offerings:classes.manage', 'billing:accounts.manage');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL core features are listed'; END IF;
  IF EXISTS (SELECT 1 FROM studio_feature_states(photo) WHERE feature_key IN
             ('billing:quotes.generate', 'offerings:structure.configure', 'people:families.manage', 'platform:admin.super')) THEN
    RAISE EXCEPTION 'FAIL features the studio does not have (or platform keys) are listed';
  END IF;
  SELECT * INTO r FROM studio_feature_states(photo) WHERE feature_key = 'billing:dunning.enabled';
  IF NOT FOUND OR r.feature_set <> 'monthly' OR NOT r.is_on THEN RAISE EXCEPTION 'FAIL dunning row wrong: %', r; END IF;
  RAISE NOTICE 'ok  the page lists the non-core features the studio has';

  -- 2. Switch one off: it leaves get_tenant_features; back on: it returns. Both audited once.
  PERFORM set_feature_optout(photo, 'scheduling:integration.google_calendar', true);
  PERFORM set_feature_optout(photo, 'scheduling:integration.google_calendar', true);  -- no-op
  IF 'scheduling:integration.google_calendar' = ANY(get_tenant_features(photo)) THEN
    RAISE EXCEPTION 'FAIL opted-out feature still on';
  END IF;
  IF (SELECT is_on FROM studio_feature_states(photo) WHERE feature_key = 'scheduling:integration.google_calendar') THEN
    RAISE EXCEPTION 'FAIL page still shows it on';
  END IF;
  PERFORM set_feature_optout(photo, 'scheduling:integration.google_calendar', false);
  IF NOT ('scheduling:integration.google_calendar' = ANY(get_tenant_features(photo))) THEN
    RAISE EXCEPTION 'FAIL switching back on did not work';
  END IF;
  SELECT count(*) INTO n FROM audit_log WHERE tenant_id = photo AND entity_type = 'feature_optout';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL expected 2 audit rows, got %', n; END IF;
  RAISE NOTICE 'ok  off and back on, audited once each';

  -- 3. An opt-out wins over the owner's grant (the studio chose not to use it).
  INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled, set_by)
  VALUES (photo, 'billing:quotes.generate', true, 'operator');
  PERFORM set_feature_optout(photo, 'billing:quotes.generate', true);
  IF 'billing:quotes.generate' = ANY(get_tenant_features(photo)) THEN
    RAISE EXCEPTION 'FAIL opt-out did not come last';
  END IF;
  PERFORM set_feature_optout(photo, 'billing:quotes.generate', false);
  IF NOT ('billing:quotes.generate' = ANY(get_tenant_features(photo))) THEN
    RAISE EXCEPTION 'FAIL operator grant lost after switching back on';
  END IF;
  DELETE FROM tenant_feature_overrides WHERE tenant_id = photo;
  RAISE NOTICE 'ok  opt-outs come after the owner''s overrides';

  -- 4. Switching back on never adds a feature the studio doesn't have.
  PERFORM set_feature_optout(photo, 'people:families.manage', false);
  IF 'people:families.manage' = ANY(get_tenant_features(photo)) THEN
    RAISE EXCEPTION 'FAIL switching on gave a feature the studio does not have';
  END IF;
  RAISE NOTICE 'ok  an opt-out only removes';

  -- 5. Core can't be switched off.
  BEGIN
    PERFORM set_feature_optout(photo, 'people:contacts.manage', true);
    RAISE EXCEPTION 'FAIL core switched off';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok  core features cannot be switched off';
END $$;

DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  dance UUID := 'a0000000-0000-4000-8000-000000000002';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
BEGIN
  -- 6. Only an admin of the studio.
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  BEGIN
    PERFORM set_feature_optout(dance, 'billing:dunning.enabled', true);
    RAISE EXCEPTION 'FAIL admin changed another studio';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', dina::text, false);
  BEGIN
    PERFORM * FROM studio_feature_states(dance);
    RAISE EXCEPTION 'FAIL a parent read the features page';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM set_feature_optout(dance, 'billing:dunning.enabled', true);
    RAISE EXCEPTION 'FAIL a parent switched a feature off';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  only the studio''s own admins';
END $$;
