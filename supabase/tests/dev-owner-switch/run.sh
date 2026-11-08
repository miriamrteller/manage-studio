#!/usr/bin/env bash
# Proves the dev task supabase/dev-tasks/*_dev_owner_email_switch.sql on a scratch Postgres shaped
# like the dev database when deploy-dev stopped: every migration BEFORE release 2 applied, a test
# owner on an earlier owner address. After the task, release 2 and every later migration must apply.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/dev-owner-switch/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
TASK="$(ls "$ROOT"/supabase/dev-tasks/*_dev_owner_email_switch.sql | head -1)"
RELEASE2="20261104120500_platform_owner_release_2.sql"
BASE="dev_owner_base_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

createdb "$BASE"
trap 'for d in $(psql -X -Atc "select datname from pg_database where datname like '\''dev_owner_%_'"$$"\''"); do dropdb --if-exists "$d" >/dev/null 2>&1 || true; done; dropdb --if-exists "$BASE" >/dev/null 2>&1 || true' EXIT

apply() { sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$2" | "${PSQL[@]}" -d "$1" >/dev/null; }

"${PSQL[@]}" -d "$BASE" -f "$PORTAL/00_stub_schema.sql"
"${PSQL[@]}" -d "$BASE" -c "
CREATE TABLE auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL, provider_id text NOT NULL, identity_data jsonb NOT NULL,
  email text GENERATED ALWAYS AS (lower(identity_data->>'email')) STORED,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());"
BEFORE=(); AFTER=()
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  if [[ "$(basename "$f")" < "$RELEASE2" ]]; then BEFORE+=("$f"); else AFTER+=("$f"); fi
done
for f in "${BEFORE[@]}"; do apply "$BASE" "$f"; done
# A test-only earlier owner address (the real one is not named here).
"${PSQL[@]}" -d "$BASE" -c "INSERT INTO platform_owner_emails (email, note) VALUES ('previous-owner@example.test', 'test only') ON CONFLICT DO NOTHING;"

OWNER=b0000000-0000-4000-8000-0000000000f1
OTHER=b0000000-0000-4000-8000-0000000000f2
fail() { echo "FAIL $*" >&2; exit 1; }
q() { psql -X -Atq -d "$1" -c "$2"; }
run_task() { ( echo "BEGIN;"; cat "$TASK"; echo "$2;" ) | psql -X -q -v ON_ERROR_STOP=1 -d "$1" >/dev/null 2>&1; }
add_user() { # db id email
  "${PSQL[@]}" -d "$1" -c "
    INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES ('$2', '$3', now() - interval '3 days', '{}');
    INSERT INTO auth.identities (user_id, provider, provider_id, identity_data)
      VALUES ('$2', 'email', '$3', jsonb_build_object('sub', '$2', 'email', '$3', 'email_verified', true));" >/dev/null
}
new_db() { local db="dev_owner_${1}_$$"; createdb -T "$BASE" "$db"; echo "$db"; }
release2_applies() { for f in "${AFTER[@]}"; do apply "$1" "$f" || return 1; done; }
roles() { q "$1" "select array_to_string(role,',') from user_profiles where id='$2'"; }

