#!/usr/bin/env bash
# Applies the FULL migration chain to a throwaway database on a local Postgres 15+ and
# checks teacher logins: linking by confirmed email, the staff role following the
# staff row, and a teacher seeing only their own classes, sessions and attendance.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/teacher-logins/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="teacher_logins_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$PORTAL/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_teacher_logins_test.sql"
echo "teacher logins: all checks passed"
