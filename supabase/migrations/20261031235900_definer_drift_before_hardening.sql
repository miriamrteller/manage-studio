-- Runs BEFORE 20261101000100_security_definer_hardening.sql on purpose.
--
-- 000100 aborts on any SECURITY DEFINER function in public/private that is not
-- classified in supabase/security/definer-execute.json. Two exist on hosted
-- projects without being in git (found 2026-11-01):
--
--   rls_auto_enable()     prod; Supabase's "auto-enable RLS on new tables"
--                         event-trigger function (event trigger ensure_rls).
--                         Live and useful: kept. Moved to schema `extensions`:
--                         the event trigger calls it by OID, so it keeps
--                         working, and it leaves the API-exposed schema.
--   handle_new_user_v2()  dev; made in the dashboard. Dropped only if nothing
--                         calls it; if a trigger or event trigger does, stop
--                         and decide by hand (signups would depend on code
--                         that is not in git).
--
-- Version is older than 000100 so it applies first. Neither project had
-- applied 000100 or later when this was written, so `db push` accepts it.
-- Allowed by scripts/ci/migration-order-exceptions.txt.
-- No-op on a fresh database (local stack, CI): neither function exists.

DO $$
DECLARE
  r record;
BEGIN
  -- rls_auto_enable → extensions (only the definer, event-trigger variant)
  FOR r IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'rls_auto_enable' AND n.nspname IN ('public', 'private') AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA extensions', r.oid::regprocedure);
    -- Same OID after the move; regprocedure now renders the new schema.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.oid::regprocedure);
    RAISE NOTICE 'moved rls_auto_enable() to schema extensions (event trigger keeps working)';
  END LOOP;

  -- handle_new_user_v2: drop only when unreferenced
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig,
           (SELECT string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ')
              FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal) AS table_triggers,
           (SELECT string_agg(e.evtname::text, ', ')
              FROM pg_event_trigger e WHERE e.evtfoid = p.oid) AS event_triggers
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'handle_new_user_v2' AND n.nspname IN ('public', 'private')
  LOOP
    IF r.table_triggers IS NOT NULL OR r.event_triggers IS NOT NULL THEN
      RAISE EXCEPTION '% is still used (triggers: %, event triggers: %) — it is not in git; decide by hand before deploying',
        r.sig, coalesce(r.table_triggers, 'none'), coalesce(r.event_triggers, 'none');
    END IF;
    EXECUTE format('DROP FUNCTION %s', r.sig);
    RAISE NOTICE 'dropped unused % (not in git)', r.sig;
  END LOOP;
END;
$$;
