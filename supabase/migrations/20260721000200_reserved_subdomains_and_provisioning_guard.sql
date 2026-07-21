-- =============================================================================
-- Production readiness — reserved subdomains + provisioning authorisation
--
-- Three changes, all prerequisites for serving tenants on *.opalswift.com:
--
--   1. is_reserved_subdomain() — infrastructure hostnames that must never become
--      tenants. `app.opalswift.com` serves the tenant-less shell (signup,
--      post-payment onboarding, session handoff); if a tenant could claim the
--      "app" subdomain it would shadow that shell. Mirrors RESERVED_SUBDOMAINS
--      in apps/web/src/lib/resolveTenantSubdomain.ts.
--
--   2. provision_tenant() gains p_owner_id so it can be called server-side, where
--      there is no auth.uid(). Paid signup provisions from the payment webhook
--      with service_role; the owner comes from the checkout session, not the JWT.
--
--   3. provision_tenant() is REVOKED from `authenticated`. It was callable by any
--      signed-up user, which allowed unlimited free tenant creation. Provisioning
--      is now server-side only.
--
-- Additive and idempotent: safe to re-run, no data migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reserved subdomains
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_reserved_subdomain(p_subdomain TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(p_subdomain)) = ANY (ARRAY[
    -- platform / marketing
    'opalswift', 'www', 'app', 'api', 'admin', 'auth',
    -- infrastructure
    'mail', 'smtp', 'imap', 'ftp', 'cdn', 'static', 'assets', 'media',
    'dev', 'staging', 'test', 'qa', 'demo', 'preview',
    'status', 'docs', 'help', 'support', 'billing', 'account', 'blog',
    -- reserved by convention / RFC 2142
    'localhost', 'postmaster', 'webmaster', 'hostmaster', 'abuse', 'security'
  ]);
$$;

COMMENT ON FUNCTION is_reserved_subdomain(TEXT) IS
  'Infrastructure and platform hostnames that may not be claimed as tenant subdomains. Mirrored in apps/web/src/lib/resolveTenantSubdomain.ts.';

GRANT EXECUTE ON FUNCTION is_reserved_subdomain(TEXT) TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 2. check_subdomain_available — reject reserved names
--    Also callable by service_role (no auth.uid()) for server-side signup.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_subdomain_available(p_subdomain TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_subdomain TEXT;
BEGIN
  -- Authenticated users (signup wizard) or service_role (server-side provisioning).
  IF auth.uid() IS NULL AND current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_subdomain := lower(trim(p_subdomain));

  IF v_subdomain IS NULL OR v_subdomain = '' THEN
    RETURN FALSE;
  END IF;

  IF v_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN FALSE;
  END IF;

  IF is_reserved_subdomain(v_subdomain) THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM tenants t WHERE t.subdomain = v_subdomain
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_subdomain_available(TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. provision_tenant — explicit owner + reserved guard + service_role only
-- -----------------------------------------------------------------------------

-- Old 5-arg signature is superseded by the 6-arg version below.
DROP FUNCTION IF EXISTS provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION provision_tenant(
  p_name        TEXT,
  p_subdomain   TEXT,
  p_plan        TEXT,   -- 'essential' | 'professional'
  p_vertical    TEXT,   -- verticals.id
  p_owner_email TEXT DEFAULT NULL,
  p_owner_id    UUID DEFAULT NULL  -- explicit owner for server-side provisioning
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_subdomain TEXT;
  v_owner_id  UUID;
BEGIN
  -- Owner is explicit (server-side, no JWT) or the caller (legacy wizard path).
  v_owner_id := COALESCE(p_owner_id, auth.uid());

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'p_owner_id is required when there is no authenticated caller';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_id) THEN
    RAISE EXCEPTION 'Owner user does not exist: %', v_owner_id;
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;

  v_subdomain := lower(trim(p_subdomain));
  IF v_subdomain IS NULL OR v_subdomain = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;
  IF v_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Invalid subdomain format';
  END IF;
  IF is_reserved_subdomain(v_subdomain) THEN
    RAISE EXCEPTION 'Subdomain is reserved: %', v_subdomain;
  END IF;
  IF EXISTS (SELECT 1 FROM tenants t WHERE t.subdomain = v_subdomain) THEN
    RAISE EXCEPTION 'Subdomain already taken: %', v_subdomain;
  END IF;

  IF p_plan NOT IN ('essential', 'professional') THEN
    RAISE EXCEPTION 'p_plan must be ''essential'' or ''professional'', got: %', p_plan;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM verticals WHERE id = p_vertical AND is_active = true) THEN
    RAISE EXCEPTION 'Unknown or inactive vertical: %', p_vertical;
  END IF;

  INSERT INTO tenants (
    name, subdomain, plan, skin,
    language_default, country, currency, phone_region,
    vat_rate, prices_include_vat,
    from_email,
    payment_provider, invoicing_provider
  )
  VALUES (
    trim(p_name),
    v_subdomain,
    p_plan::tenant_plan,
    p_vertical,
    'he', 'IL', 'ILS', 'IL',
    0, true,
    NULLIF(trim(COALESCE(p_owner_email, '')), ''),
    'grow', 'grow'
  )
  RETURNING id INTO v_tenant_id;

  -- Link the resolved owner as tenant_admin.
  INSERT INTO user_profiles (id, tenant_id, role)
  VALUES (v_owner_id, v_tenant_id, ARRAY['tenant_admin'])
  ON CONFLICT (id) DO UPDATE SET
    tenant_id  = v_tenant_id,
    role       = ARRAY['tenant_admin'],
    updated_at = now();

  -- Seed default expense categories (all tenants)
  INSERT INTO expense_categories (tenant_id, name, description, is_vat_eligible, sort_order)
  SELECT
    v_tenant_id,
    category.name,
    category.description,
    category.is_vat_eligible,
    category.sort_order
  FROM (VALUES
    ('שכירות סטודיו',     'Studio rent',                    true,  1),
    ('שכר מורים',         'Teacher wages',                  false, 2),
    ('ציוד',              'Equipment and supplies',         true,  3),
    ('שיווק',             'Marketing and advertising',      true,  4),
    ('תוכנה ומנויים',     'Software subscriptions',         true,  5),
    ('ביטוח',             'Insurance',                      true,  6),
    ('חשמל ומים',         'Utilities',                      true,  7),
    ('שירותים מקצועיים',  'Accountant, lawyer, consultant', true,  8),
    ('אחר',               'Other',                          true,  9)
  ) AS category(name, description, is_vat_eligible, sort_order)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) IS
  'Creates a tenant and links its owner as tenant_admin. service_role only — paid signup calls this from the payment webhook after the charge is verified.';

-- Provisioning is server-side only. Granting this to `authenticated` allows any
-- signed-up user to create unlimited tenants with no payment gate.
REVOKE ALL ON FUNCTION provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
