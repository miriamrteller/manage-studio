#!/usr/bin/env bash
# Self-serve studio signup (20261102093252_self_serve_studio_signup.sql). Needs
# Supabase's auth schema and every migration applied (the local stack), so
# sql-tests skips it (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/self-serve-signup/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS owner, gen_random_uuid() AS unconfirmed,
  'sss-' || substr(md5(random()::text), 1, 8) AS sub;

-- Create a studio as the provision-studio function does (service role).
CREATE FUNCTION pg_temp.create_for(p_user UUID, p_sub TEXT) RETURNS UUID LANGUAGE sql AS $$
  SELECT create_self_serve_studio(
    p_user, 'Harbour Yoga', p_sub, 'essential', 'generic',
    'en', 'IL', 'ILS', 'IL', 'grow', 'grow', '#5B6CFF', '#21D1C2',
    'terms-v1', 'en', '203.0.113.7'::inet, 'test-agent');
$$;

DO $$
DECLARE
  v_owner       UUID := (SELECT owner FROM pg_temp.ids);
  v_unconfirmed UUID := (SELECT unconfirmed FROM pg_temp.ids);
  v_sub         TEXT := (SELECT sub FROM pg_temp.ids);
  v_tenant      UUID;
  v_profile     user_profiles%ROWTYPE;
  v_t           tenants%ROWTYPE;
  v_n           INT;
BEGIN
  -- 1. The start page signs up with no studio: no profile yet (handle_new_user).
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_owner, 'Self.Serve@example.test', '{"signup":"self_serve_studio","language":"en"}'::jsonb),
         (v_unconfirmed, 'not-yet@example.test', '{"signup":"self_serve_studio"}'::jsonb);
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id IN (v_owner, v_unconfirmed)) THEN
    RAISE EXCEPTION 'FAIL a self-serve signup got a profile before creating a studio';
  END IF;
  RAISE NOTICE 'ok  a self-serve signup has no profile until the studio exists';

  -- 2. An unconfirmed email cannot create a studio.
  BEGIN
    PERFORM pg_temp.create_for(v_unconfirmed, v_sub || '-x');
    RAISE EXCEPTION 'FAIL an unconfirmed email created a studio';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%email_not_confirmed%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM tenants WHERE subdomain = v_sub || '-x') THEN
    RAISE EXCEPTION 'FAIL a studio was left behind for the unconfirmed email';
  END IF;
  RAISE NOTICE 'ok  an unconfirmed email is refused';

  -- 3. Confirmed: the studio, the admin profile and the terms acceptance, together.
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_owner;
  v_tenant := pg_temp.create_for(v_owner, v_sub);

  SELECT * INTO v_t FROM tenants WHERE id = v_tenant;
  IF v_t.subdomain <> v_sub OR v_t.signup_source <> 'self_serve' THEN
    RAISE EXCEPTION 'FAIL studio row: % %', v_t.subdomain, v_t.signup_source;
  END IF;
  IF v_t.sub_status <> 'trialing' OR v_t.trial_ends_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a free-beta studio should be trialing with no end, got % %', v_t.sub_status, v_t.trial_ends_at;
  END IF;
  IF v_t.contact_email <> 'self.serve@example.test' OR v_t.payment_provider = 'mock' THEN
    RAISE EXCEPTION 'FAIL contact email or payment provider: % %', v_t.contact_email, v_t.payment_provider;
  END IF;
  SELECT * INTO v_profile FROM user_profiles WHERE id = v_owner;
  IF v_profile.tenant_id IS DISTINCT FROM v_tenant OR v_profile.role <> ARRAY['tenant_admin'] THEN
    RAISE EXCEPTION 'FAIL owner profile: % %', v_profile.tenant_id, v_profile.role;
  END IF;
  SELECT count(*) INTO v_n FROM legal_acceptances
  WHERE tenant_id = v_tenant AND user_id = v_owner AND document_version = 'terms-v1'
    AND language = 'en' AND accepted_by_role = 'tenant_admin' AND ip_address = '203.0.113.7'::inet
    AND document IN ('platform_terms', 'dpa', 'opalswift_privacy');
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL expected 3 terms acceptances, got %', v_n; END IF;
  RAISE NOTICE 'ok  a confirmed account gets its studio, the admin role and the stored terms acceptance';

  -- 4. One studio per account.
  BEGIN
    PERFORM pg_temp.create_for(v_owner, v_sub || '-2');
    RAISE EXCEPTION 'FAIL a second studio was created for the same account';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%account_has_studio%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  a second studio for the same account is refused';

  -- 5. Reserved and taken addresses are refused, and nothing is left behind.
  -- (The second account, now confirmed, tries addresses it may not have.)
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_unconfirmed;
  BEGIN
    PERFORM pg_temp.create_for(v_unconfirmed, 'billing');
    RAISE EXCEPTION 'FAIL a reserved address was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%reserved%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM pg_temp.create_for(v_unconfirmed, v_sub);
    RAISE EXCEPTION 'FAIL a taken address was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%already taken%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = v_unconfirmed) THEN
    RAISE EXCEPTION 'FAIL a refused request left a profile behind';
  END IF;
  RAISE NOTICE 'ok  reserved and taken addresses are refused';

  -- 6. Terms must be accepted.
  BEGIN
    PERFORM create_self_serve_studio(
      v_unconfirmed, 'No terms', v_sub || '-t', 'essential', 'generic',
      'en', 'IL', 'ILS', 'IL', 'grow', 'grow', '#5B6CFF', '#21D1C2', '', 'en');
    RAISE EXCEPTION 'FAIL a studio was created without the terms';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%terms_not_accepted%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  the terms must be accepted';

  -- 7. The operator path is unchanged: provision_studio makes an 'operator' studio.
  v_tenant := provision_studio('Invited studio', v_sub || '-op', 'essential', 'generic', 'invited@example.test');
  IF (SELECT signup_source FROM tenants WHERE id = v_tenant) <> 'operator' THEN
    RAISE EXCEPTION 'FAIL an operator-created studio is not marked operator';
  END IF;
  RAISE NOTICE 'ok  operator-created studios are marked operator (invited path unchanged)';
END $$;

-- 8. Only the service role may call it.
DO $$
DECLARE who TEXT;
BEGIN
  FOREACH who IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', who);
    BEGIN
      PERFORM create_self_serve_studio(
        gen_random_uuid(), 'Nope', 'nope-' || who, 'essential', 'generic',
        'en', 'IL', 'ILS', 'IL', 'grow', 'grow', '#5B6CFF', '#21D1C2', 'v1', 'en');
      RAISE EXCEPTION 'FAIL % could call create_self_serve_studio', who;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  RAISE NOTICE 'ok  anon and authenticated cannot call create_self_serve_studio';
END $$;

ROLLBACK;
SQL
echo "self-serve-signup: all checks passed"
