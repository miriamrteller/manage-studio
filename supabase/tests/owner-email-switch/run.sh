#!/usr/bin/env bash
# Proves the owner-email prod task (supabase/prod-tasks/*_owner_email_switch.sql) on a scratch
# Postgres: the full migration chain, an owner user shaped like a real one (auth.users + an email
# identity), the task run as a dry run (rolled back) and for real, and the refusals.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/owner-email-switch/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORTAL="$ROOT/supabase/tests/client-portal"
TASK="$(ls "$ROOT"/supabase/prod-tasks/*_owner_email_switch.sql | head -1)"
BASE="owner_switch_base_$$"
PSQL_BASE=(psql -X -q -v ON_ERROR_STOP=1)

createdb "$BASE"
trap 'for d in $(psql -X -Atc "select datname from pg_database where datname like '\''owner_switch_%_'"$$"\''"); do dropdb --if-exists "$d" >/dev/null 2>&1 || true; done; dropdb --if-exists "$BASE" >/dev/null 2>&1 || true' EXIT

"${PSQL_BASE[@]}" -d "$BASE" -f "$PORTAL/00_stub_schema.sql"
# The identities table as GoTrue has it (email is generated from identity_data).
"${PSQL_BASE[@]}" -d "$BASE" -c "
CREATE TABLE auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL, provider_id text NOT NULL, identity_data jsonb NOT NULL,
  email text GENERATED ALWAYS AS (lower(identity_data->>'email')) STORED,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  sed -E '/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/d' "$f" | "${PSQL_BASE[@]}" -d "$BASE" >/dev/null
done

run_task() { # $1 db, $2 BEGIN/ROLLBACK mode
  ( echo "BEGIN;"; cat "$TASK"; echo "$2;" ) | psql -X -q -v ON_ERROR_STOP=1 -d "$1" >/dev/null
}

scenario() { # $1 name, $2 provider_id style: email|uid
  local db="owner_switch_${1}_$$"
  createdb -T "$BASE" "$db"
  psql -X -q -v ON_ERROR_STOP=1 -d "$db" -v style="$2" <<'SQL'
\set owner 'b0000000-0000-4000-8000-0000000000f1'
-- After release 2 the table holds only the new address; the task still has to work when the owner is on
-- an earlier owner address, so one is added here the way a migration would.
INSERT INTO platform_owner_emails (email, note) VALUES ('previous-owner@example.test', 'test only');
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  SELECT :'owner', (SELECT email FROM platform_owner_emails WHERE email <> 'admin@opalswift.com' LIMIT 1), now() - interval '3 days', '{}';
INSERT INTO auth.identities (user_id, provider, provider_id, identity_data)
  SELECT :'owner', 'email', CASE WHEN :'style' = 'email' THEN u.email ELSE u.id::text END,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true)
  FROM auth.users u WHERE u.id = :'owner';
SQL
  echo "$db"
}

fail() { echo "FAIL $*" >&2; exit 1; }
q() { psql -X -Atq -d "$1" -c "$2"; }

for style in email uid; do
  db="$(scenario "$style" "$style")"
  before_conf="$(q "$db" "select email_confirmed_at from auth.users where id='b0000000-0000-4000-8000-0000000000f1'")"
  old="$(q "$db" "select email from auth.users where id='b0000000-0000-4000-8000-0000000000f1'")"

  # Dry run: runs, changes nothing once rolled back.
  run_task "$db" ROLLBACK
  [ "$(q "$db" "select email from auth.users where id='b0000000-0000-4000-8000-0000000000f1'")" = "$old" ] || fail "[$style] dry run changed the email"

  # For real.
  run_task "$db" COMMIT
  [ "$(q "$db" "select email from auth.users where id='b0000000-0000-4000-8000-0000000000f1'")" = "admin@opalswift.com" ] || fail "[$style] auth.users email not moved"
  [ "$(q "$db" "select email_confirmed_at from auth.users where id='b0000000-0000-4000-8000-0000000000f1'")" = "$before_conf" ] || fail "[$style] email_confirmed_at changed"
  [ "$(q "$db" "select identity_data->>'email' from auth.identities where user_id='b0000000-0000-4000-8000-0000000000f1'")" = "admin@opalswift.com" ] || fail "[$style] identity email not moved"
  pid="$(q "$db" "select provider_id from auth.identities where user_id='b0000000-0000-4000-8000-0000000000f1'")"
  if [ "$style" = email ]; then [ "$pid" = "admin@opalswift.com" ] || fail "[$style] provider_id not moved"; else [ "$pid" = "b0000000-0000-4000-8000-0000000000f1" ] || fail "[$style] provider_id should stay the user id"; fi
  [ "$(q "$db" "select email||'|'||array_to_string(role,',') from user_profiles where id='b0000000-0000-4000-8000-0000000000f1'")" = "admin@opalswift.com|super_admin" ] || fail "[$style] profile did not follow or lost super_admin"
  [ "$(q "$db" "select count(*) from platform_owner_emails")" = "2" ] || fail "[$style] the task must not change platform_owner_emails"
  echo "ok  [$style identity] dry run changes nothing; the real run moves the login, the identity and the profile, keeps the confirmed date and super_admin, leaves the owner address list alone"
done

# Refusals: each rolls back whole.
db="$(scenario refuse_noidentity email)"
psql -X -q -d "$db" -c "delete from auth.identities" >/dev/null
if run_task "$db" COMMIT 2>/dev/null; then fail "ran without an email identity"; fi
[ "$(q "$db" "select email <> 'admin@opalswift.com' from auth.users where id='b0000000-0000-4000-8000-0000000000f1'")" = "t" ] || fail "a refused run left a change behind"
echo "ok  refuses (and rolls back) when the owner has no email identity"

db="$(scenario refuse_taken email)"
psql -X -q -d "$db" -c "insert into auth.users (id,email,raw_user_meta_data) values ('b0000000-0000-4000-8000-0000000000f2','admin@opalswift.com','{}')" >/dev/null
if run_task "$db" COMMIT 2>/dev/null; then fail "ran although the new address is taken"; fi
echo "ok  refuses when another user already has the new address"

db="$(scenario refuse_none email)"
psql -X -q -d "$db" -c "delete from user_profiles where id='b0000000-0000-4000-8000-0000000000f1'" >/dev/null
if run_task "$db" COMMIT 2>/dev/null; then fail "ran with no super_admin owner to move"; fi
echo "ok  refuses when there is no owner user to move"
