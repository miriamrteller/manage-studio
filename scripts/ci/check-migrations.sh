#!/usr/bin/env bash
# Migration guard — blocking in CI (ci.yml, checks job).
#
# 1. Append-only: a migration file that already exists on the base branch
#    (main) may not be modified, renamed or deleted. Fix forward with a new file.
# 2. Naming: <14-digit version>_<snake_case_name>.sql, versions unique.
# 3. Ordering: a NEW migration's version must sort after every version already
#    on main. `supabase db push` refuses out-of-order versions on a hosted
#    project (it would need --include-all), so this catches it at PR time.
#
#   scripts/ci/check-migrations.sh [base-ref]     (default: origin/main)
set -euo pipefail

BASE="${1:-origin/main}"
DIR="supabase/migrations"
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
fail=0
err() { echo "::error::$*"; fail=1; }

# --- 2. naming + uniqueness (whole directory) -------------------------------
declare -A seen=()
for f in "$DIR"/*.sql; do
  name="$(basename "$f")"
  if [[ ! "$name" =~ ^([0-9]{14})_[a-z0-9_]+\.sql$ ]]; then
    err "$name: migration filenames must be <14-digit version>_<snake_case>.sql"
    continue
  fi
  v="${BASH_REMATCH[1]}"
  if [[ -n "${seen[$v]:-}" ]]; then
    err "$name: version $v is already used by ${seen[$v]}"
  fi
  seen[$v]="$name"
done

# Nothing else to compare when the base is unavailable (e.g. first push).
if ! git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
  echo "::notice::Base ref $BASE not found — skipped append-only/order checks."
  exit "$fail"
fi

if [[ "$(git rev-parse HEAD)" == "$(git rev-parse "$BASE")" ]]; then
  echo "HEAD is $BASE — nothing to compare."
  exit "$fail"
fi

MB="$(git merge-base HEAD "$BASE")"

# --- 1. append-only ---------------------------------------------------------
# Anything other than a pure Add under supabase/migrations is a violation.
while IFS=$'\t' read -r status path rest; do
  [[ -z "$status" ]] && continue
  case "$status" in
    A) ;;
    *) err "$path: migrations already on main are append-only (status $status). Add a new migration that fixes forward instead — see docs/deployment/DEV-PROD-PIPELINE.md#rules." ;;
  esac
done < <(git diff --name-status --no-renames "$MB" HEAD -- "$DIR")

# --- 3. ordering ------------------------------------------------------------
latest_on_base="$(git ls-tree --name-only "$BASE" -- "$DIR/" | xargs -n1 basename 2>/dev/null \
  | grep -oE '^[0-9]{14}' | sort | tail -1 || true)"
while read -r path; do
  [[ -z "$path" ]] && continue
  v="$(basename "$path" | grep -oE '^[0-9]{14}' || true)"
  [[ -z "$v" ]] && continue
  if grep -qx "$v" <(grep -v '^\s*#' scripts/ci/migration-order-exceptions.txt 2>/dev/null); then
    echo "::notice::$(basename "$path"): older than $latest_on_base, allowed by scripts/ci/migration-order-exceptions.txt"
    continue
  fi
  if [[ -n "$latest_on_base" && "$v" < "$latest_on_base" || "$v" == "$latest_on_base" ]]; then
    err "$(basename "$path"): version $v is not after the newest migration on main ($latest_on_base). Rename it with a newer timestamp."
  fi
done < <(git diff --name-only --diff-filter=A "$MB" HEAD -- "$DIR")

if [[ "$fail" == 0 ]]; then
  echo "Migration guard passed ($(ls "$DIR"/*.sql | wc -l) files; newest on $BASE: ${latest_on_base:-none})."
fi
exit "$fail"
