-- =============================================================================

-- 016: Auth Trigger — auto-create user_profiles on Supabase signup

-- Reads subdomain from raw_user_meta_data (signInWithOtp options.data).

-- Falls back to creativeballet (or first tenant) for Dashboard-created users.

-- DEPENDENCIES: 001

-- =============================================================================



CREATE OR REPLACE FUNCTION public.handle_new_user()

RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$

DECLARE

  v_tenant_id UUID;

  v_subdomain TEXT;

  v_email     TEXT;

  v_preset    TEXT;

  v_default_role TEXT[];

BEGIN

  v_subdomain := NULLIF(trim(NEW.raw_user_meta_data ->> 'subdomain'), '');

  v_email     := NEW.email;



  IF v_subdomain IS NULL THEN

    SELECT subdomain INTO v_subdomain

    FROM tenants

    WHERE subdomain = 'creativeballet'

    LIMIT 1;



    IF v_subdomain IS NULL THEN

      SELECT subdomain INTO v_subdomain

      FROM tenants

      ORDER BY created_at

      LIMIT 1;

    END IF;



    IF v_subdomain IS NULL THEN

      RAISE EXCEPTION 'No tenant available for new user. User ID: %, Email: %', NEW.id, v_email;

    END IF;



    RAISE NOTICE 'handle_new_user: defaulting subdomain to % for user %', v_subdomain, NEW.id;

  END IF;



  SELECT id, business_preset INTO v_tenant_id, v_preset FROM tenants WHERE subdomain = v_subdomain LIMIT 1;



  IF v_tenant_id IS NULL THEN

    RAISE EXCEPTION 'Tenant not found for subdomain: %. User ID: %, Email: %', v_subdomain, NEW.id, v_email;

  END IF;



  v_default_role := CASE COALESCE(v_preset, 'programs')

    WHEN 'catalog' THEN ARRAY['customer']::TEXT[]

    WHEN 'services' THEN ARRAY['client']::TEXT[]

    ELSE ARRAY['account_holder']::TEXT[]

  END;



  INSERT INTO public.user_profiles (id, tenant_id, role, email, created_at, updated_at)

  VALUES (NEW.id, v_tenant_id, v_default_role, v_email, NOW(), NOW())

  ON CONFLICT (id) DO UPDATE SET

    email = EXCLUDED.email,

    updated_at = NOW();



  RETURN NEW;

EXCEPTION WHEN OTHERS THEN

  RAISE NOTICE 'Error creating user_profiles for auth.users.id=%: %', NEW.id, SQLERRM;

  RAISE;

END;

$$;



CREATE TRIGGER on_auth_user_created

  AFTER INSERT ON auth.users

  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


