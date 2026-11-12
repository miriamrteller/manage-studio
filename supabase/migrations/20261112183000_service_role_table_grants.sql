-- =============================================================================
-- Edge Functions (service role) can read and write every public table again.
--
-- On prod, new tables in public no longer get Supabase's usual grants: the
-- default privileges for postgres there give anon, authenticated and
-- service_role only TRUNCATE, REFERENCES, TRIGGER and MAINTAIN (no SELECT, INSERT, UPDATE or DELETE).
-- The local stack still has the old defaults, so tests passed while these
-- prod calls failed with "permission denied":
--   * platform_access_log    -> platform-support-session (confirm step: "log_failed")
--   * photo_shop_links       -> photo-shop-link (Send shop link, open link)
--   * client_sign_in_links   -> 3-day "Go to my page" sign-in links
--   * studio_subscriptions, platform_payments, platform_billing_settings,
--     billing_month_adjustments, payment_provider_token_cache, lead_form_invites,
--     and the rest listed by the check below.
--
-- Fix: give service_role the normal table rights on every public table, and
-- make that the default for tables made later. anon and authenticated are left
-- exactly as each migration set them. RLS and the append-only triggers (e.g. on
-- platform_access_log) still apply to everything else; service_role bypasses
-- RLS by design, as it does on every other table.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;

-- Fail the deploy if any public table is still closed to the service role.
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT (has_table_privilege('service_role', c.oid, 'SELECT')
         AND has_table_privilege('service_role', c.oid, 'INSERT')
         AND has_table_privilege('service_role', c.oid, 'UPDATE')
         AND has_table_privilege('service_role', c.oid, 'DELETE'));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'service_role still lacks table rights on: %', v_missing;
  END IF;
END $$;
