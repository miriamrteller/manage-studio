#!/usr/bin/env bash
# Applies the FULL migration chain to a throwaway database on a local
# Postgres 15+ (no Supabase stack needed) and checks what a photographer
# client can read through the client portal's views / RPCs.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/client-portal/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
DB="client_portal_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$HERE/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  # pg_cron / pg_net are stubbed in 00_stub_schema.sql.
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_client_portal_rls_test.sql"
