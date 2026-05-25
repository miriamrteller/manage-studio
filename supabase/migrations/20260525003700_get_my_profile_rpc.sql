-- Migration 037: Reliable profile fetch for authenticated users
-- PostgREST returns 403 when the request uses the anon JWT (no table SELECT grant for anon).
-- This RPC runs as SECURITY DEFINER and only returns the caller's own row.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.user_profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.user_profiles
  WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
