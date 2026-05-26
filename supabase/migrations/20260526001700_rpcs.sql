-- =============================================================================
-- 017: Miscellaneous RPCs
-- get_my_profile — reliable profile fetch when PostgREST anon JWT causes 403
-- DEPENDENCIES: 001
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.user_profiles
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT * FROM public.user_profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
