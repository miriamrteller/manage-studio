#!/usr/bin/env bash
# Applies the FULL migration chain to a throwaway database on a local
# Postgres 15+ (reusing the client-portal stubs and seed) and checks that the
# admin client search (search_enrolment_students) finds people by name,
# partial name, email, and WhatsApp number.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/client-search/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="client_search_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$PORTAL/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_client_search_test.sql"
