-- =============================================================================
-- 019: Allow account holders and adult students to update people records
-- Parents may update their children's details; adult students may update self.
-- DEPENDENCIES: 002
-- =============================================================================

CREATE POLICY "account holders update own account people"
  ON people FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND account_id IN (SELECT get_my_account_ids())
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND account_id IN (SELECT get_my_account_ids())
  );

CREATE POLICY "adult students update self"
  ON people FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND id = get_my_person_id()
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND id = get_my_person_id()
  );
