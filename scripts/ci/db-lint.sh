#!/usr/bin/env bash
# `supabase db lint` (plpgsql_check) on the LOCAL stack, error level.
# Errors in functions listed in db-lint-known-errors.txt warn; any other
# function with an error fails. Mirrors scripts/check-edge-functions.sh.
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
known=" $(grep -v '^\s*#' "$root/scripts/ci/db-lint-known-errors.txt" | grep . | tr '\n' ' ') "
out="$(mktemp)"
(cd "$root" && pnpm exec supabase db lint --local --schema public,private --level error) > "$out" || {
  echo "::error::supabase db lint did not run"; cat "$out"; exit 1; }
# The CLI prints one JSON array per schema (or nothing when clean).
if ! fns=$(jq -rs 'add // [] | .[] | select([.issues[]? | select(.level == "error")] | length > 0) | .function' "$out"); then
  echo "::error::could not parse db lint output as JSON:"; head -40 "$out"; exit 1
fi
fns=$(sort -u <<<"$fns")
fail=0; now_passing=()
for fn in $fns; do
  if [[ "$known" == *" $fn "* ]]; then
    echo "::warning::known db lint error in $fn (scripts/ci/db-lint-known-errors.txt)"
  else
    echo "::error::db lint error in $fn"
    jq -rs --arg f "$fn" 'add | .[] | select(.function == $f) | .issues[] | "  - \(.message)"' "$out"
    fail=1
  fi
done
for fn in $known; do
  grep -qx "$fn" <<<"$fns" || now_passing+=("$fn")
done
if ((${#now_passing[@]})); then
  echo "::notice::Now lint-clean, remove from db-lint-known-errors.txt: ${now_passing[*]}"
fi
[[ $fail == 0 ]] && echo "db lint: no new errors."
exit $fail
