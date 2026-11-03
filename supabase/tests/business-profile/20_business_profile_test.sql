-- Business profile: defaults, gates, the audited setter, and "money never reads features".
-- Fixture: client-portal seed. Photo (…01) has admin …0e; Dance (…02) has parent Dina …0d.
DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  dance UUID := 'a0000000-0000-4000-8000-000000000002';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
  f     TEXT[];
  r     JSONB;
  n     INT;
  bad   TEXT;
BEGIN
  -- 1. A new studio starts general: 'both' payment flows, every switch off.
  SELECT payment_flow || teaches_classes::text || family_accounts::text || client_booking::text INTO bad FROM tenants WHERE id = photo;
  IF bad <> 'bothfalsefalsefalse' THEN RAISE EXCEPTION 'FAIL new studio defaults are %', bad; END IF;
  f := get_tenant_features(photo);
  IF NOT ('finance:expenses.basic' = ANY(f) AND 'offerings:classes.manage' = ANY(f) AND 'billing:accounts.manage' = ANY(f)) THEN
    RAISE EXCEPTION 'FAIL core features missing: %', f;
  END IF;
  IF NOT ('billing:recurring.enabled' = ANY(f) AND 'billing:quotes.generate' = ANY(f) AND 'billing:delivery.gated' = ANY(f)) THEN
    RAISE EXCEPTION 'FAIL payment_flow both should switch on monthly and project features: %', f;
  END IF;
  IF f && ARRAY['people:families.manage','offerings:structure.configure','scheduling:calendar.view','offerings:booking.public',
                'scheduling:booking.client','scheduling:booking.admin','scheduling:integration.google_calendar','scheduling:penalties.capture'] THEN
    RAISE EXCEPTION 'FAIL switches are off but their features are on: %', f;
  END IF;
  RAISE NOTICE 'ok  a new studio gets core + monthly + project features; the four switches are off';

  -- 2. Payment flow decides monthly vs project; delivery is for every project business, not only photographers.
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  PERFORM set_business_profile(photo, 'recurring');
  f := get_tenant_features(photo);
  IF NOT ('billing:recurring.enabled' = ANY(f)) OR 'billing:quotes.generate' = ANY(f) OR 'billing:delivery.gated' = ANY(f) THEN
    RAISE EXCEPTION 'FAIL recurring flow wrong: %', f;
  END IF;
  PERFORM set_business_profile(dance, 'project');  -- not their studio
  RAISE EXCEPTION 'FAIL admin changed another studio';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  recurring flow = monthly only; an admin cannot change another studio';
END $$;

DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  dance UUID := 'a0000000-0000-4000-8000-000000000002';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
  f TEXT[]; r JSONB; n INT; bad TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);

  -- project flow: the reverse; delivery now on for a studio whose skin is not photographer
  UPDATE tenants SET skin = 'generic' WHERE id = photo;
  PERFORM set_business_profile(photo, 'project');
  f := get_tenant_features(photo);
  IF 'billing:recurring.enabled' = ANY(f) OR 'billing:dunning.enabled' = ANY(f)
     OR NOT ('billing:quotes.generate' = ANY(f) AND 'billing:delivery.gated' = ANY(f)) THEN
    RAISE EXCEPTION 'FAIL project flow wrong: %', f;
  END IF;
  RAISE NOTICE 'ok  project flow = quotes + delivery (any skin), no monthly';

  -- each switch turns on exactly its set
  PERFORM set_business_profile(photo, NULL, true, NULL, NULL);
  f := get_tenant_features(photo);
  IF NOT (f @> ARRAY['offerings:structure.configure','scheduling:calendar.view','offerings:booking.public'])
     OR 'people:families.manage' = ANY(f) OR 'scheduling:booking.client' = ANY(f) THEN
    RAISE EXCEPTION 'FAIL teaches_classes set wrong: %', f;
  END IF;
  PERFORM set_business_profile(photo, NULL, NULL, true, NULL);
  IF NOT ('people:families.manage' = ANY(get_tenant_features(photo))) THEN RAISE EXCEPTION 'FAIL family_accounts'; END IF;
  PERFORM set_business_profile(photo, NULL, NULL, NULL, true);
  f := get_tenant_features(photo);
  IF NOT (f @> ARRAY['scheduling:booking.client','scheduling:booking.admin','scheduling:integration.google_calendar','scheduling:penalties.capture']) THEN
    RAISE EXCEPTION 'FAIL client_booking set wrong: %', f;
  END IF;
  RAISE NOTICE 'ok  each switch turns on exactly its own features';

  -- switching off hides and never refuses, even with an enrolment on the books
  PERFORM set_business_profile(photo, NULL, false, false, false);
  IF get_tenant_features(photo) && ARRAY['offerings:structure.configure','people:families.manage','scheduling:booking.client'] THEN
    RAISE EXCEPTION 'FAIL switching off did not hide';
  END IF;
  RAISE NOTICE 'ok  switching off hides the features and is never refused';

  -- operator overrides sit on top of the profile
  INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled, set_by) VALUES
    (photo, 'people:families.manage', true, 'operator'),
    (photo, 'billing:quotes.generate', false, 'operator');
  f := get_tenant_features(photo);
  IF NOT ('people:families.manage' = ANY(f)) OR 'billing:quotes.generate' = ANY(f) THEN
    RAISE EXCEPTION 'FAIL operator overrides ignored: %', f;
  END IF;
  DELETE FROM tenant_feature_overrides WHERE tenant_id = photo;
  RAISE NOTICE 'ok  operator overrides still win over the profile';

  -- audit trail: one row per real change, none for a no-op, a bad value is refused
  SELECT count(*) INTO n FROM audit_log WHERE tenant_id = photo AND entity_type = 'business_profile';
  PERFORM set_business_profile(photo, NULL, false, false, false);
  IF (SELECT count(*) FROM audit_log WHERE tenant_id = photo AND entity_type = 'business_profile') <> n THEN
    RAISE EXCEPTION 'FAIL a no-op change wrote an audit row';
  END IF;
  IF n < 5 THEN RAISE EXCEPTION 'FAIL expected audit rows for the changes, got %', n; END IF;
  BEGIN
    PERFORM set_business_profile(photo, 'weekly');
    RAISE EXCEPTION 'FAIL bad payment_flow accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%payment_flow must be%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  every real change is audited; a no-op is not; a bad flow is refused';

  -- a client (not an admin) and an anonymous caller are refused
  PERFORM set_config('request.jwt.claim.sub', dina::text, false);
  BEGIN
    PERFORM set_business_profile(dance, 'project');
    RAISE EXCEPTION 'FAIL a client changed the profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  BEGIN
    PERFORM set_business_profile(dance, 'project');
    RAISE EXCEPTION 'FAIL an anonymous caller changed the profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF has_function_privilege('anon', 'set_business_profile(uuid,text,boolean,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute the setter';
  END IF;
  RAISE NOTICE 'ok  clients and anonymous callers cannot change the profile';

  -- THE MONEY INVARIANT: nothing that bills, charges or records a payment may read features.
  -- Switching a feature off must never stop charging a live plan.
  SELECT string_agg(p.proname, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname !~ '^(get_tenant_features|set_business_profile|get_tenant_config_by_(subdomain|host))$'
    AND p.prosrc ~* '(get_tenant_features|feature_definitions|tenant_feature_overrides|enabled_features)'
    AND p.proname ~* '(bill|charge|payment|renew|dunning|invoice|refund|recurring|subscription|collect)';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL money functions read features: %', bad; END IF;
  RAISE NOTICE 'ok  no billing/payment function reads features';
END $$;

-- The columns change only through the setter: a direct UPDATE as a signed-in admin is refused,
-- other tenant columns still update, and the setter itself still works.
DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE tenants SET teaches_classes = true WHERE id = photo;
    RAISE EXCEPTION 'FAIL a direct update of the profile was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'business_profile_use_setter' THEN RAISE; END IF;
  END;
  UPDATE tenants SET name = name WHERE id = photo;   -- other columns unaffected
  PERFORM set_business_profile(photo, NULL, true, NULL, NULL);
  IF NOT (SELECT teaches_classes FROM tenants WHERE id = photo) THEN RAISE EXCEPTION 'FAIL setter blocked by the guard'; END IF;
  RESET ROLE;
  RAISE NOTICE 'ok  direct profile updates are refused; the setter and other columns still work';
END $$;
