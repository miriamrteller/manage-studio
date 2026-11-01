-- =============================================================================
-- Legal profile per tenant + legal acceptance records
-- (docs/legal/APP-GAPS.md "Legal links" and "Consent checkboxes";
--  docs/legal/TENANT-LEGAL-SETUP.md "For the automatic onboarding")
--
-- tenants.legal_profile   JSONB of the studio's legal details (legal name,
--                         business status/number, contacts, vertical answers).
--                         Fills the [[placeholders]] of the in-app legal pages.
--                         Validated in the app (apps/web/src/legal/profile.ts).
-- tenants.legal_pages_published
--                         false until an admin has reviewed the generated pages;
--                         the footer links to the in-app privacy/terms pages
--                         only when true (or when an external URL is set).
-- legal_acceptances       Append-only record of who accepted which legal
--                         document version, when, from where.
--
-- Additive only.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS legal_profile          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_pages_published  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_profile_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_legal_profile_object_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_legal_profile_object_check CHECK (jsonb_typeof(legal_profile) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN tenants.legal_profile IS 'Studio legal details that fill the in-app legal pages (see apps/web/src/legal/profile.ts).';
COMMENT ON COLUMN tenants.legal_pages_published IS 'true once an admin published the generated privacy/terms pages.';

-- 002700_grants.sql grants column-level SELECT computed at that time, so new
-- columns must be granted explicitly. Admin reads go through RLS ("users see
-- own tenant"); public pages use get_tenant_legal_profile() below.
GRANT SELECT (legal_profile, legal_pages_published, legal_profile_updated_at)
  ON TABLE public.tenants TO authenticated;

-- -----------------------------------------------------------------------------
-- Public read of the legal profile (footer + /legal pages, anon visitors).
-- Only non-secret, publication-intended fields are stored in legal_profile.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_tenant_legal_profile(p_tenant_id UUID)
RETURNS TABLE (
  tenant_id              UUID,
  name                   TEXT,
  contact_email          TEXT,
  skin                   TEXT,
  legal_profile          JSONB,
  legal_pages_published  BOOLEAN,
  legal_profile_updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.contact_email, t.skin, t.legal_profile,
         t.legal_pages_published, t.legal_profile_updated_at
  FROM tenants t
  WHERE t.id = p_tenant_id;
$$;

REVOKE ALL ON FUNCTION get_tenant_legal_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_legal_profile(UUID) TO anon, authenticated;

-- Keep legal_profile_updated_at current on every change of the profile.
CREATE OR REPLACE FUNCTION touch_tenant_legal_profile()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF NEW.legal_profile IS DISTINCT FROM OLD.legal_profile
     OR NEW.legal_pages_published IS DISTINCT FROM OLD.legal_pages_published THEN
    NEW.legal_profile_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_legal_profile_touch ON tenants;
CREATE TRIGGER tenant_legal_profile_touch
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION touch_tenant_legal_profile();

-- -----------------------------------------------------------------------------
-- legal_acceptances
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  engagement_id     UUID        REFERENCES engagements(id) ON DELETE SET NULL,
  document          TEXT        NOT NULL
                    CHECK (document IN (
                      'platform_terms', 'dpa', 'opalswift_privacy',
                      'enrolment_terms', 'studio_privacy'
                    )),
  document_version  TEXT        NOT NULL CHECK (length(document_version) BETWEEN 1 AND 64),
  language          TEXT        CHECK (language IN ('he', 'en')),
  accepted_by_role  TEXT        NOT NULL DEFAULT 'self'
                    CHECK (accepted_by_role IN ('self', 'guardian', 'tenant_admin')),
  ip_address        INET,
  user_agent        TEXT,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_tenant
  ON legal_acceptances (tenant_id, document, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_engagement
  ON legal_acceptances (engagement_id) WHERE engagement_id IS NOT NULL;

-- Append-only: an acceptance is evidence, never edited or removed by clients.
CREATE OR REPLACE FUNCTION prevent_legal_acceptance_change()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'legal_acceptances rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS legal_acceptances_append_only ON legal_acceptances;
CREATE TRIGGER legal_acceptances_append_only
  BEFORE UPDATE ON legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION prevent_legal_acceptance_change();

ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin reads legal_acceptances" ON legal_acceptances
  FOR SELECT USING (is_super_admin());
CREATE POLICY "admins read own tenant legal_acceptances" ON legal_acceptances
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );
CREATE POLICY "users read own legal_acceptances" ON legal_acceptances
  FOR SELECT USING (user_id = auth.uid());

REVOKE ALL ON TABLE legal_acceptances FROM anon, authenticated;
GRANT SELECT ON TABLE legal_acceptances TO authenticated;
GRANT ALL ON TABLE legal_acceptances TO service_role;

-- -----------------------------------------------------------------------------
-- record_legal_acceptance — the only client write path.
--
-- Signed-in callers record for themselves in their own tenant. Guests (anon)
-- may only record enrolment_terms / studio_privacy against an engagement that
-- belongs to the tenant and is still in a pending state, so the function can't
-- be used to write arbitrary rows. Platform documents need a signed-in tenant
-- admin. IP and user agent come from the request headers.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_legal_acceptance(
  p_tenant_id      UUID,
  p_documents      TEXT[],
  p_version        TEXT,
  p_language       TEXT DEFAULT NULL,
  p_engagement_id  UUID DEFAULT NULL,
  p_role           TEXT DEFAULT 'self'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_headers    JSONB;
  v_ip         INET;
  v_ua         TEXT;
  v_doc        TEXT;
  v_count      INTEGER := 0;
  v_is_admin   BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR p_documents IS NULL OR cardinality(p_documents) = 0 THEN
    RAISE EXCEPTION 'tenant and documents are required';
  END IF;
  IF p_role NOT IN ('self', 'guardian', 'tenant_admin') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  IF v_uid IS NOT NULL THEN
    -- A signed-in user records only for a tenant they belong to (or a new
    -- studio they just created, which makes them its member).
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = v_uid AND up.tenant_id = p_tenant_id
    ) AND NOT is_super_admin() THEN
      RAISE EXCEPTION 'not a member of this tenant';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = v_uid AND up.tenant_id = p_tenant_id AND 'tenant_admin' = ANY(up.role)
    ) INTO v_is_admin;
  ELSE
    IF p_engagement_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM engagements e
      WHERE e.id = p_engagement_id
        AND e.tenant_id = p_tenant_id
        AND e.status::text LIKE 'pending%'
    ) THEN
      RAISE EXCEPTION 'guest acceptance needs a pending engagement of this tenant';
    END IF;
  END IF;

  IF p_engagement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM engagements e WHERE e.id = p_engagement_id AND e.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'engagement does not belong to this tenant';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NOT NULL THEN
    BEGIN
      v_ip := split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)::inet;
    EXCEPTION WHEN others THEN
      v_ip := NULL;
    END;
    v_ua := left(v_headers->>'user-agent', 512);
  END IF;

  FOREACH v_doc IN ARRAY p_documents LOOP
    IF v_doc IN ('platform_terms', 'dpa', 'opalswift_privacy') THEN
      IF v_uid IS NULL OR NOT (v_is_admin OR is_super_admin()) THEN
        RAISE EXCEPTION 'platform documents must be accepted by a tenant admin';
      END IF;
    ELSIF v_doc NOT IN ('enrolment_terms', 'studio_privacy') THEN
      RAISE EXCEPTION 'unknown document %', v_doc;
    END IF;

    INSERT INTO legal_acceptances (
      tenant_id, user_id, engagement_id, document, document_version,
      language, accepted_by_role, ip_address, user_agent
    ) VALUES (
      p_tenant_id, v_uid, p_engagement_id, v_doc, p_version,
      CASE WHEN p_language IN ('he', 'en') THEN p_language END,
      CASE WHEN v_doc IN ('platform_terms', 'dpa', 'opalswift_privacy') THEN 'tenant_admin' ELSE p_role END,
      v_ip, v_ua
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION record_legal_acceptance(UUID, TEXT[], TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_legal_acceptance(UUID, TEXT[], TEXT, TEXT, UUID, TEXT) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Has a tenant admin accepted the current platform terms? (admin gate)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_platform_terms_acceptance(p_tenant_id UUID, p_version TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM legal_acceptances la
    WHERE la.tenant_id = p_tenant_id
      AND la.document = 'platform_terms'
      AND la.document_version = p_version
  )
  AND EXISTS (
    SELECT 1 FROM legal_acceptances la
    WHERE la.tenant_id = p_tenant_id
      AND la.document = 'dpa'
      AND la.document_version = p_version
  );
$$;

REVOKE ALL ON FUNCTION get_platform_terms_acceptance(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_platform_terms_acceptance(UUID, TEXT) TO authenticated;
