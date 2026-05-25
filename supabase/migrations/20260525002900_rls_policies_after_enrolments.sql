-- =============================================================================
-- RLS policies that require enrolments (and related tables) to exist
-- DEPENDS ON: 018 class_sessions, 023 billing_accounts, 026 enrolments, 002 people
-- =============================================================================

-- class_sessions: enrolled students and their families see sessions for classes they are in
CREATE POLICY "enrolled students see sessions" ON class_sessions FOR SELECT
  USING (
    class_id IN (
      SELECT class_id FROM enrolments
      WHERE person_id = get_my_person_id()
    )
  );

CREATE POLICY "families see enrolled sessions" ON class_sessions FOR SELECT
  USING (
    class_id IN (
      SELECT class_id FROM enrolments
      WHERE person_id IN (
        SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())
      )
    )
  );

-- billing_accounts: families see accounts linked to their enrolments
CREATE POLICY "families see enrolled billing_accounts" ON billing_accounts FOR SELECT
  USING (
    id IN (
      SELECT billing_account_id FROM enrolments
      WHERE billing_account_id IS NOT NULL
        AND person_id IN (
          SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())
        )
    )
  );

-- Adult students see their own billing account via enrolments
CREATE POLICY "adult students see own billing_accounts" ON billing_accounts FOR SELECT
  USING (
    id IN (
      SELECT billing_account_id FROM enrolments
      WHERE billing_account_id IS NOT NULL
        AND person_id = get_my_person_id()
    )
  );
