#!/usr/bin/env bash
# Nightly backup of every prod Supabase Storage bucket to R2, encrypted.
#
#   files/current/<bucket>/<path>          mirror of what is in Storage now
#   files/history/<YYYY-MM-DD>/<bucket>/…  files deleted or replaced that night
#                                          (R2 lifecycle: kept 30 days)
#   files/monthly/<YYYY-MM>/<bucket>/…     copy of the mirror on the 1st
#                                          (R2 lifecycle: kept 400 days)
#
# Incremental: rclone compares size and modification time and copies only new or
# changed objects. File names and contents are encrypted with rclone crypt
# (FILES_BACKUP_PASSWORD + FILES_BACKUP_SALT); folder names stay readable
# (bucket / tenant id / document type) so the lifecycle prefixes work.
# Restore: docs/deployment/BACKUP-RESTORE-RUNBOOK.md §Files.
#
# Env: SUPABASE_PROJECT_REF, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID,
#      SUPABASE_S3_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
#      R2_SECRET_ACCESS_KEY, R2_BUCKET, FILES_BACKUP_PASSWORD, FILES_BACKUP_SALT
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?}" "${SUPABASE_S3_ACCESS_KEY_ID:?}" "${SUPABASE_S3_SECRET_ACCESS_KEY:?}"
: "${R2_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_BUCKET:?}"
: "${FILES_BACKUP_PASSWORD:?}" "${FILES_BACKUP_SALT:?}"

# Remotes come from the environment only; nothing is written to disk.
export RCLONE_CONFIG_SUPA_TYPE=s3
export RCLONE_CONFIG_SUPA_PROVIDER=Other
export RCLONE_CONFIG_SUPA_ENDPOINT="https://${SUPABASE_PROJECT_REF}.storage.supabase.co/storage/v1/s3"
export RCLONE_CONFIG_SUPA_REGION="${SUPABASE_S3_REGION:-eu-central-1}"
export RCLONE_CONFIG_SUPA_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_SUPA_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

export RCLONE_CONFIG_VAULT_TYPE=crypt
export RCLONE_CONFIG_VAULT_REMOTE="r2:${R2_BUCKET}/files"
export RCLONE_CONFIG_VAULT_FILENAME_ENCRYPTION=standard
export RCLONE_CONFIG_VAULT_DIRECTORY_NAME_ENCRYPTION=false
RCLONE_CONFIG_VAULT_PASSWORD="$(rclone obscure "$FILES_BACKUP_PASSWORD")"
RCLONE_CONFIG_VAULT_PASSWORD2="$(rclone obscure "$FILES_BACKUP_SALT")"
export RCLONE_CONFIG_VAULT_PASSWORD RCLONE_CONFIG_VAULT_PASSWORD2

today="$(date -u +%F)"
common=(--fast-list --transfers 8 --checkers 16 --stats-one-line --stats 30s --log-level NOTICE)

# Safety: if Storage suddenly lists nothing (wrong key, outage) while the mirror
# has files, stop instead of moving the whole mirror into history.
src_count="$(rclone size supa: --json --fast-list | jq -r '.count')"
dst_count="$(rclone size vault:current --json --fast-list 2>/dev/null | jq -r '.count // 0' || echo 0)"
echo "Storage objects: $src_count · in backup: $dst_count"
if [ "$src_count" -eq 0 ] && [ "$dst_count" -gt 0 ]; then
  echo "::error::Storage listed no objects but the backup has $dst_count. Not syncing."
  exit 1
fi

# Deleted or replaced files move to history/<today> instead of disappearing.
# More than 200 deletions in one night is not normal: stop and look.
rclone sync supa: vault:current --backup-dir "vault:history/${today}" --max-delete 200 "${common[@]}"

if [ "$(date -u +%d)" = "01" ]; then
  month="$(date -u +%Y-%m)"
  echo "Monthly copy → files/monthly/${month}"
  rclone copy vault:current "vault:monthly/${month}" "${common[@]}"
fi

after="$(rclone size vault:current --json --fast-list | jq -r '"\(.count) objects, \(.bytes) bytes"')"
echo "Backup now holds: $after"
echo "### Files backup: $after (Storage: $src_count objects)" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
