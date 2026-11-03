-- =============================================================================
-- "General by default": a studio's business profile decides which features are
-- ON by default. Additive; nothing existing changes for any studio that exists
-- today.
--
--   tenants.payment_flow     'recurring' (monthly plans) | 'project' (per project) | 'both'
--   tenants.teaches_classes  classes, levels, seasons, timetable
--   tenants.family_accounts  parents pay for children
--   tenants.client_booking   clients book time slots (calendar, no-show rules)
--
-- feature_definitions.profile_gate names the profile setting a feature needs.
-- get_tenant_features() = (plan + skin + profile_gate defaults) with operator
-- overrides on top. Core features have no gate and are never switched by the
-- profile. Money (monthly run, renewal billing, payment recording) never reads
-- features at all: switching a feature off hides it, it never stops charging.
-- =============================================================================

-- Existing studios keep every feature they have today (all on, 'both'); studios
-- created from now on start with the switches off.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS payment_flow    TEXT    NOT NULL DEFAULT 'both'
    CHECK (payment_flow IN ('recurring', 'project', 'both')),
  ADD COLUMN IF NOT EXISTS teaches_classes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS family_accounts BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS client_booking  BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE tenants
  ALTER COLUMN teaches_classes SET DEFAULT false,
  ALTER COLUMN family_accounts SET DEFAULT false,
  ALTER COLUMN client_booking  SET DEFAULT false;

COMMENT ON COLUMN tenants.payment_flow IS
  'How clients pay: recurring (monthly plans), project (per project: quote, deposit, balance) or both.';
COMMENT ON COLUMN tenants.teaches_classes IS 'true = classes, levels, seasons and timetable are on by default.';
COMMENT ON COLUMN tenants.family_accounts IS 'true = parents pay for children (family accounts) are on by default.';
COMMENT ON COLUMN tenants.client_booking  IS 'true = clients book time slots (calendar sync, no-show rules) are on by default.';

-- tenants has column-level SELECT grants (see 20261102211803).
GRANT SELECT (payment_flow, teaches_classes, family_accounts, client_booking)
  ON TABLE public.tenants TO authenticated;

-- ── feature_definitions.profile_gate ────────────────────────────────────────
ALTER TABLE feature_definitions
  ADD COLUMN IF NOT EXISTS profile_gate TEXT
    CHECK (profile_gate IN ('recurring', 'project', 'teaches_classes', 'family_accounts', 'client_booking'));

COMMENT ON COLUMN feature_definitions.profile_gate IS
  'NULL = not tied to the business profile. Otherwise the feature is on by default only when the studio profile has it: recurring (payment_flow recurring|both), project (project|both), or the named switch.';

-- Keys the sets need that were only in the TS registry (so could not be overridden).
-- Not gated: classes.manage is the offerings page every studio sells from (monthly
-- plans and services included), accounts.manage is per-client billing.
INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction, profile_gate) VALUES
  ('offerings:classes.manage', 'Create and edit what you sell: classes, services, programmes, plans', 'essential', NULL, NULL),
  ('billing:accounts.manage',  'Per-client billing accounts',                                        'essential', NULL, NULL),
  ('billing:quotes.generate',  'Quotes with deposit and balance',                                    'essential', NULL, 'project')
ON CONFLICT (key) DO NOTHING;

-- delivery.gated is for every project business, not just photographers.
UPDATE feature_definitions SET skin_restriction = NULL WHERE key = 'billing:delivery.gated';

UPDATE feature_definitions SET profile_gate = 'recurring'       WHERE key IN ('billing:recurring.enabled', 'billing:dunning.enabled');
UPDATE feature_definitions SET profile_gate = 'project'         WHERE key IN ('billing:quotes.generate', 'billing:delivery.gated');
UPDATE feature_definitions SET profile_gate = 'client_booking'  WHERE key IN (
  'scheduling:booking.client', 'scheduling:booking.admin',
  'scheduling:integration.google_calendar', 'scheduling:penalties.capture');
UPDATE feature_definitions SET profile_gate = 'teaches_classes' WHERE key IN (
  'offerings:structure.configure', 'offerings:booking.public', 'scheduling:calendar.view');
UPDATE feature_definitions SET profile_gate = 'family_accounts' WHERE key = 'people:families.manage';

