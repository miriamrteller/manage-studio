-- One repeatable way to add a studio: the operator setup wizard (/platform/onboard)
-- calls the provision-studio Edge Function, which calls these two functions.
--
-- provision_tenant (20260608002500) stays as it is: paid signup uses it, and it needs
-- the owner's account first. A wizard-created studio has no owner account yet: the
-- owner is invited by email once the studio exists, so their account is created in
-- the new studio (handle_new_user reads the subdomain from the invite metadata).
--
-- Also: new studios default to English and to OpalSwift's brand colours. Existing
-- rows keep their values; only the column defaults change.

ALTER TABLE public.tenants ALTER COLUMN language_default SET DEFAULT 'en';
ALTER TABLE public.tenants ALTER COLUMN primary_color SET DEFAULT '#5B6CFF';
ALTER TABLE public.tenants ALTER COLUMN accent_color SET DEFAULT '#21D1C2';

CREATE OR REPLACE FUNCTION public.provision_studio(
  p_name               TEXT,
  p_subdomain          TEXT,
  p_plan               TEXT,
  p_vertical           TEXT,
  p_owner_email        TEXT,
  p_language_default   TEXT DEFAULT 'en',
  p_country            TEXT DEFAULT 'IL',
  p_currency           TEXT DEFAULT 'ILS',
  p_phone_region       TEXT DEFAULT 'IL',
  p_payment_provider   TEXT DEFAULT 'grow',
  p_invoicing_provider TEXT DEFAULT 'grow',
  p_primary_color      TEXT DEFAULT '#5B6CFF',
  p_accent_color       TEXT DEFAULT '#21D1C2'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_subdomain TEXT;
  v_email     TEXT;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;

  v_email := lower(trim(coalesce(p_owner_email, '')));
  IF v_email = '' OR position('@' IN v_email) < 2 THEN
    RAISE EXCEPTION 'p_owner_email is not a valid email address: %', p_owner_email;
  END IF;

  v_subdomain := lower(trim(coalesce(p_subdomain, '')));
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

  IF p_language_default NOT IN ('he', 'en') THEN
    RAISE EXCEPTION 'p_language_default must be he or en, got: %', p_language_default;
  END IF;
  IF p_country NOT IN ('IL', 'US') THEN
    RAISE EXCEPTION 'p_country must be IL or US, got: %', p_country;
  END IF;
  IF p_currency !~ '^[A-Z]{3}$' OR p_phone_region !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Invalid currency or phone region';
  END IF;

  -- Live providers only. Never 'mock' (test-only) or 'stripe' (dormant).
  IF p_payment_provider NOT IN ('offline', 'grow', 'icount', 'invoice4u', 'ypay', 'tranzila') THEN
    RAISE EXCEPTION 'Unsupported payment provider: %', p_payment_provider;
  END IF;
  IF p_invoicing_provider NOT IN ('none', 'grow', 'icount', 'invoice4u', 'ypay', 'tranzila', 'yesh', 'green_invoice') THEN
    RAISE EXCEPTION 'Unsupported invoicing provider: %', p_invoicing_provider;
  END IF;

  IF p_primary_color !~ '^#[0-9A-Fa-f]{6}$' OR p_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Colours must be #RRGGBB';
  END IF;

  INSERT INTO tenants (
    name, subdomain, plan, skin,
    language_default, country, currency, phone_region,
    contact_email,
    payment_provider, invoicing_provider,
    primary_color, accent_color
  )
  VALUES (
    trim(p_name), v_subdomain, p_plan::tenant_plan, p_vertical,
    p_language_default, p_country, p_currency, p_phone_region,
    -- Reply-To for every outbound email (see provision_tenant).
    v_email,
    p_payment_provider, p_invoicing_provider,
    p_primary_color, p_accent_color
  )
  RETURNING id INTO v_tenant_id;

  -- Same default expense categories as provision_tenant.
  INSERT INTO expense_categories (tenant_id, name, description, is_vat_eligible, sort_order)
  SELECT v_tenant_id, c.name, c.description, c.is_vat_eligible, c.sort_order
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
  ) AS c(name, description, is_vat_eligible, sort_order)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.provision_studio(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Creates a studio with its settings and no owner yet (the owner is invited by email). service_role only: called by the provision-studio Edge Function after it checks the caller is super_admin.';

REVOKE ALL ON FUNCTION public.provision_studio(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_studio(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Makes an invited owner the studio's admin. Only for a profile that already belongs
-- to that studio, so it can never move an account between studios, and never for the
-- platform owner (super_admin), whose role it would otherwise replace.
CREATE OR REPLACE FUNCTION public.assign_studio_owner(p_tenant_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_profiles
  SET role = ARRAY['tenant_admin'], updated_at = now()
  WHERE id = p_user_id
    AND tenant_id = p_tenant_id
    AND NOT ('super_admin' = ANY (role));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile for user % in tenant %', p_user_id, p_tenant_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assign_studio_owner(UUID, UUID) IS
  'Makes a studio''s invited owner its tenant_admin. service_role only (provision-studio Edge Function).';

REVOKE ALL ON FUNCTION public.assign_studio_owner(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_studio_owner(UUID, UUID) TO service_role;
