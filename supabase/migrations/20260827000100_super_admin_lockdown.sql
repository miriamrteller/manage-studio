-- =============================================================================
-- SUPER-ADMIN LOCKDOWN — exactly one platform owner, enforced by the database
--
-- super_admin is the platform-god role: FOR ALL policies on every table. It
-- was also being handed to fixture/tenant admins because tenant_admin lacked
-- an INSERT path on people — closing that gap is part of this migration, so
-- day-to-day admin intake never needs the god role again.
--
-- Owner: miriamrteller@gmail.com. Changing owners later is a deliberate act:
-- ship a migration that updates enforce_super_admin_reserved(), never a data
-- edit.
-- =============================================================================

-- 1. tenant_admin write access to people, mirroring the existing
--    "admins manage accounts" policy shape. Without this, admin walk-in
--    intake (insert person) only worked via super_admin.
CREATE POLICY "admins manage people" ON people FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

-- 2. Strip super_admin from every profile that is not the owner. Runs before
--    the guard trigger exists, so the strip itself cannot trip it.
UPDATE user_profiles p
SET role = array_remove(p.role, 'super_admin')
WHERE 'super_admin' = ANY(p.role)
  AND (
    lower(coalesce(p.email, '')) <> 'miriamrteller@gmail.com'
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = p.id AND lower(u.email) <> 'miriamrteller@gmail.com'
    )
  );

-- 3. Guard: no path may grant super_admin to anyone but the owner. The
--    profile's email must claim the owner AND any linked auth.users row must
--    agree — so neither a mislabeled profile nor a relabeled one slips
--    through. (A service-role actor can bypass any in-database guard by
--    definition; this stops every app path, RPC and accidental seed.)
CREATE OR REPLACE FUNCTION enforce_super_admin_reserved()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF 'super_admin' = ANY(NEW.role) THEN
    IF lower(coalesce(NEW.email, '')) <> 'miriamrteller@gmail.com'
       OR EXISTS (
         SELECT 1 FROM auth.users u
         WHERE u.id = NEW.id AND lower(u.email) <> 'miriamrteller@gmail.com'
       )
    THEN
      RAISE EXCEPTION 'super_admin is reserved for the platform owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_super_admin_reserved ON user_profiles;
CREATE TRIGGER trg_super_admin_reserved
  BEFORE INSERT OR UPDATE OF role, email ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_super_admin_reserved();
