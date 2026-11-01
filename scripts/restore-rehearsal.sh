#!/usr/bin/env bash
# Restore rehearsal: proves a backup from backup-prod / deploy-prod can be
# decrypted and restored. Restores into a THROWAWAY local Postgres container
# (the Supabase image) — never into a hosted project.
#
#   scripts/restore-rehearsal.sh <backup.tar.gz.gpg>
#
# Needs: docker, gpg with the backup PRIVATE key imported (from the password
# manager: gpg --import backup-private-key.asc), psql.
# Checks: manifest checksums match, schema + data apply with ON_ERROR_STOP,
# migration count equals the manifest, and prints row counts of key tables.
# Everything (decrypted files, container) is deleted on exit — the dump holds
# every tenant's PII.
set -euo pipefail
BACKUP="${1:?usage: restore-rehearsal.sh <backup.tar.gz.gpg>}"
IMAGE="${IMAGE:-supabase/postgres:17.6.1.143}"
PORT="${PORT:-54398}"
NAME="restore-rehearsal-$$"
work="$(mktemp -d)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

echo "== decrypt"
gpg --batch -d "$BACKUP" | tar xz -C "$work"
cd "$work"
for f in schema.sql data.sql manifest.json; do test -s "$f" || { echo "missing $f in backup"; exit 1; }; done

echo "== checksums"
[[ "$(sha256sum schema.sql | cut -d' ' -f1)" == "$(jq -r .schema_sha256 manifest.json)" ]] || { echo "schema.sql checksum mismatch"; exit 1; }
[[ "$(sha256sum data.sql   | cut -d' ' -f1)" == "$(jq -r .data_sha256 manifest.json)"   ]] || { echo "data.sql checksum mismatch"; exit 1; }
echo "ok ($(jq -r '.created_utc + "  sha " + .main_sha[0:7] + "  " + (.migrations|tostring) + " migrations"' manifest.json))"

echo "== scratch database ($IMAGE)"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:$PORT:5432" "$IMAGE" >/dev/null
export PGPASSWORD=postgres
for _ in $(seq 60); do psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break; sleep 2; done
ADMIN=(psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres)
# A bare Postgres container has no Storage service; a hosted project does.
"${ADMIN[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, owner uuid, owner_id text, public boolean DEFAULT false,
  avif_autodetection boolean, file_size_limit bigint, allowed_mime_types text[], type text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid,
  owner_id text, metadata jsonb, user_metadata jsonb, path_tokens text[], version text, level int,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), last_accessed_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
GRANT ALL ON SCHEMA storage TO postgres; GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres;
SQL

echo "== apply schema.sql"
"${ADMIN[@]}" -f schema.sql >/dev/null
echo "== apply data.sql"
"${ADMIN[@]}" -c 'SET session_replication_role = replica' -f data.sql >/dev/null

echo "== migration history"
if [[ -s migrations.csv ]]; then
  "${ADMIN[@]}" -c 'CREATE SCHEMA IF NOT EXISTS supabase_migrations' \
    -c 'CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text)' \
    -c "\\copy supabase_migrations.schema_migrations (version, name) FROM 'migrations.csv' CSV HEADER"
else
  # Backups taken before migrations.csv existed (before 2026-11-01): the
  # history is every migration file at manifest.main_sha, up to the count.
  echo "WARNING: backup has no migrations.csv (older backup) — see BACKUP-RESTORE-RUNBOOK.md §Migration history"
  "${ADMIN[@]}" -c 'CREATE SCHEMA IF NOT EXISTS supabase_migrations' \
    -c 'CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text)'
fi

echo "== verify"
got=$("${ADMIN[@]}" -tAc 'SELECT count(*) FROM supabase_migrations.schema_migrations')
want=$(jq -r .migrations manifest.json)
[[ "$got" == "$want" ]] || { echo "migration count $got != manifest $want"; exit 1; }
echo "migrations: $got (matches manifest)"
for t in tenants user_profiles people engagements payments verticals; do
  printf '  %-15s %s rows\n' "$t" "$("${ADMIN[@]}" -tAc "SELECT count(*) FROM public.$t" 2>/dev/null || echo '-')"
done
echo "RESTORE REHEARSAL PASSED"
