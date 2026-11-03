#!/usr/bin/env bash
# Replays the full migration chain into a scratch DB and checks the feature admin clean-up: seeded keys and tiers, the
# operator-only feature functions, and that get_tenant_features is unchanged in shape.
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/feature-admin/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
DB="feature_admin_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$PORTAL/00_stub_schema.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" >/dev/null
done
"${PSQL[@]}" -f "$PORTAL/10_seed.sql"
"${PSQL[@]}" -f "$HERE/20_feature_admin_test.sql"

# The edge gate's EXTRAS list (fail-closed keys) must match the database exactly.
gate_keys=$(sed -n '/EXTRAS_FEATURE_KEYS/,/\]);/p' "$ROOT/supabase/functions/_shared/feature-gate.ts" \
  | grep -oE '"[a-z]+:[A-Za-z_.-]+"' | tr -d '"' | sort | paste -sd, -)
db_keys=$("${PSQL[@]}" -tA -c "SELECT string_agg(key, ',' ORDER BY key COLLATE \"C\") FROM feature_definitions
  WHERE deprecated_at IS NULL AND tier_minimum = 'professional' AND profile_gate IS NULL")
gate_sorted=$(tr , '\n' <<<"$gate_keys" | LC_ALL=C sort | paste -sd, -)
if [[ "$gate_sorted" != "$db_keys" ]]; then
  echo "FAIL feature-gate EXTRAS_FEATURE_KEYS differ from the database:"
  echo "  gate: $gate_sorted"; echo "  db:   $db_keys"; exit 1
fi
echo "ok  feature-gate EXTRAS list matches the database"
