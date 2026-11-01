#!/usr/bin/env bash
# Is a hosted Supabase project running? Free-plan projects (dev) are paused
# after ~7 days without activity; every DB step then fails with an opaque
# connection error. This turns that into one clear message.
#
#   SUPABASE_ACCESS_TOKEN=… scripts/ci/check-project-active.sh <ref> <label>
#
# Exit 0 = active, 3 = paused/not running (message printed), 2 = unknown
# (no token / API error — callers continue and let the real step report).
# Writes `state=<status>` to $GITHUB_OUTPUT when set.
set -uo pipefail
REF="${1:?ref}"; LABEL="${2:-$REF}"
out() { [[ -n "${GITHUB_OUTPUT:-}" ]] && echo "state=$1" >> "$GITHUB_OUTPUT"; return 0; }
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "::notice::No SUPABASE_ACCESS_TOKEN — cannot check whether $LABEL is paused."
  out unknown; exit 2
fi
status=$(curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$REF" | jq -r '.status // empty') || status=""
if [[ -z "$status" ]]; then
  echo "::warning::Could not read the status of $LABEL from the Supabase API."
  out unknown; exit 2
fi
out "$status"
case "$status" in
  ACTIVE_HEALTHY) echo "$LABEL ($REF) is active."; exit 0 ;;
  INACTIVE|PAUSED|PAUSING)
    echo "::error::$LABEL ($REF) is PAUSED (Free plan pauses after ~7 days idle). Unpause it: supabase.com → project → Restore project, wait until it is green, then re-run this workflow."
    [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && echo "### $LABEL is paused — unpause it in the Supabase dashboard (project → Restore), then re-run." >> "$GITHUB_STEP_SUMMARY"
    exit 3 ;;
  *)
    echo "::error::$LABEL ($REF) is not running (status: $status). Check the Supabase dashboard, then re-run."
    exit 3 ;;
esac
