-- =============================================================================
-- 013: RLS Policies Requiring Engagements
-- These policies reference engagements and must run after 011
-- DEPENDENCIES: 002, 007, 010, 011
-- =============================================================================

CREATE POLICY "enrolled students see sessions" ON offering_sessions FOR SELECT
  USING (
    offering_id IN (
      SELECT offering_id FROM engagements WHERE person_id = get_my_person_id()
    )
  );

CREATE POLICY "accounts see enrolled sessions" ON offering_sessions FOR SELECT
  USING (
    offering_id IN (
      SELECT offering_id FROM engagements
      WHERE person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids()))
    )
  );

CREATE POLICY "accounts see enrolled billing_accounts" ON billing_accounts FOR SELECT
  USING (
    id IN (
      SELECT billing_account_id FROM engagements
      WHERE billing_account_id IS NOT NULL
        AND person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids()))
    )
  );

CREATE POLICY "adult students see own billing_accounts" ON billing_accounts FOR SELECT
  USING (
    id IN (
      SELECT billing_account_id FROM engagements
      WHERE billing_account_id IS NOT NULL
        AND person_id = get_my_person_id()
    )
  );
