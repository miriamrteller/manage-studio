-- =============================================================================
-- Self-serve custom domains (2/8): data model. Nothing calls it yet.
--
-- A studio admin connects their own address (app.theirdomain.com) from Settings.
-- The custom-domain Edge Function (service role) is the only writer: it creates
-- the Cloudflare for SaaS custom hostname, stores the DNS records to show, and
-- sets tenants.custom_domain when Cloudflare reports the hostname and its
-- certificate active. Studio admins can read their own rows; nobody else.
--
-- Owner rules, as columns:
--   auto_check_until  automatic checks stop 24 hours after a request or a
--                     "Check now"; then the status is 'paused' until "Check now"
--                     (which always works and opens a new 24-hour window).
--   delete_after      a hostname that never activates is removed from Cloudflare
--                     30 days after it was requested. Paused rows keep their
--                     Cloudflare hostname so a late "Check now" finds it at once.
--   removed_at        a removed hostname stays locked for 30 days: only the same
--                     studio can claim it again (dangling-record takeover guard).
--
-- Rollout: only studios listed in custom_domain_rollout (set by a super admin)
-- see the feature. managed_by = 'opalswift' marks domains OpalSwift connects by
-- hand (path A, a zone in our own Cloudflare account): read-only in the UI.
-- =============================================================================

CREATE TABLE IF NOT EXISTS custom_domain_rollout (
  tenant_id  UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled_by UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE custom_domain_rollout IS
  'Studios that can connect their own domain from Settings (self-serve custom domains, staged rollout). Super admin only.';

ALTER TABLE custom_domain_rollout ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_domain_rollout_super_admin ON custom_domain_rollout FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.custom_domain_rollout TO authenticated;
GRANT ALL ON TABLE public.custom_domain_rollout TO service_role;

CREATE TABLE IF NOT EXISTS tenant_custom_domains (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hostname         TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'paused', 'failed', 'removed')),
  managed_by       TEXT        NOT NULL DEFAULT 'self_serve'
                   CHECK (managed_by IN ('self_serve', 'opalswift')),
  cf_hostname_id   TEXT,
  ssl_status       TEXT,
  -- [{type, name, value}] the studio adds at its DNS provider (CNAME + TXT).
  dns_records      JSONB       NOT NULL DEFAULT '[]'::jsonb
                   CHECK (jsonb_typeof(dns_records) = 'array'),
  error_code       TEXT,
  auto_check_until TIMESTAMPTZ,
  last_checked_at  TIMESTAMPTZ,
  activated_at     TIMESTAMPTZ,
  delete_after     TIMESTAMPTZ,
  removed_at       TIMESTAMPTZ,
  requested_by     UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same shape rule as tenants.custom_domain (lower-case hostname, no scheme).
  CONSTRAINT tenant_custom_domains_hostname_shape CHECK (
    hostname = lower(hostname)
    AND length(hostname) <= 253
    AND hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ),
  CONSTRAINT tenant_custom_domains_removed_at CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

COMMENT ON TABLE tenant_custom_domains IS
  'A studio''s own domain and its connection state (Cloudflare for SaaS). Written only by the custom-domain Edge Function (service role); studio admins read their own.';

-- One live domain per studio, and a hostname belongs to one studio at a time.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_custom_domains_one_live_per_tenant
  ON tenant_custom_domains (tenant_id) WHERE status <> 'removed';
CREATE UNIQUE INDEX IF NOT EXISTS tenant_custom_domains_live_hostname
  ON tenant_custom_domains (hostname) WHERE status <> 'removed';
CREATE INDEX IF NOT EXISTS tenant_custom_domains_due
  ON tenant_custom_domains (auto_check_until) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS tenant_custom_domains_requested_by
  ON tenant_custom_domains (requested_by);

ALTER TABLE tenant_custom_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_custom_domains_super_admin ON tenant_custom_domains FOR SELECT
  USING (is_super_admin());
CREATE POLICY tenant_custom_domains_admin_read ON tenant_custom_domains FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
-- No write policies and no write grants: only the service role writes.
GRANT SELECT ON TABLE public.tenant_custom_domains TO authenticated;
GRANT ALL ON TABLE public.tenant_custom_domains TO service_role;

-- updated_at, and every status change goes to audit_log.
CREATE OR REPLACE FUNCTION tenant_custom_domains_touch_and_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
    VALUES (
      NEW.tenant_id,
      NEW.requested_by,
      'custom_domain.' || NEW.status,
      'tenant_custom_domain',
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('status', OLD.status, 'hostname', OLD.hostname) END,
      jsonb_build_object('status', NEW.status, 'hostname', NEW.hostname, 'error_code', NEW.error_code)
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tenant_custom_domains_touch_and_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_custom_domains_touch_and_audit ON tenant_custom_domains;
CREATE TRIGGER tenant_custom_domains_touch_and_audit
  BEFORE INSERT OR UPDATE ON tenant_custom_domains
  FOR EACH ROW EXECUTE FUNCTION tenant_custom_domains_touch_and_audit();

-- Can this studio use self-serve custom domains? Its own admins and super admins
-- may ask; anyone else gets false.
CREATE OR REPLACE FUNCTION custom_domain_enabled(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM custom_domain_rollout r WHERE r.tenant_id = p_tenant_id)
     AND (
       is_super_admin()
       OR auth.role() = 'service_role'
       OR (p_tenant_id = get_my_tenant_id() AND EXISTS (
             SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
     );
$$;
REVOKE ALL ON FUNCTION custom_domain_enabled(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION custom_domain_enabled(UUID) TO authenticated, service_role;

-- Sign-in handoff (app.<root> → studio's own address): is this host an ACTIVE
-- studio domain? Only then may the session be handed to it. Custom domains are
-- public (anyone can resolve them), so answering true/false leaks nothing.
CREATE OR REPLACE FUNCTION is_active_custom_domain(p_host TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT p_host IS NOT NULL
     AND length(p_host) <= 253
     AND EXISTS (SELECT 1 FROM tenants t WHERE t.custom_domain = lower(p_host));
$$;
REVOKE ALL ON FUNCTION is_active_custom_domain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_active_custom_domain(TEXT) TO anon, authenticated, service_role;

-- May this studio claim this hostname? False when another studio holds it live,
-- or removed it less than 30 days ago (the CNAME may still point at us).
CREATE OR REPLACE FUNCTION custom_domain_hostname_available(p_tenant_id UUID, p_hostname TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM tenant_custom_domains d
    WHERE d.hostname = lower(p_hostname)
      AND d.tenant_id <> p_tenant_id
      AND (d.status <> 'removed' OR d.removed_at > now() - interval '30 days')
  )
  AND NOT EXISTS (
    SELECT 1 FROM tenants t WHERE t.custom_domain = lower(p_hostname) AND t.id <> p_tenant_id
  );
$$;
REVOKE ALL ON FUNCTION custom_domain_hostname_available(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION custom_domain_hostname_available(UUID, TEXT) TO service_role;
