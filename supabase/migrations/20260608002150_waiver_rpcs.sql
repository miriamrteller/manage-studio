-- =============================================================================
-- 002150: Waiver flow RPCs (post-auth guest waiver signing)
-- get_pending_waiver_engagement — fetch engagement details, authorized by JWT email.
-- get_engagement_person_id      — find unlinked person for an engagement.
-- DEPENDENCIES: 000300, 001300
-- =============================================================================

-- Authorizes via people.email = auth.email() so it works for newly-authenticated
-- users who have no user_profiles row yet. Returns any status (caller handles each).
CREATE OR REPLACE FUNCTION get_pending_waiver_engagement(p_engagement_id UUID)
RETURNS TABLE(person_id UUID, offering_id UUID, current_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT
      e.person_id,
      e.offering_id,
      e.status::TEXT AS current_status
    FROM engagements e
    JOIN people p ON p.id = e.person_id
    WHERE e.id = p_engagement_id
      AND p.email = auth.email();   -- authorizes via JWT email, no user_profiles needed
END;
$$;

REVOKE EXECUTE ON FUNCTION get_pending_waiver_engagement(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_pending_waiver_engagement(UUID) TO authenticated;

-- Security guard: only returns a result if the person is NOT yet linked to an auth
-- account (user_profile_id IS NULL), preventing hijacking of linked records.
CREATE OR REPLACE FUNCTION get_engagement_person_id(p_engagement_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_person_id UUID;
BEGIN
  SELECT p.id
    INTO v_person_id
    FROM engagements e
    JOIN people p ON p.id = e.person_id
   WHERE e.id = p_engagement_id
     AND p.user_profile_id IS NULL   -- only unlinked guest records
  LIMIT 1;

  RETURN v_person_id; -- NULL if not found or already linked
END;
$$;

REVOKE EXECUTE ON FUNCTION get_engagement_person_id(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_engagement_person_id(UUID) TO authenticated;

-- =============================================================================
-- After deploy, schedule the waiver deadline checker via pg_cron + pg_net:
--
-- SELECT cron.schedule(
--   'waiver-deadline-check',
--   '0 */6 * * *',
--   $$
--     SELECT net.http_post(
--       url     := current_setting('app.supabase_functions_url') || '/send-waiver-reminder',
--       headers := '{"Content-Type":"application/json"}',
--       body    := '{}'
--     )
--   $$
-- );
-- =============================================================================
