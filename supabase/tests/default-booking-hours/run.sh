#!/usr/bin/env bash
# Replays the full migration chain into a scratch DB and checks online booking
# times: open Sunday to Thursday 09:00-18:00 when the studio set no hours,
# blocked times taken off, and the studio's own hours used once saved.
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/default-booking-hours/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="default_booking_hours_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$PORTAL/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_default_booking_hours_test.sql"
