-- =============================================================================
-- 020: Parent / adult-student self-service enrolment (RLS)
-- Grants INSERT on engagements (pending_payment) and people (new children).
-- GRANT INSERT already exists in 018; RLS had admin-only writes until now.
-- DEPENDENCIES: 002, 011, 018
-- =============================================================================

CREATE POLICY "account holders create child engagements"
  ON engagements FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND status = 'pending_payment'
    AND person_id IN (
      SELECT id FROM people
      WHERE tenant_id = get_my_tenant_id()
        AND account_id IN (SELECT get_my_account_ids())
    )
  );

CREATE POLICY "adult students create own engagements"
  ON engagements FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND status = 'pending_payment'
    AND person_id = get_my_person_id()
  );

CREATE POLICY "account holders create account children"
  ON people FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND status = 'active'
    AND account_id IN (SELECT get_my_account_ids())
  );
