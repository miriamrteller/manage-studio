#!/usr/bin/env bash
# Encrypted pg_dump of the PROD database to Cloudflare R2.
# Shared by backup-prod.yml (nightly) and deploy-prod.yml (fresh backup right
# before every prod deploy). Restore: docs/deployment/BACKUP-RESTORE-RUNBOOK.md
#
# Env: DB_URL, R2_ACCOUNT_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
#      GPG_RECIPIENT, BUCKET, PREFIX (nightly | predeploy), GITHUB_SHA
# Writes: the object key to $GITHUB_OUTPUT as `key` when that is set.
set -euo pipefail
: "${DB_URL:?}" "${R2_ACCOUNT_ID:?}" "${GPG_RECIPIENT:?}" "${BUCKET:?}"
PREFIX="${PREFIX:-nightly}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
SHA="${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"

supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" --data-only --use-copy -f data.sql
test -s schema.sql && test -s data.sql
# `supabase db dump` leaves out supabase_migrations (CLI-managed). Without the
# history a restored project looks unmigrated and the next `db push` would
# re-run every migration over existing tables. Keep it beside the dump.
psql "$DB_URL" -v ON_ERROR_STOP=1 -c \
  "\\copy (SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version) TO 'migrations.csv' CSV HEADER"
test -s migrations.csv

MIGRATIONS=$(psql "$DB_URL" -tAc "SELECT count(*) FROM supabase_migrations.schema_migrations")
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq -n \
  --arg stamp "$STAMP" --arg sha "$SHA" --arg kind "$PREFIX" \
  --arg migrations "$MIGRATIONS" \
  --arg schema_sha256 "$(sha256sum schema.sql | cut -d' ' -f1)" \
  --arg data_sha256 "$(sha256sum data.sql | cut -d' ' -f1)" \
  '{created_utc:$stamp, main_sha:$sha, kind:$kind, migrations:($migrations|tonumber),
    schema_sha256:$schema_sha256, data_sha256:$data_sha256,
    project_ref:"oogxajjanbyqhljxcmql"}' > manifest.json
cat manifest.json

gpg --batch --import "$root/.github/backup-encryption-public-key.asc"
tar czf backup.tar.gz schema.sql data.sql migrations.csv manifest.json
gpg --batch --yes --trust-model always -r "$GPG_RECIPIENT" -o backup.tar.gz.gpg -e backup.tar.gz
shred -u schema.sql data.sql migrations.csv backup.tar.gz

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
DAY=$(date -u +%F)
case "$PREFIX" in
  predeploy) KEY="predeploy/$(date -u +%Y-%m-%dT%H%MZ)_${SHA::7}" ;;
  *)         KEY="${PREFIX}/${DAY}_${SHA::7}" ;;
esac
aws s3 cp backup.tar.gz.gpg "s3://${BUCKET}/${KEY}.tar.gz.gpg" --endpoint-url "$ENDPOINT"
aws s3 cp manifest.json    "s3://${BUCKET}/${KEY}.manifest.json" --endpoint-url "$ENDPOINT"
if [[ "$PREFIX" == nightly && "$(date -u +%d)" == "01" ]]; then
  aws s3 cp "s3://${BUCKET}/${KEY}.tar.gz.gpg"    "s3://${BUCKET}/monthly/${DAY}_${SHA::7}.tar.gz.gpg"    --endpoint-url "$ENDPOINT"
  aws s3 cp "s3://${BUCKET}/${KEY}.manifest.json" "s3://${BUCKET}/monthly/${DAY}_${SHA::7}.manifest.json" --endpoint-url "$ENDPOINT"
fi
echo "Uploaded ${KEY}.tar.gz.gpg"
[[ -n "${GITHUB_OUTPUT:-}" ]] && echo "key=${KEY}" >> "$GITHUB_OUTPUT"
exit 0