# 1. Only the earlier owner login: it is moved to the new address and release 2 then applies.
db="$(new_db move)"
add_user "$db" "$OWNER" previous-owner@example.test
[ "$(roles "$db" "$OWNER")" = super_admin ] || fail "setup: owner is not super_admin"
probe="dev_owner_probe_$$"; createdb -T "$db" "$probe"
if apply "$probe" "${AFTER[0]}" 2>/dev/null; then fail "setup: release 2 should refuse before the task"; fi
run_task "$db" ROLLBACK || fail "[move] dry run failed"
[ "$(q "$db" "select email from auth.users where id='$OWNER'")" = previous-owner@example.test ] || fail "[move] dry run changed the login"
run_task "$db" COMMIT || fail "[move] task failed"
[ "$(q "$db" "select email from auth.users where id='$OWNER'")" = admin@opalswift.com ] || fail "[move] login not moved"
[ "$(q "$db" "select identity_data->>'email' || '|' || provider_id from auth.identities where user_id='$OWNER'")" = "admin@opalswift.com|admin@opalswift.com" ] || fail "[move] identity not moved"
[ "$(q "$db" "select email from user_profiles where id='$OWNER'")" = admin@opalswift.com ] || fail "[move] profile did not follow"
[ "$(roles "$db" "$OWNER")" = super_admin ] || fail "[move] lost super_admin"
release2_applies "$db" || fail "[move] release 2 and later migrations did not apply"
echo "ok  earlier owner login only: dry run changes nothing; the real run moves it, then release 2 and later migrations apply"

# 2. An earlier owner login (no studio) AND a login on the new address that is already the owner:
#    the earlier owner-only profile is deleted (its login kept), release 2 applies.
db="$(new_db both)"
add_user "$db" "$OWNER" previous-owner@example.test
add_user "$db" "$OTHER" admin@opalswift.com
run_task "$db" COMMIT || fail "[both] task failed"
[ "$(q "$db" "select email from auth.users where id='$OWNER'")" = previous-owner@example.test ] || fail "[both] must not move a login onto a taken address"
[ "$(q "$db" "select count(*) from user_profiles where id='$OWNER'")" = 0 ] || fail "[both] earlier owner-only profile not removed"
[ "$(q "$db" "select count(*) from auth.users where id='$OWNER'")" = 1 ] || fail "[both] the earlier login must be kept"
[ "$(roles "$db" "$OTHER")" = super_admin ] || fail "[both] new-address owner changed"
release2_applies "$db" || fail "[both] release 2 and later migrations did not apply"
echo "ok  earlier owner-only login plus the new owner: the earlier profile goes (login kept), release 2 applies"

# 2b. The earlier owner also belongs to a studio, and the new-address login is not the owner yet:
#     the earlier one keeps its studio role and loses super_admin; the new login becomes the owner.
db="$(new_db studio)"
add_user "$db" "$OWNER" previous-owner@example.test
add_user "$db" "$OTHER" admin@opalswift.com
"${PSQL[@]}" -d "$db" -c "
  INSERT INTO tenants (id, name, subdomain, contact_email) VALUES ('c0000000-0000-4000-8000-0000000000a1', 'Test', 'devownertest', 'studio@example.test');
  UPDATE user_profiles SET tenant_id = 'c0000000-0000-4000-8000-0000000000a1', role = ARRAY['super_admin','admin'] WHERE id = '$OWNER';
  UPDATE user_profiles SET tenant_id = 'c0000000-0000-4000-8000-0000000000a1', role = ARRAY['admin'] WHERE id = '$OTHER';" >/dev/null
run_task "$db" COMMIT || fail "[studio] task failed"
[ "$(roles "$db" "$OWNER")" = admin ] || fail "[studio] earlier login should keep admin and lose super_admin (got $(roles "$db" "$OWNER"))"
[ "$(roles "$db" "$OTHER")" = admin,super_admin ] || fail "[studio] new-address login did not become the owner (got $(roles "$db" "$OTHER"))"
release2_applies "$db" || fail "[studio] release 2 did not apply"
echo "ok  earlier owner with a studio: keeps the studio role, loses super_admin; the new-address login becomes the owner"

# 3. Already fine: nothing changes, release 2 applies.
db="$(new_db fine)"
add_user "$db" "$OWNER" admin@opalswift.com
run_task "$db" COMMIT || fail "[fine] task failed"
[ "$(roles "$db" "$OWNER")" = super_admin ] || fail "[fine] owner changed"
release2_applies "$db" || fail "[fine] release 2 did not apply"
echo "ok  already on the new address: nothing changes, release 2 applies"
