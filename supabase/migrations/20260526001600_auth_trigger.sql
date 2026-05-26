-- =============================================================================
-- 016: Auth Trigger — auto-create user_profiles on Supabase signup
-- DEPENDENCIES: 001
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_subdomain TEXT;
  v_email     TEXT;
BEGIN
  v_subdomain := NEW.user_metadata ->> 'subdomain';
  v_email     := NEW.email;

  IF v_subdomain IS NULL THEN
    RAISE EXCEPTION 'Missing subdomain in auth metadata during signup. User ID: %, Email: %', NEW.id, v_email;
  END IF;

  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = v_subdomain LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for subdomain: %. User ID: %, Email: %', v_subdomain, NEW.id, v_email;
  END IF;

  INSERT INTO public.user_profiles (id, tenant_id, role, email, created_at, updated_at)
  VALUES (NEW.id, v_tenant_id, ARRAY['parent']::TEXT[], v_email, NOW(), NOW());

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error creating user_profiles for auth.users.id=%: %', NEW.id, SQLERRM;
  RAISE;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
