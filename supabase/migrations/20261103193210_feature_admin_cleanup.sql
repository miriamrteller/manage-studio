-- =============================================================================
-- Feature admin clean-up (plans thread, on top of the business profile #289):
--
--  1. Every registry key a studio can have is now in feature_definitions, so the
--     owner can grant or remove it per studio (the FK blocked that before).
--     Not seeded on purpose: billing:payments.stripe (not offered; its menu items
--     must stay hidden) and billing:payments.mock (test-only provider).
--  2. Plan tiers are NOT changed here: the owner is choosing the plans (Project /
--     Studio by business type), and the tier mapping follows in its own change.
--  3. get_tenant_features keeps its signature and result. Its defaults part
--     moves to private.tenant_default_features so the platform page can show
--     "on by default" next to the owner's override.
--  4. Two operator-only functions for /platform/features (the page wrote to
--     columns that do not exist, and the table has no write grant):
--       platform_tenant_feature_states(tenant)  one row per feature
--       platform_set_feature_override(tenant, key, enabled|NULL, note)
--     Both refuse anyone but a platform super admin, and the setter writes the
--     studio's audit_log.
-- =============================================================================

-- ── 1. Missing keys ─────────────────────────────────────────────────────────
INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction, profile_gate) VALUES
  ('platform:tenant.isolation',  'Studio data kept separate from every other studio', 'essential', NULL, NULL),
  ('platform:auth.enabled',      'Sign-in for staff and clients',                     'essential', NULL, NULL),
  ('platform:settings.manage',   'Studio settings',                                   'essential', NULL, NULL),
  ('platform:trial.enabled',     'Free trial',                                        'essential', NULL, NULL),
  ('platform:signup.selfServe',  'Self-service studio sign-up',                       'essential', NULL, NULL),
  ('people:contacts.manage',     'Clients and contacts',                              'essential', NULL, NULL),
  ('people:waivers.collect',     'Signed forms and consents',                         'essential', NULL, NULL),
  ('people:evidence.hmac',       'Tamper-evident record of signed forms',             'essential', NULL, NULL),
  ('offerings:enrollment.wizard','Enrolment and booking flow',                        'essential', NULL, NULL),
  ('offerings:enrollment.guest', 'Sign up without an account first',                  'essential', NULL, NULL),
  ('billing:payments.grow',      'Card payments with Grow',                           'essential', NULL, NULL),
  ('billing:refunds.process',    'Refunds',                                           'essential', NULL, NULL),
  ('finance:health.monitor',     'Payment health overview',                           'essential', NULL, NULL),
  ('finance:vat.calculate',      'VAT on prices and receipts',                        'essential', NULL, NULL),
  ('finance:export.csv',         'Export to CSV',                                     'essential', NULL, NULL),
  ('finance:documents.tax',      'Receipts and tax documents',                        'essential', NULL, NULL),
  ('finance:references.grow',    'Grow payment references',                           'essential', NULL, NULL),
  ('comms:notifications.log',    'Record of messages sent',                           'essential', NULL, NULL),
  ('comms:preferences.manage',   'Message preferences',                               'essential', NULL, NULL),
  ('comms:otp.email',            'Sign-in codes by email',                            'essential', NULL, NULL),
  ('comms:otp.sms',              'Sign-in codes by SMS',                              'essential', NULL, NULL),
  ('comms:documents.email',      'Documents sent by email',                           'essential', NULL, NULL),
  ('ui:admin.panel',             'Studio admin area',                                 'essential', NULL, NULL),
  ('ui:client.portal',           'Client portal',                                     'essential', NULL, NULL),
  ('media:gallery.gated',        'Gallery released after payment',                    'essential', NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- Same form as #289 so the PROFILE_GATES sync test sees it.
UPDATE feature_definitions SET profile_gate = 'project' WHERE key = 'media:gallery.gated';

-- ── 3. Defaults, then the owner's overrides (same result as before) ─────────
CREATE OR REPLACE FUNCTION private.tenant_default_features(p_tenant_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
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

  -- Free beta: trialing with no end date gets the professional set (deliberate,
  -- see 20261102093252_self_serve_studio_signup). Trial terms are an owner decision.
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
      AND (fd.profile_gate IS NULL
           OR (fd.profile_gate = 'recurring'       AND v_flow IN ('recurring', 'both'))
           OR (fd.profile_gate = 'project'         AND v_flow IN ('project', 'both'))
           OR (fd.profile_gate = 'teaches_classes' AND v_classes)
           OR (fd.profile_gate = 'family_accounts' AND v_families)
           OR (fd.profile_gate = 'client_booking'  AND v_booking))
    ORDER BY fd.key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.tenant_default_features(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_tenant_features(p_tenant_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN ARRAY(
    SELECT d.key
    FROM   unnest(private.tenant_default_features(p_tenant_id)) AS d(key)
    WHERE  NOT EXISTS (
      SELECT 1 FROM tenant_feature_overrides tfo
      WHERE  tfo.tenant_id   = p_tenant_id
        AND  tfo.feature_key = d.key
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

-- ── 4. /platform/features ───────────────────────────────────────────────────
-- The set a feature belongs to, as the owner sees it.
CREATE OR REPLACE FUNCTION private.feature_set_of(p_profile_gate TEXT, p_tier tenant_plan)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_profile_gate
    WHEN 'recurring'       THEN 'monthly'
    WHEN 'project'         THEN 'projects'
    WHEN 'client_booking'  THEN 'booking'
    WHEN 'teaches_classes' THEN 'classes'
    WHEN 'family_accounts' THEN 'families'
    ELSE CASE WHEN p_tier = 'professional' THEN 'extras' ELSE 'core' END
  END;
$$;

CREATE OR REPLACE FUNCTION platform_tenant_feature_states(p_tenant_id UUID)
RETURNS TABLE (
  feature_key      TEXT,
  description      TEXT,
  feature_set      TEXT,
  tier_minimum     tenant_plan,
  profile_gate     TEXT,
  skin_restriction TEXT,
  default_on       BOOLEAN,
  override_enabled BOOLEAN,
  override_note    TEXT,
  effective        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults TEXT[];
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_defaults := private.tenant_default_features(p_tenant_id);

  RETURN QUERY
  SELECT fd.key,
         fd.description,
         private.feature_set_of(fd.profile_gate, fd.tier_minimum),
         fd.tier_minimum,
         fd.profile_gate,
         fd.skin_restriction,
         fd.key = ANY(v_defaults),
         tfo.is_enabled,
         tfo.note,
         COALESCE(tfo.is_enabled, fd.key = ANY(v_defaults))
  FROM   feature_definitions fd
  LEFT JOIN tenant_feature_overrides tfo
         ON tfo.tenant_id = p_tenant_id AND tfo.feature_key = fd.key
  WHERE  fd.deprecated_at IS NULL
  ORDER BY fd.key;
END;
$$;

REVOKE ALL ON FUNCTION platform_tenant_feature_states(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_tenant_feature_states(UUID) TO authenticated;

-- p_enabled: true = grant, false = remove, NULL = back to the default.
CREATE OR REPLACE FUNCTION platform_set_feature_override(
  p_tenant_id   UUID,
  p_feature_key TEXT,
  p_enabled     BOOLEAN,
  p_note        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before JSONB;
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM feature_definitions WHERE key = p_feature_key) THEN
    RAISE EXCEPTION 'unknown_feature';
  END IF;

  SELECT jsonb_build_object('is_enabled', is_enabled, 'note', note)
    INTO v_before
  FROM tenant_feature_overrides
  WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key;

  IF p_enabled IS NULL THEN
    DELETE FROM tenant_feature_overrides
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key;
  ELSE
    INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled, set_by, note)
    VALUES (p_tenant_id, p_feature_key, p_enabled, 'operator', NULLIF(btrim(p_note), ''))
    ON CONFLICT (tenant_id, feature_key) DO UPDATE
      SET is_enabled = EXCLUDED.is_enabled,
          set_by     = 'operator',
          note       = EXCLUDED.note,
          updated_at = now();
  END IF;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (p_tenant_id, auth.uid(), 'UPDATE', 'feature_override', p_tenant_id,
          jsonb_build_object('feature_key', p_feature_key) || COALESCE(v_before, '{}'::jsonb),
          jsonb_build_object('feature_key', p_feature_key, 'is_enabled', p_enabled,
                             'note', NULLIF(btrim(p_note), '')));
END;
$$;

REVOKE ALL ON FUNCTION platform_set_feature_override(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_set_feature_override(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;
