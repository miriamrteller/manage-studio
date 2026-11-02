#!/usr/bin/env bash
# Payment provider switching (…_block_payment_provider_switch.sql, loosened by
# …_provider_switch_until_first_payment.sql): before its first real payment a
# studio may change provider freely; after it, only pay at the studio (no
# documents) to Grow, YPay or Invoice4U. Also: a YPay / Invoice4U studio cannot
# make a class monthly. Applies the FULL migration chain to a throwaway database
# on a local Postgres 15+ (reusing the client-portal stubs).
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/provider-switch/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="provider_switch_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$HERE/10_provider_switch_test.sql"
