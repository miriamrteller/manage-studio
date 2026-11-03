-- =============================================================================
-- Studio opt-outs (plans thread, PR2 of the feature clean-up).
--
-- What a studio HAS = defaults (plan + skin + business profile), then the
-- owner's overrides. What it USES = what it has, minus its own opt-outs.
-- A studio admin can switch off any non-core feature it has, and back on; it
-- can never switch on one it doesn't have (an opt-out only removes).
-- Core features (no profile gate, essential tier) can't be switched off.
--
-- Money never reads features: switching anything off hides it, it never stops
-- monthly fees, payments or receipts (supabase/tests/business-profile).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_feature_optouts (
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key TEXT        NOT NULL REFERENCES feature_definitions(key),
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_optouts_feature_key ON tenant_feature_optouts (feature_key);

ALTER TABLE tenant_feature_optouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tfoo_super_admin ON tenant_feature_optouts FOR ALL USING (is_super_admin());
CREATE POLICY tfoo_tenant_read ON tenant_feature_optouts FOR SELECT USING (tenant_id = get_my_tenant_id());
-- Writes only through set_feature_optout (audited).
GRANT SELECT ON tenant_feature_optouts TO authenticated;

-- ── get_tenant_features: same signature; opt-outs are the last step ─────────
CREATE OR REPLACE FUNCTION get_tenant_features(p_tenant_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN ARRAY(
    SELECT k.key
    FROM (
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
    ) AS k(key)
    WHERE NOT EXISTS (
      SELECT 1 FROM tenant_feature_optouts o
      WHERE  o.tenant_id = p_tenant_id AND o.feature_key = k.key
    )
  );
END;
$$;

-- ── private helpers ─────────────────────────────────────────────────────────
-- Features a studio sees on its own Features page: everything but core and the
-- platform's own keys.
CREATE OR REPLACE FUNCTION private.feature_studio_switchable(p_key TEXT, p_profile_gate TEXT, p_tier tenant_plan)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT private.feature_set_of(p_profile_gate, p_tier) <> 'core'
     AND p_key NOT LIKE 'platform:admin.%';
$$;

-- An admin of this studio, or a platform super admin.
CREATE OR REPLACE FUNCTION private.assert_studio_admin(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(is_super_admin(), false) THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL
     OR p_tenant_id IS DISTINCT FROM get_my_tenant_id()
     OR NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.assert_studio_admin(UUID) FROM PUBLIC, anon, authenticated;

-- ── studio_feature_states: the studio's own Features page ───────────────────
-- One row per non-core feature the studio HAS (before its opt-outs).
CREATE OR REPLACE FUNCTION studio_feature_states(p_tenant_id UUID)
RETURNS TABLE (
  feature_key TEXT,
  description TEXT,
  feature_set TEXT,
  is_on       BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has TEXT[];
BEGIN
  PERFORM private.assert_studio_admin(p_tenant_id);

  -- What the studio has: defaults and the owner's overrides, before opt-outs.
  v_has := ARRAY(
    SELECT d.key
    FROM   unnest(private.tenant_default_features(p_tenant_id)) AS d(key)
    WHERE  NOT EXISTS (
      SELECT 1 FROM tenant_feature_overrides tfo
      WHERE tfo.tenant_id = p_tenant_id AND tfo.feature_key = d.key AND tfo.is_enabled = false)
    UNION
    SELECT tfo.feature_key FROM tenant_feature_overrides tfo
    WHERE tfo.tenant_id = p_tenant_id AND tfo.is_enabled = true
  );

  RETURN QUERY
  SELECT fd.key,
         fd.description,
         private.feature_set_of(fd.profile_gate, fd.tier_minimum),
         NOT EXISTS (SELECT 1 FROM tenant_feature_optouts o
                     WHERE o.tenant_id = p_tenant_id AND o.feature_key = fd.key)
  FROM   feature_definitions fd
  WHERE  fd.deprecated_at IS NULL
    AND  fd.key = ANY(v_has)
    AND  private.feature_studio_switchable(fd.key, fd.profile_gate, fd.tier_minimum)
  ORDER BY fd.key;
END;
$$;

REVOKE ALL ON FUNCTION studio_feature_states(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION studio_feature_states(UUID) TO authenticated;

-- ── set_feature_optout: switch one of the studio's features off or back on ──
CREATE OR REPLACE FUNCTION set_feature_optout(p_tenant_id UUID, p_feature_key TEXT, p_off BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def feature_definitions%ROWTYPE;
  v_was BOOLEAN;
BEGIN
  PERFORM private.assert_studio_admin(p_tenant_id);

  SELECT * INTO v_def FROM feature_definitions WHERE key = p_feature_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_feature';
  END IF;
  IF NOT private.feature_studio_switchable(v_def.key, v_def.profile_gate, v_def.tier_minimum) THEN
    RAISE EXCEPTION 'core_feature' USING ERRCODE = 'check_violation';
  END IF;

  v_was := EXISTS (SELECT 1 FROM tenant_feature_optouts
                   WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key);

  IF p_off THEN
    INSERT INTO tenant_feature_optouts (tenant_id, feature_key, created_by)
    VALUES (p_tenant_id, p_feature_key, auth.uid())
    ON CONFLICT (tenant_id, feature_key) DO NOTHING;
  ELSE
    DELETE FROM tenant_feature_optouts WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key;
  END IF;

  IF v_was IS DISTINCT FROM p_off THEN
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
    VALUES (p_tenant_id, auth.uid(), 'UPDATE', 'feature_optout', p_tenant_id,
            jsonb_build_object('feature_key', p_feature_key, 'off', v_was),
            jsonb_build_object('feature_key', p_feature_key, 'off', p_off));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION set_feature_optout(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_feature_optout(UUID, TEXT, BOOLEAN) TO authenticated;
