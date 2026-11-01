#!/usr/bin/env bash
# Replays the whole migration chain onto a FRESH supabase/postgres database
# that already has the definer functions hosted projects grew outside git
# (prod: rls_auto_enable + event trigger ensure_rls; dev: handle_new_user_v2),
# i.e. the real order on dev/prod: drift first, then every migration.
#
# Needs the Supabase Postgres image (roles, auth schema, supautils), not plain
# Postgres. db-ci runs it as the `definer-drift` job; locally:
#   docker run -d -p 54399:5432 -e POSTGRES_PASSWORD=postgres supabase/postgres:17.6.1.143
#   PGHOST=127.0.0.1 PGPORT=54399 PGPASSWORD=postgres supabase/tests/definer-drift/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
AS_ADMIN=(psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres)
AS_PG=(psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres)

# Storage's tables come from the storage-api service, absent here.
"${AS_ADMIN[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, owner uuid, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets,
  name text, owner uuid, metadata jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
GRANT ALL ON SCHEMA storage TO postgres; GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres;
SQL

# Drift, as found on the hosted projects (bodies as on prod / a stand-in for dev).
"${AS_PG[@]}" <<'SQL'
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name = 'public' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    END IF;
  END LOOP;
END;
$$;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable();
CREATE FUNCTION public.handle_new_user_v2() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
SQL

for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  "${AS_PG[@]}" -f "$f" >/dev/null 2>"$HERE/.err" || { echo "FAIL applying $(basename "$f")"; cat "$HERE/.err"; rm -f "$HERE/.err"; exit 1; }
done
rm -f "$HERE/.err"
echo "ok  all $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations applied on top of the drift"

"${AS_PG[@]}" <<'SQL'
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN RAISE EXCEPTION 'FAIL rls_auto_enable still in public'; END IF;
  IF to_regprocedure('extensions.rls_auto_enable()') IS NULL THEN RAISE EXCEPTION 'FAIL rls_auto_enable missing from extensions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls' AND evtfoid = 'extensions.rls_auto_enable()'::regprocedure AND evtenabled <> 'D') THEN
    RAISE EXCEPTION 'FAIL event trigger ensure_rls no longer calls rls_auto_enable';
  END IF;
  IF has_function_privilege('anon', 'extensions.rls_auto_enable()', 'EXECUTE') THEN RAISE EXCEPTION 'FAIL anon can execute rls_auto_enable'; END IF;
  IF to_regprocedure('public.handle_new_user_v2()') IS NOT NULL THEN RAISE EXCEPTION 'FAIL unused handle_new_user_v2 not dropped'; END IF;
END $$;
CREATE TABLE public.zz_definer_drift_probe (id int);
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.zz_definer_drift_probe'::regclass) THEN
    RAISE EXCEPTION 'FAIL auto-RLS stopped working after the move';
  END IF;
END $$;
DROP TABLE public.zz_definer_drift_probe;
SQL
echo "ok  rls_auto_enable moved to extensions, still enables RLS on new tables, not executable by anon"
echo "ok  unused handle_new_user_v2 dropped"

# A handle_new_user_v2 that a trigger still uses must stop the deploy, not be dropped.
set +e
out=$("${AS_PG[@]}" 2>&1 <<SQL
BEGIN;
CREATE FUNCTION public.handle_new_user_v2() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS \$\$ BEGIN RETURN NEW; END \$\$;
CREATE TRIGGER zz_uses_v2 AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_v2();
\i $ROOT/supabase/migrations/20261031235900_definer_drift_before_hardening.sql
ROLLBACK;
SQL
)
set -e
if ! grep -q "is still used (triggers: tenants.zz_uses_v2" <<<"$out"; then
  echo "FAIL a used handle_new_user_v2 did not stop the migration:"; echo "$out"; exit 1
fi
echo "ok  a handle_new_user_v2 still used by a trigger stops the migration"
echo "definer drift: all checks passed"
