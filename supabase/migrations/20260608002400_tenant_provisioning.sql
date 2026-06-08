-- =============================================================================
-- 002400: Provision tenant RPCs (operator onboarding wizard) — super_admin only
-- provision_tenant accepts p_from_email so new tenants can send transactional
-- email immediately (send-waiver-reminder / stripe-webhook need tenants.from_email).
-- DEPENDENCIES: 000200, 000600 (expense_categories)
-- =============================================================================

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
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can check subdomain availability';
  END IF;

  v_subdomain := lower(trim(p_subdomain));

  IF v_subdomain IS NULL OR v_subdomain = '' THEN
    RETURN FALSE;
  END IF;

  IF v_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM tenants t WHERE t.subdomain = v_subdomain
  );
END;
$$;

CREATE OR REPLACE FUNCTION provision_tenant(
  p_name               TEXT,
  p_subdomain          TEXT,
  p_business_preset    TEXT DEFAULT 'programs',
  p_labels             JSONB DEFAULT '{}'::jsonb,
  p_primary_color      TEXT DEFAULT '#76335a',
  p_accent_color       TEXT DEFAULT '#e99ac4',
  p_language_default   TEXT DEFAULT 'he',
  p_country            TEXT DEFAULT 'IL',
  p_currency           TEXT DEFAULT 'ILS',
  p_phone_region       TEXT DEFAULT 'IL',
  p_vat_rate           NUMERIC DEFAULT 0.17,
  p_prices_include_vat BOOLEAN DEFAULT true,
  p_admin_email        TEXT DEFAULT NULL,
  p_from_email         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_subdomain TEXT;
  v_preset    TEXT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can provision tenants';
  END IF;

  v_subdomain := lower(trim(p_subdomain));
  v_preset := CASE
    WHEN p_business_preset IN ('programs', 'services', 'catalog') THEN p_business_preset
    ELSE 'programs'
  END;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;

  IF v_subdomain IS NULL OR v_subdomain = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  IF v_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Invalid subdomain format';
  END IF;

  IF NOT check_subdomain_available(v_subdomain) THEN
    RAISE EXCEPTION 'Subdomain already taken: %', v_subdomain;
  END IF;

  INSERT INTO tenants (
    name,
    subdomain,
    business_preset,
    labels,
    primary_color,
    accent_color,
    language_default,
    country,
    currency,
    phone_region,
    vat_rate,
    prices_include_vat,
    from_email
  )
  VALUES (
    trim(p_name),
    v_subdomain,
    v_preset,
    COALESCE(p_labels, '{}'::jsonb),
    COALESCE(NULLIF(trim(p_primary_color), ''), '#76335a'),
    COALESCE(NULLIF(trim(p_accent_color), ''), '#e99ac4'),
    CASE WHEN p_language_default IN ('he', 'en') THEN p_language_default ELSE 'he' END,
    CASE WHEN p_country IN ('IL', 'US') THEN p_country ELSE 'IL' END,
    COALESCE(NULLIF(upper(trim(p_currency)), ''), 'ILS'),
    COALESCE(NULLIF(upper(trim(p_phone_region)), ''), 'IL'),
    COALESCE(p_vat_rate, 0.17),
    COALESCE(p_prices_include_vat, true),
    NULLIF(trim(p_from_email), '')
  )
  RETURNING id INTO v_tenant_id;

  -- Seed default expense categories
  INSERT INTO expense_categories (tenant_id, name, description, is_vat_eligible, sort_order)
  SELECT
    v_tenant_id,
    category.name,
    category.description,
    category.is_vat_eligible,
    category.sort_order
  FROM (VALUES
    ('שכירות סטודיו',      'Studio rent',                   true,  1),
    ('שכר מורים',          'Teacher wages',                 false, 2),
    ('ציוד',               'Equipment and supplies',        true,  3),
    ('שיווק',              'Marketing and advertising',     true,  4),
    ('תוכנה ומנויים',      'Software subscriptions',        true,  5),
    ('ביטוח',              'Insurance',                     true,  6),
    ('חשמל ומים',          'Utilities',                     true,  7),
    ('שירותים מקצועיים',   'Accountant, lawyer, consultant',true,  8),
    ('אחר',                'Other',                         true,  9)
  ) AS category(name, description, is_vat_eligible, sort_order)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- p_admin_email reserved for future invite flow (V3.1)

  RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION check_subdomain_available(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION provision_tenant(
  TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT
) TO authenticated;
