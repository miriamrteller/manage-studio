-- Every auth.uid() / auth.jwt() / auth.role() call in a policy is wrapped in a
-- SELECT, so it runs once per query (Supabase advisor: auth_rls_initplan).
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(format('%s.%s: %s', schemaname, tablename, policyname), E'\n' ORDER BY 1)
    INTO offenders
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage', 'private')
    AND regexp_replace(coalesce(qual, '') || coalesce(with_check, ''),
                       '\( SELECT auth\.(uid|jwt|role)\(\) AS \w+\)', '', 'g')
        ~ 'auth\.(uid|jwt|role)\(\)';
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION E'These policies call auth.*() once per row. Write (select auth.uid()) instead:\n%', offenders;
  END IF;
  RAISE NOTICE 'ok  every policy calls auth.uid()/jwt()/role() once per query';
END $$;
