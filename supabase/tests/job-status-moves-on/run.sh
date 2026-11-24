#!/usr/bin/env bash
# Project status moves on by itself (…_job_status_moves_on.sql): booked → shot the
# day after the shoot, → delivered once the gallery is visible or photos are sent;
# each move once, never for cancelled projects. Full migration chain on a local
# Postgres 15+ (reusing the client-portal stubs).
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/job-status-moves-on/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="job_status_moves_on_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/10_job_status_moves_on_test.sql"
