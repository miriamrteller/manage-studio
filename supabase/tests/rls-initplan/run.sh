#!/usr/bin/env bash
# Replays the full migration chain into a scratch DB and checks that no database rule
# (RLS policy) calls auth.uid() / auth.jwt() / auth.role() once per row: each call
# must be wrapped as (select auth.uid()) so Postgres runs it once per query.
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/rls-initplan/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="rls_initplan_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/20_rls_initplan_test.sql"
