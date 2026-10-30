#!/usr/bin/env bash
# Type-check every Supabase Edge Function against its own deno.json.
# Run in CI (needs Deno + network); no local Deno install required.
#
# Functions in scripts/edge-functions-known-type-errors.txt have type errors
# that predate this check and don't affect runtime. They warn instead of fail;
# any other failing function fails the job. Remove a name once it passes.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
known_file="$root/scripts/edge-functions-known-type-errors.txt"
cd "$root/supabase/functions"

known=" $(grep -v '^\s*#' "$known_file" 2>/dev/null | tr '\n' ' ') "

failed=()
known_failed=()
now_passing=()
for dir in */; do
  name="${dir%/}"
  [[ "$name" == _* || "$name" == tests ]] && continue
  [[ -f "$name/index.ts" ]] || continue
  echo "::group::deno check $name"
  if (cd "$name" && deno check index.ts); then
    [[ "$known" == *" $name "* ]] && now_passing+=("$name")
  elif [[ "$known" == *" $name "* ]]; then
    known_failed+=("$name")
  else
    failed+=("$name")
  fi
  echo "::endgroup::"
done

if ((${#known_failed[@]})); then
  echo "::warning::Known type errors (not blocking) in ${#known_failed[@]} function(s): ${known_failed[*]}"
fi
if ((${#now_passing[@]})); then
  echo "::notice::Now type-check clean; remove from the known list: ${now_passing[*]}"
fi
if ((${#failed[@]})); then
  echo "::error::Type errors in ${#failed[@]} function(s): ${failed[*]}"
  exit 1
fi
echo "No new edge function type errors."
