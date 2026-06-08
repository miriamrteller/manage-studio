-- waiver_evidence and waiver_events were created after the bulk grants migration
-- (20260526001800_grants.sql), so the authenticated role never received SELECT privilege.
-- Without this, Postgres throws 42501 before RLS policies are even evaluated.

GRANT SELECT ON TABLE public.waiver_evidence TO authenticated;
GRANT SELECT ON TABLE public.waiver_events   TO authenticated;

-- service_role already has ALL via the bulk grants migration, but be explicit.
GRANT ALL ON TABLE public.waiver_evidence TO service_role;
GRANT ALL ON TABLE public.waiver_events   TO service_role;
