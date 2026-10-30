#!/usr/bin/env bash
# Type-check every Supabase Edge Function against its own deno.json.
# Run in CI (needs Deno + network); no local Deno install required.
set -uo pipefail
cd "$(dirname "$0")/../supabase/functions"

failed=()
for dir in */; do
  name="${dir%/}"
  [[ "$name" == _* || "$name" == tests ]] && continue
  [[ -f "$name/index.ts" ]] || continue
  echo "::group::deno check $name"
  if ! (cd "$name" && deno check index.ts); then
    failed+=("$name")
  fi
  echo "::endgroup::"
done

if ((${#failed[@]})); then
  echo "::error::Type errors in ${#failed[@]} function(s): ${failed[*]}"
  exit 1
fi
echo "All edge functions type-check."
