-- Migration 036: Explicit table grants for PostgREST roles
-- Without these, authenticated clients can receive HTTP 403 on user_profiles
-- even when RLS policies would allow the row (id = auth.uid()).

GRANT SELECT ON TABLE public.tenants TO authenticated;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;

GRANT ALL ON TABLE public.tenants TO service_role;
GRANT ALL ON TABLE public.user_profiles TO service_role;
