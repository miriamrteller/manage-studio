#!/usr/bin/env bash
# Per-student and per-month amounts (…_billing_custom_amounts.sql): a tenant admin
# sets a student's monthly amount and a one-off amount for a coming month, both
# audited; notes are required, past months and other studios are refused.
# Applies the FULL migration chain to a throwaway database on a local Postgres
# 15+ (reusing the client-portal stubs).
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/custom-amounts/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="custom_amounts_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/10_custom_amounts_test.sql"
