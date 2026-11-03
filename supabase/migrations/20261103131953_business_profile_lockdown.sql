-- =============================================================================
-- The four business-profile columns change only through set_business_profile()
-- (audited). A studio admin's direct UPDATE of those columns is refused; every
-- other tenant column is unaffected.
--
-- set_business_profile() is SECURITY DEFINER, so inside it current_user is the
-- function owner, not the caller's role. A direct PostgREST update runs as
-- 'authenticated' (or 'anon'), which this trigger refuses. service_role and
-- database owners (migrations, backfills) are not restricted.
-- =============================================================================
CREATE OR REPLACE FUNCTION guard_tenant_business_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.payment_flow    IS DISTINCT FROM OLD.payment_flow
       OR NEW.teaches_classes IS DISTINCT FROM OLD.teaches_classes
       OR NEW.family_accounts IS DISTINCT FROM OLD.family_accounts
       OR NEW.client_booking  IS DISTINCT FROM OLD.client_booking) THEN
    RAISE EXCEPTION 'business_profile_use_setter'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Change the business profile with set_business_profile().';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_guard_business_profile ON tenants;
CREATE TRIGGER tenants_guard_business_profile
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_business_profile();
