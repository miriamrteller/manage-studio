-- Feature admin clean-up: seeded keys and tiers, operator-only functions, unchanged
-- get_tenant_features. Fixture: client-portal seed. Photo (…01) has admin …0e.
DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  f TEXT[];
  n INT;
BEGIN
  -- 1. Registry keys are in the table; Stripe and mock are not.
  SELECT count(*) INTO n FROM feature_definitions
  WHERE key IN ('people:contacts.manage', 'billing:payments.grow', 'billing:refunds.process',
                'ui:client.portal', 'people:waivers.collect', 'media:gallery.gated');
  IF n <> 6 THEN RAISE EXCEPTION 'FAIL missing registry keys (% of 6)', n; END IF;
  IF EXISTS (SELECT 1 FROM feature_definitions WHERE key IN ('billing:payments.stripe', 'billing:payments.mock')) THEN
    RAISE EXCEPTION 'FAIL stripe / mock must not be seeded';
  END IF;
  RAISE NOTICE 'ok  registry keys seeded, stripe and mock left out';

  -- 2. Tiers are unchanged here (the plan mapping comes with the owner's plans), and the
  --    free beta (trialing, no end date) still gets everything.
  IF (SELECT tier_minimum FROM feature_definitions WHERE key = 'billing:recurring.enabled') <> 'professional' THEN
    RAISE EXCEPTION 'FAIL tiers changed';
  END IF;
  IF (SELECT profile_gate FROM feature_definitions WHERE key = 'media:gallery.gated') <> 'project' THEN
    RAISE EXCEPTION 'FAIL gallery gate missing';
  END IF;
  UPDATE tenants SET plan = 'essential', sub_status = 'trialing', trial_ends_at = NULL WHERE id = photo;
  f := get_tenant_features(photo);
  IF NOT ('finance:export.bkmv' = ANY(f) AND 'people:contacts.manage' = ANY(f)) THEN
    RAISE EXCEPTION 'FAIL beta studio lost features: %', f;
  END IF;
  UPDATE tenants SET sub_status = 'active' WHERE id = photo;
  f := get_tenant_features(photo);
  IF 'finance:export.bkmv' = ANY(f) OR NOT ('people:contacts.manage' = ANY(f)) THEN
    RAISE EXCEPTION 'FAIL essential studio features wrong: %', f;
  END IF;
  RAISE NOTICE 'ok  tiers unchanged; the beta gets everything; essential keeps core';

  -- 3. A studio admin can neither read the states nor set an override.
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  BEGIN
    PERFORM * FROM platform_tenant_feature_states(photo);
    RAISE EXCEPTION 'FAIL admin read platform feature states';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM platform_set_feature_override(photo, 'finance:export.bkmv', true);
    RAISE EXCEPTION 'FAIL admin set an override';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  studio admins cannot use the platform feature functions';
END $$;

-- A platform super admin (the reserved-role trigger is bypassed for the fixture only).
ALTER TABLE user_profiles DISABLE TRIGGER USER;
INSERT INTO auth.users (id, email) VALUES ('c0000000-0000-4000-8000-000000000001', 'owner@x.test');
INSERT INTO user_profiles (id, tenant_id, role, email)
VALUES ('c0000000-0000-4000-8000-000000000001', NULL, '{super_admin}', 'owner@x.test');
ALTER TABLE user_profiles ENABLE TRIGGER USER;

DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  owner UUID := 'c0000000-0000-4000-8000-000000000001';
  r RECORD;
  n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', owner::text, false);
  UPDATE tenants SET plan = 'essential', sub_status = 'active', client_booking = false WHERE id = photo;

  -- 4. States: one row per feature, with its set and default.
  SELECT count(*) INTO n FROM platform_tenant_feature_states(photo);
  IF n <> (SELECT count(*) FROM feature_definitions WHERE deprecated_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL states rows % do not match definitions', n;
  END IF;
  SELECT * INTO r FROM platform_tenant_feature_states(photo) WHERE feature_key = 'finance:export.bkmv';
  IF r.feature_set <> 'extras' OR r.default_on OR r.effective OR r.override_enabled IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL bkmv state wrong: %', r;
  END IF;
  SELECT * INTO r FROM platform_tenant_feature_states(photo) WHERE feature_key = 'scheduling:booking.client';
  IF r.feature_set <> 'booking' OR r.default_on THEN RAISE EXCEPTION 'FAIL booking state wrong: %', r; END IF;
  SELECT * INTO r FROM platform_tenant_feature_states(photo) WHERE feature_key = 'people:contacts.manage';
  IF r.feature_set <> 'core' OR NOT r.default_on THEN RAISE EXCEPTION 'FAIL core state wrong: %', r; END IF;
  RAISE NOTICE 'ok  states show set, default and effective';

  -- 5. Grant an EXTRA, remove a core one, then back to defaults; each change is audited.
  PERFORM platform_set_feature_override(photo, 'finance:export.bkmv', true, 'Founder studio');
  PERFORM platform_set_feature_override(photo, 'comms:otp.sms', false, NULL);
  IF NOT ('finance:export.bkmv' = ANY(get_tenant_features(photo))) OR 'comms:otp.sms' = ANY(get_tenant_features(photo)) THEN
    RAISE EXCEPTION 'FAIL overrides not applied';
  END IF;
  SELECT * INTO r FROM platform_tenant_feature_states(photo) WHERE feature_key = 'finance:export.bkmv';
  IF NOT r.effective OR r.default_on OR r.override_note <> 'Founder studio' THEN RAISE EXCEPTION 'FAIL grant state: %', r; END IF;
  IF (SELECT set_by FROM tenant_feature_overrides WHERE tenant_id = photo AND feature_key = 'finance:export.bkmv') <> 'operator' THEN
    RAISE EXCEPTION 'FAIL override not marked operator';
  END IF;
  PERFORM platform_set_feature_override(photo, 'finance:export.bkmv', NULL);
  PERFORM platform_set_feature_override(photo, 'comms:otp.sms', NULL);
  IF EXISTS (SELECT 1 FROM tenant_feature_overrides WHERE tenant_id = photo) THEN
    RAISE EXCEPTION 'FAIL reset left overrides';
  END IF;
  SELECT count(*) INTO n FROM audit_log WHERE tenant_id = photo AND entity_type = 'feature_override' AND actor_id = owner;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL expected 4 audit rows, got %', n; END IF;
  BEGIN
    PERFORM platform_set_feature_override(photo, 'nope:not.a.key', true);
    RAISE EXCEPTION 'FAIL unknown key accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'unknown_feature' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  operator grants, removes and resets; every change is audited';
END $$;
