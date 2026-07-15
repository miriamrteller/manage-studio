-- =============================================================================
-- 003800: Table grants for scheduling tables
-- The base grants migration (002500) runs before the scheduling tables exist
-- (003300/003400), so those tables had RLS policies but no table-level privileges,
-- causing "permission denied for table" (42501) for the authenticated role.
-- RLS still restricts every row to the tenant's admins; these grants only lift the
-- table-level privilege check.
-- DEPENDENCIES: 003300, 003400
-- =============================================================================

GRANT SELECT ON TABLE
  public.tenant_scheduling_settings,
  public.tenant_scheduling_hours,
  public.scheduling_blocks,
  public.scheduling_holds
TO authenticated;

-- One row per tenant, upserted by admins.
GRANT INSERT, UPDATE ON TABLE public.tenant_scheduling_settings TO authenticated;

-- Admin-managed collections (hours are replace-all: delete + insert).
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.tenant_scheduling_hours,
  public.scheduling_blocks,
  public.scheduling_holds
TO authenticated;
