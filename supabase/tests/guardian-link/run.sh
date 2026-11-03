#!/usr/bin/env bash
# Applies the FULL migration chain to a throwaway database on a local
# Postgres 15+ (reusing the client-portal stubs and seed) and checks
# link_my_guardian_accounts(): a signed-in parent is linked to their family
# rows by VERIFIED email only, in their own tenant, never overwriting a link.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/guardian-link/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="guardian_link_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$PORTAL/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_guardian_link_test.sql"
