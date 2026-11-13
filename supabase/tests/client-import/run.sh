#!/usr/bin/env bash
# Applies the FULL migration chain to a throwaway database on a local Postgres 15+ and
# checks the client import: photographer clients, families with students, adults,
# duplicates by email and phone skipped, matches for the screen, studio privacy.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/client-import/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="client_import_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/10_client_import_test.sql"