-- ── get_tenant_features: same signature, adds the profile gate ──────────────
CREATE OR REPLACE FUNCTION get_tenant_features(p_tenant_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan           tenant_plan;
  v_skin           TEXT;
  v_status         TEXT;
  v_trial_ends_at  TIMESTAMPTZ;
  v_effective_plan tenant_plan;
  v_flow           TEXT;
  v_classes        BOOLEAN;
  v_families       BOOLEAN;
  v_booking        BOOLEAN;
BEGIN
  SELECT t.plan, t.skin, t.sub_status, t.trial_ends_at,
         t.payment_flow, t.teaches_classes, t.family_accounts, t.client_booking
    INTO v_plan, v_skin, v_status, v_trial_ends_at,
         v_flow, v_classes, v_families, v_booking
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF v_status = 'trialing' AND (v_trial_ends_at IS NULL OR v_trial_ends_at > now()) THEN
    v_effective_plan := 'professional';
  ELSE
    v_effective_plan := v_plan;
  END IF;

  RETURN ARRAY(
    SELECT fd.key
    FROM   feature_definitions fd
    WHERE  fd.deprecated_at IS NULL
      AND (v_effective_plan = 'professional'
           OR (v_effective_plan = 'essential' AND fd.tier_minimum = 'essential'))
      AND (fd.skin_restriction IS NULL OR fd.skin_restriction = v_skin)
      -- Profile gate: NULL = core, never switched by the profile
      AND (fd.profile_gate IS NULL
           OR (fd.profile_gate = 'recurring'       AND v_flow IN ('recurring', 'both'))
           OR (fd.profile_gate = 'project'         AND v_flow IN ('project', 'both'))
           OR (fd.profile_gate = 'teaches_classes' AND v_classes)
           OR (fd.profile_gate = 'family_accounts' AND v_families)
           OR (fd.profile_gate = 'client_booking'  AND v_booking))
      AND NOT EXISTS (
        SELECT 1 FROM tenant_feature_overrides tfo
        WHERE  tfo.tenant_id   = p_tenant_id
          AND  tfo.feature_key = fd.key
          AND  tfo.is_enabled  = false
      )

    UNION

    SELECT tfo.feature_key
    FROM   tenant_feature_overrides tfo
    WHERE  tfo.tenant_id  = p_tenant_id
      AND  tfo.is_enabled = true
  );
END;
$$;

-- ── set_business_profile: one audited setter ────────────────────────────────
-- A NULL argument leaves that setting as it is. Turning a switch off hides, it
-- never deletes or refuses (the caller shows a dismissible notice).
CREATE OR REPLACE FUNCTION set_business_profile(
  p_tenant_id       UUID,
  p_payment_flow    TEXT    DEFAULT NULL,
  p_teaches_classes BOOLEAN DEFAULT NULL,
  p_family_accounts BOOLEAN DEFAULT NULL,
  p_client_booking  BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before JSONB;
  v_after  JSONB;
BEGIN
  IF NOT COALESCE(is_super_admin(), false) AND (
       auth.uid() IS NULL
       OR p_tenant_id IS DISTINCT FROM get_my_tenant_id()
       OR NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
     ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_payment_flow IS NOT NULL AND p_payment_flow NOT IN ('recurring', 'project', 'both') THEN
    RAISE EXCEPTION 'payment_flow must be recurring, project or both';
  END IF;

  SELECT jsonb_build_object('payment_flow', payment_flow, 'teaches_classes', teaches_classes,
                            'family_accounts', family_accounts, 'client_booking', client_booking)
    INTO v_before FROM tenants WHERE id = p_tenant_id FOR UPDATE;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  UPDATE tenants SET
    payment_flow    = COALESCE(p_payment_flow, payment_flow),
    teaches_classes = COALESCE(p_teaches_classes, teaches_classes),
    family_accounts = COALESCE(p_family_accounts, family_accounts),
    client_booking  = COALESCE(p_client_booking, client_booking),
    updated_at      = now()
  WHERE id = p_tenant_id
  RETURNING jsonb_build_object('payment_flow', payment_flow, 'teaches_classes', teaches_classes,
                               'family_accounts', family_accounts, 'client_booking', client_booking)
    INTO v_after;

  IF v_after IS DISTINCT FROM v_before THEN
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
    VALUES (p_tenant_id, auth.uid(), 'UPDATE', 'business_profile', p_tenant_id, v_before, v_after);
  END IF;

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION set_business_profile(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_business_profile(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;
