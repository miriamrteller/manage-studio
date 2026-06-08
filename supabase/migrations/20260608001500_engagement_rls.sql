-- =============================================================================
-- 001500: Engagement-dependent RLS policies
-- These policies reference engagements, so they are deferred to after 001300.
-- They extend the base policies on offering_sessions (000800) and
-- billing_accounts (001100) to let enrolled families/students read their rows.
-- DEPENDENCIES: 000300, 000800, 001100, 001300
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
