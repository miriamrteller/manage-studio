#!/usr/bin/env bash
# Automatic class discounts (…_class_discounts.sql): sibling, extra class and
# early bird, added up with a cap or biggest-only, set once at enrolment.
# Applies the FULL migration chain to a throwaway database on a local Postgres
# 15+ (reusing the client-portal stubs).
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/class-discounts/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="class_discounts_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/10_class_discounts_test.sql"
