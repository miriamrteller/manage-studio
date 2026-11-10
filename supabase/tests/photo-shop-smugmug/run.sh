#!/usr/bin/env bash
# Replays the full migration chain into a scratch DB and checks the photo shop's SmugMug gallery check:
# only the service role saves a check, a passed check keeps the photos it read, a failed
# one keeps none, and the result is tied to the gallery it checked.
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/photo-shop-smugmug/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="photo_shop_smugmug_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$PORTAL/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_photo_shop_smugmug_test.sql"
