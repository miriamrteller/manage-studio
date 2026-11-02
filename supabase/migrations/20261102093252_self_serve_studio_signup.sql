-- Self-serve studio signup (free beta, no card) on app.opalswift.com.
--
-- The owner confirms their email first (Supabase email link, OpalSwift-branded).
-- handle_new_user (20261102084332) gives that account NO profile, because it signed
-- up without a studio. Then the setup wizard calls the provision-studio Edge
-- Function (action "self_serve"), which calls create_self_serve_studio below with
-- the service role. In one transaction it creates the studio (provision_studio),
-- makes the account the studio's tenant_admin, and stores the terms acceptance.
--
-- Free beta = the same status every studio has today: sub_status 'trialing' with
-- no trial_ends_at (get_tenant_features gives these the full feature set). Later
-- trial logic sets trial_ends_at. tenants.signup_source records how a studio was
-- created, for the platform owner's Studios list.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS signup_source TEXT NOT NULL DEFAULT 'operator'
    CHECK (signup_source IN ('operator', 'self_serve'));

COMMENT ON COLUMN public.tenants.signup_source IS
  'How the studio was created: operator (set up by OpalSwift, owner invited) or self_serve (the owner signed up on app.opalswift.com).';

CREATE OR REPLACE FUNCTION public.create_self_serve_studio(
  p_user_id            UUID,
  p_name               TEXT,
  p_subdomain          TEXT,
  p_plan               TEXT,
  p_vertical           TEXT,
  p_language_default   TEXT,
  p_country            TEXT,
  p_currency           TEXT,
  p_phone_region       TEXT,
  p_payment_provider   TEXT,
  p_invoicing_provider TEXT,
  p_primary_color      TEXT,
  p_accent_color       TEXT,
  p_terms_version      TEXT,
  p_terms_language     TEXT,
  p_ip_address         INET DEFAULT NULL,
  p_user_agent         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     TEXT;
  v_confirmed TIMESTAMPTZ;
  v_tenant_id UUID;
BEGIN
  -- One request at a time per account, so two tabs cannot create two studios.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_self_serve_studio:' || p_user_id::text, 0));

  SELECT lower(u.email), u.email_confirmed_at INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = p_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'email_not_confirmed';
  END IF;

  -- One studio per account: any profile means the account already belongs to a
  -- studio (or is the platform owner).
  IF EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = p_user_id)
     OR EXISTS (SELECT 1 FROM user_profiles p WHERE lower(p.email) = v_email) THEN
    RAISE EXCEPTION 'account_has_studio';
  END IF;

  IF p_terms_version IS NULL OR length(trim(p_terms_version)) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'terms_not_accepted';
  END IF;
  IF p_terms_language NOT IN ('he', 'en') THEN
    RAISE EXCEPTION 'p_terms_language must be he or en';
  END IF;

  -- Validates everything else (name, reserved/taken subdomain, vertical, providers, colours).
  v_tenant_id := provision_studio(
    p_name, p_subdomain, p_plan, p_vertical, v_email,
    p_language_default, p_country, p_currency, p_phone_region,
    p_payment_provider, p_invoicing_provider, p_primary_color, p_accent_color
  );

  UPDATE tenants SET signup_source = 'self_serve' WHERE id = v_tenant_id;

  INSERT INTO user_profiles (id, tenant_id, role, email, language, created_at, updated_at)
  VALUES (p_user_id, v_tenant_id, ARRAY['tenant_admin'], v_email, p_language_default, now(), now());

  INSERT INTO legal_acceptances (
    tenant_id, user_id, document, document_version, language,
    accepted_by_role, ip_address, user_agent
  )
  SELECT v_tenant_id, p_user_id, d, trim(p_terms_version), p_terms_language,
         'tenant_admin', p_ip_address, left(p_user_agent, 500)
  FROM unnest(ARRAY['platform_terms', 'dpa', 'opalswift_privacy']) AS d;

  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.create_self_serve_studio(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT) IS
  'Self-serve signup: creates a studio for a confirmed account that has no studio yet, makes it the tenant_admin and records the platform terms acceptance. service_role only (provision-studio Edge Function, action self_serve).';

REVOKE ALL ON FUNCTION public.create_self_serve_studio(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_self_serve_studio(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT) TO service_role;
