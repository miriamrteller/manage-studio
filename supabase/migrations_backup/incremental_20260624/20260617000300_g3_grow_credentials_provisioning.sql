-- G3: Grow (Meshulam) bundled credentials RPC + IL provisioning defaults.
-- Vendor-generic columns reused: payment_provider_account_id = Grow user id,
-- payment_provider_public_key = Grow page code, payment_provider_secret_enc = encrypted API key.
-- New migration only — does not edit shipped finance/provisioning migrations in place.

CREATE OR REPLACE FUNCTION save_tenant_grow_credentials(
  p_user_id   TEXT,
  p_page_code TEXT,
  p_api_key   TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND tenant_id = v_tenant_id AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;
  enc_key := current_setting('app.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN RAISE EXCEPTION 'app.encryption_key is not configured'; END IF;

  UPDATE tenants SET
    payment_provider             = 'grow',
    invoicing_provider           = 'grow',
    payment_provider_account_id  = NULLIF(trim(p_user_id), ''),
    payment_provider_public_key  = NULLIF(trim(p_page_code), ''),
    payment_provider_secret_enc  = CASE
      WHEN p_api_key IS NOT NULL AND trim(p_api_key) <> ''
      THEN pgp_sym_encrypt(trim(p_api_key), enc_key)
      ELSE payment_provider_secret_enc
    END,
    payment_provider_updated_at  = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_grow_credentials(TEXT, TEXT, TEXT) TO authenticated;

-- IL tenants provision as the Grow bundled product (grow/grow); other countries keep
-- the previous stripe/green_invoice defaults. Dev seed overrides to mock/mock separately.
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
  v_country   TEXT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can provision tenants';
  END IF;

  v_subdomain := lower(trim(p_subdomain));
  v_preset := CASE
    WHEN p_business_preset IN ('programs', 'services', 'catalog') THEN p_business_preset
    ELSE 'programs'
  END;
  v_country := CASE WHEN p_country IN ('IL', 'US') THEN p_country ELSE 'IL' END;

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
    from_email,
    payment_provider,
    invoicing_provider
  )
  VALUES (
    trim(p_name),
    v_subdomain,
    v_preset,
    COALESCE(p_labels, '{}'::jsonb),
    COALESCE(NULLIF(trim(p_primary_color), ''), '#76335a'),
    COALESCE(NULLIF(trim(p_accent_color), ''), '#e99ac4'),
    CASE WHEN p_language_default IN ('he', 'en') THEN p_language_default ELSE 'he' END,
    v_country,
    COALESCE(NULLIF(upper(trim(p_currency)), ''), 'ILS'),
    COALESCE(NULLIF(upper(trim(p_phone_region)), ''), 'IL'),
    COALESCE(p_vat_rate, 0.17),
    COALESCE(p_prices_include_vat, true),
    NULLIF(trim(p_from_email), ''),
    CASE WHEN v_country = 'IL' THEN 'grow' ELSE 'stripe' END,
    CASE WHEN v_country = 'IL' THEN 'grow' ELSE 'green_invoice' END
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

GRANT EXECUTE ON FUNCTION provision_tenant(
  TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT
) TO authenticated;
