-- Authorize parents/guardians signing a child's waiver, not only self-enrolments where
-- people.email = auth.email() (minors have no email on the student row).

CREATE OR REPLACE FUNCTION get_pending_waiver_engagement(p_engagement_id UUID)
RETURNS TABLE(person_id UUID, offering_id UUID, current_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      e.person_id,
      e.offering_id,
      e.status::TEXT AS current_status
    FROM engagements e
    JOIN people p ON p.id = e.person_id
    WHERE e.id = p_engagement_id
      AND (
        -- Adult self-enrolment
        (p.email IS NOT NULL AND lower(trim(p.email)) = lower(trim(auth.email())))
        OR
        -- Parent/guardian email on the family account
        EXISTS (
          SELECT 1
          FROM account_members am
          JOIN people guardian ON guardian.id = am.person_id
          WHERE p.account_id IS NOT NULL
            AND am.account_id = p.account_id
            AND am.role = 'account_holder'
            AND guardian.email IS NOT NULL
            AND lower(trim(guardian.email)) = lower(trim(auth.email()))
        )
        OR
        -- Signed-in user linked to the family account
        EXISTS (
          SELECT 1
          FROM account_members am
          WHERE p.account_id IS NOT NULL
            AND am.account_id = p.account_id
            AND am.user_profile_id = auth.uid()
        )
      );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_pending_waiver_engagement(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_pending_waiver_engagement(UUID) TO authenticated;
