#!/usr/bin/env bash
# Applies the FULL migration chain to a throwaway database on a local Postgres 15+ and
# checks who can read, edit and delete user_profiles rows: a parent or client can never
# touch the studio admin's row; an admin manages only their own studio's rows.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/user-profiles-rls/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="user_profiles_rls_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$PORTAL/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_user_profiles_rls_test.sql"
echo "user_profiles RLS: all checks passed"
