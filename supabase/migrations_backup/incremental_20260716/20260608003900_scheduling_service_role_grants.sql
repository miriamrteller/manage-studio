-- =============================================================================
-- 003900: service_role grants for scheduling tables
-- Edge Functions (prepare-booking-checkout, expire-scheduling-holds) read/write
-- scheduling_holds via the service_role key. Tables created after 002500's
-- blanket GRANT ALL … TO service_role do not inherit privileges automatically.
-- Without this, checkout fails with "Hold not found" even when the hold exists.
-- DEPENDENCIES: 003400, 003800
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.tenant_scheduling_settings,
  public.tenant_scheduling_hours,
  public.scheduling_blocks,
  public.scheduling_holds
TO service_role;
