-- =============================================================================
-- Platform access log: studios can see when the OpalSwift platform owner
-- (super_admin, reserved for one account by 20260827000100) touches their data.
--
-- 1. platform_access_log: append-only. Nobody can UPDATE or TRUNCATE it, and
--    rows can be deleted only once they are older than 24 months (retention;
--    docs/deployment/DEV-PROD-PIPELINE.md, "Platform access log").
-- 2. 'change' rows: one generic AFTER INSERT/UPDATE/DELETE trigger on the
--    tenant-scoped tables below. It logs only when a signed-in super_admin
--    writes a row of a studio other than their own profile's studio. Service
--    role, cron and Edge Function writes (no auth.uid()) are never logged.
-- 3. 'view' rows: Postgres has no SELECT triggers, so the web app calls
--    log_platform_view(tenant, area) when a super_admin opens a studio page.
--    The same actor + studio + area is logged at most once per 10 minutes.
-- 4. Reads: a studio's tenant_admins see their own studio's rows; super_admin
--    sees all.
--
-- The log holds no personal data values: area (table name for changes), the
-- record id, and for updates only the names of the changed columns.
-- =============================================================================

CREATE TABLE platform_access_log (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No foreign key: the record outlives the studio (and must not block or be
  -- cascaded by a studio deletion).
  tenant_id UUID        NOT NULL,
  actor_id  UUID        NOT NULL,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind      TEXT        NOT NULL CHECK (kind IN ('view', 'change')),
  area      TEXT        NOT NULL CHECK (area ~ '^[a-z][a-z0-9_-]{0,62}$'),
  record_id UUID,
  detail    TEXT        CHECK (char_length(detail) <= 500)
);

COMMENT ON TABLE platform_access_log IS
  'OpalSwift platform-owner (super_admin) access to a studio''s data. Append-only; kept 24 months. No personal data values.';

CREATE INDEX idx_platform_access_log_tenant_at ON platform_access_log (tenant_id, at DESC);
CREATE INDEX idx_platform_access_log_view_dedupe
  ON platform_access_log (actor_id, tenant_id, area, at DESC) WHERE kind = 'view';

ALTER TABLE platform_access_log ENABLE ROW LEVEL SECURITY;

-- Rows are written only by the definer functions below; clients only read.
REVOKE ALL ON platform_access_log FROM anon, authenticated;
GRANT SELECT ON platform_access_log TO authenticated;

CREATE POLICY platform_access_log_super_admin_read ON platform_access_log
  FOR SELECT USING (is_super_admin());
CREATE POLICY platform_access_log_admin_read ON platform_access_log
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );

-- ---------------------------------------------------------------------------
-- Append-only guard (applies to every role, super_admin and service_role too)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_platform_access_log()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.at < now() - interval '24 months' THEN
      RETURN OLD;  -- retention purge
    END IF;
  END IF;
  RAISE EXCEPTION 'platform_access_log is append-only'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER platform_access_log_protect
  BEFORE UPDATE OR DELETE ON platform_access_log
  FOR EACH ROW EXECUTE FUNCTION protect_platform_access_log();
CREATE TRIGGER platform_access_log_no_truncate
  BEFORE TRUNCATE ON platform_access_log
  FOR EACH STATEMENT EXECUTE FUNCTION protect_platform_access_log();

-- ---------------------------------------------------------------------------
-- Is the caller the platform owner acting on a studio that is not their own?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform_access_should_log(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_tenant_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM user_profiles up
       WHERE up.id = auth.uid()
         AND 'super_admin' = ANY(up.role)
         AND up.tenant_id IS DISTINCT FROM p_tenant_id
     )
$$;

-- ---------------------------------------------------------------------------
-- 'change' rows: one generic trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_platform_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row     JSONB;
  v_tenant  UUID;
  v_id      TEXT;
  v_detail  TEXT;
BEGIN
  -- Cheap exit for every ordinary write (no session user, or not super_admin).
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  v_row := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  v_tenant := CASE WHEN TG_TABLE_NAME = 'tenants' THEN (v_row ->> 'id')::uuid
                   ELSE (v_row ->> 'tenant_id')::uuid END;
  IF NOT platform_access_should_log(v_tenant) THEN
    RETURN NULL;
  END IF;

  v_id := v_row ->> 'id';
  IF TG_OP = 'UPDATE' THEN
    -- Names of the changed columns only, never their values.
    SELECT 'update: ' || string_agg(n.key, ', ' ORDER BY n.key)
      INTO v_detail
      FROM jsonb_each(to_jsonb(NEW)) n
      WHERE n.key <> 'updated_at'
        AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
    v_detail := coalesce(v_detail, 'update: no changes');
  ELSE
    v_detail := lower(TG_OP);
  END IF;

  INSERT INTO platform_access_log (tenant_id, actor_id, kind, area, record_id, detail)
  VALUES (
    v_tenant, auth.uid(), 'change', TG_TABLE_NAME,
    CASE WHEN v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_id::uuid END,
    left(v_detail, 500)
  );
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'tenant_feature_overrides', 'user_profiles', 'staff',
    'people', 'accounts', 'account_members', 'leads',
    'engagements', 'attendance',
    'payments', 'billing_accounts',
    'waiver_events', 'waiver_evidence', 'consent_records'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_access_log_change ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER platform_access_log_change AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION log_platform_change()', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 'view' rows: called by the web app when a super_admin opens a studio page
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_platform_view(p_tenant_id UUID, p_area TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Anyone else (studio staff, parents) is a no-op, not an error: the app may
  -- call this without knowing the caller's role.
  IF NOT platform_access_should_log(p_tenant_id) THEN
    RETURN;
  END IF;
  IF p_area IS NULL OR p_area !~ '^[a-z][a-z0-9_-]{0,62}$' THEN
    RAISE EXCEPTION 'invalid area' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM platform_access_log
    WHERE kind = 'view' AND actor_id = auth.uid() AND tenant_id = p_tenant_id
      AND area = p_area AND at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;
  INSERT INTO platform_access_log (tenant_id, actor_id, kind, area)
  VALUES (p_tenant_id, auth.uid(), 'view', p_area);
END;
$$;

-- Tiers: supabase/security/definer-execute.json
REVOKE ALL ON FUNCTION log_platform_view(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION log_platform_view(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION log_platform_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform_access_should_log(UUID) FROM PUBLIC, anon, authenticated;
