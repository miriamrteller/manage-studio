#!/usr/bin/env bash
# Gallery ready email for clients who paid in full (…_gallery_ready_when_paid.sql):
# a gallery the client can see because everything is paid is marked shared and
# its gallery-ready email is due; a hidden or unpaid gallery is not. Full migration
# chain on a local Postgres 15+ (reusing the client-portal stubs).
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/gallery-ready-when-paid/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="gallery_ready_when_paid_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/10_gallery_ready_when_paid_test.sql"
