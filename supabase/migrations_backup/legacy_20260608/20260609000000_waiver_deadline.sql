-- =============================================================================
-- Waiver deadline tracking columns + RPCs for guest waiver flow
-- =============================================================================

-- Add waiver deadline and reminder tracking to engagements
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS waiver_deadline TIMESTAMPTZ;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS waiver_48h_reminded_at TIMESTAMPTZ;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS waiver_5d_reminded_at TIMESTAMPTZ;

-- =============================================================================
-- RPC: get_pending_waiver_engagement
-- Used by EnrolCompletePage and SignWaiverPage after auth to fetch engagement
-- details and authorize the request. Authorization is via people.email = auth.email()
-- so it works for newly-authenticated users who have no user_profiles row yet.
-- Returns any status (caller handles each case), empty if email doesn't match.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_pending_waiver_engagement(p_engagement_id UUID)
RETURNS TABLE(person_id UUID, offering_id UUID, current_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

REVOKE EXECUTE ON FUNCTION get_pending_waiver_engagement FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_pending_waiver_engagement TO authenticated;

-- =============================================================================
-- RPC: get_engagement_person_id
-- Used by EnrolCompletePage and AuthCallbackPage to find the person_id for an
-- engagement so that link_auth_user_to_person can be called for newly
-- authenticated guest users (before user_profiles exists).
-- Security guard: only returns a result if the person is NOT yet linked to an
-- auth account (user_profile_id IS NULL), preventing hijacking of linked records.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_engagement_person_id(p_engagement_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

REVOKE EXECUTE ON FUNCTION get_engagement_person_id FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_engagement_person_id TO authenticated;

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
