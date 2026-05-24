-- Migration: Postgres trigger to auto-create user_profiles on auth signup
-- DEPENDENCIES: Migration 001 (tenants and user_profiles tables must exist)
-- RATIONALE: When Supabase auth.users.INSERT fires, automatically create user_profiles row
--            with correct tenant_id (looked up from subdomain in metadata) and email denormalization

-- Step 1: Create trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_subdomain TEXT;
  v_email TEXT;
BEGIN
  -- Extract subdomain from auth metadata (set by frontend during signup)
  v_subdomain := NEW.user_metadata ->> 'subdomain';
  v_email := NEW.email;

  -- If no subdomain provided, fail with clear error
  IF v_subdomain IS NULL THEN
    RAISE EXCEPTION 'Missing subdomain in auth metadata during signup. User ID: %, Email: %', NEW.id, v_email;
  END IF;

  -- Look up tenant by subdomain
  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE subdomain = v_subdomain
  LIMIT 1;

  -- If tenant not found, fail with clear error
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for subdomain: %. User ID: %, Email: %', v_subdomain, NEW.id, v_email;
  END IF;

  -- Create user_profiles row atomically with auth.users
  -- (triggers run as superuser, so this bypasses RLS — this is intentional)
  INSERT INTO public.user_profiles (
    id,
    tenant_id,
    role,
    email,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    v_tenant_id,
    ARRAY['parent']::TEXT[],
    v_email,
    NOW(),
    NOW()
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error for debugging, but don't swallow the exception
  -- (frontend needs to see the error message)
  RAISE NOTICE 'Error creating user_profiles for auth.users.id=%: %', NEW.id, SQLERRM;
  -- Re-raise so frontend knows signup failed at this step
  RAISE;
END;
$$;

-- Step 2: Create trigger on auth.users INSERT
-- TIMING: AFTER INSERT (new auth.users row exists, fire the function)
-- WHEN: For every new row (FOR EACH ROW)
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Verify trigger exists
-- Run this after applying migration to confirm:
-- SELECT trigger_name, event_manipulation, event_object_table
-- FROM information_schema.triggers
-- WHERE trigger_name = 'on_auth_user_created';