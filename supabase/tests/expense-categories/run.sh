#!/usr/bin/env bash
# Applies the FULL migration chain to a throwaway database on a local Postgres 15+ and
# checks expense categories: a new studio gets exactly its skin's set (the older
# default lists are skipped), a data skin uses the generic set, older names match
# the catalogue, and the catalogue is read-only for studios.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/expense-categories/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="expense_categories_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/20_expense_categories_test.sql"
