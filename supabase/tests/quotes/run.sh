#!/usr/bin/env bash
# Executes 20261030000300_quotes.sql against a throwaway database on a local
# Postgres 15+ (no Supabase stack needed) and runs the acceptance tests,
# including a real two-session double-click race.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/quotes/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
DB="quotes_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -f "$HERE/00_stub_schema.sql"
# Thread A's migration, unmodified.
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261030000100_job_details.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261030000300_quotes.sql" >/dev/null
"${PSQL[@]}" -f "$HERE/10_quotes_test.sql"

# ── Double-click race: two sessions accept the same quote concurrently ──
"${PSQL[@]}" <<'SQL'
INSERT INTO leads (id, tenant_id, name, email, offering_id) VALUES
  ('00000000-0000-0000-0000-0000000001e9', '00000000-0000-0000-0000-0000000000a1', 'Race', 'race@example.test',
   '00000000-0000-0000-0000-0000000000f1');
INSERT INTO quotes (id, tenant_id, lead_id, status, sent_at, public_token)
VALUES ('00000000-0000-0000-0000-00000000c0c0', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000001e9', 'sent', now(), repeat('ab', 32));
INSERT INTO quote_lines (tenant_id, quote_id, description, unit_price_minor)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c0c0', 'Race shoot', 50000);
SQL

ACCEPT="SELECT accept_quote(repeat('ab', 32), '00000000-0000-0000-0000-0000000000a1', '{}')->>'already_accepted'"
# Session 1 holds the row lock for 2s inside its transaction; session 2 must wait, then replay.
"${PSQL[@]}" -At -c "BEGIN; SET ROLE service_role; $ACCEPT; SELECT pg_sleep(2); COMMIT;" > "$HERE/.race1" &
sleep 0.5
R2="$("${PSQL[@]}" -At -c "SET ROLE service_role; $ACCEPT;")"
wait
R1="$(grep -E '^(true|false)$' "$HERE/.race1" || true)"
rm -f "$HERE/.race1"

CALLS="$("${PSQL[@]}" -At -c "SELECT count(*) FROM job_details WHERE lead_id = '00000000-0000-0000-0000-0000000001e9'")"
REQS="$("${PSQL[@]}" -At -c "SELECT count(*) FROM shoot_payment_requests r JOIN quotes q ON q.engagement_id = r.engagement_id WHERE q.id = '00000000-0000-0000-0000-00000000c0c0'")"

if [[ "$R1" != "false" || "$R2" != "true" || "$CALLS" != "1" || "$REQS" != "2" ]]; then
  echo "race test FAILED: first=$R1 second=$R2 conversions=$CALLS payment_requests=$REQS" >&2
  exit 1
fi
echo "race test: first accepted, second replayed (1 conversion, 2 payment requests)"
