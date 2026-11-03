#!/usr/bin/env bash
# Definer-function EXECUTE policy test. Needs a database with Supabase's roles
# and default privileges and every migration applied — the local stack
# (`supabase start`, CI local-stack job) or the supabase/postgres image.
# Plain Postgres has no anon/authenticated defaults and would prove nothing.
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/security/run.sh
#
# Fails when: a SECURITY DEFINER function in public/private is not listed in
# exactly one tier of supabase/security/definer-execute.json; a listed name
# does not exist; anon/authenticated can EXECUTE something its tier forbids
# (or cannot EXECUTE something public); or a behaviour check below fails.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
: "${DB_URL:?DB_URL required}"
POLICY="$ROOT/supabase/security/definer-execute.json"
PSQL=(psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB_URL")

tiers=$(jq -r '["public","authenticated","service","internal"][] as $t | .[$t].functions[] | "\($t)\t\(.)"' "$POLICY")
dupes=$(cut -f2 <<<"$tiers" | sort | uniq -d)
fail=0
[[ -n "$dupes" ]] && { echo "FAIL listed in more than one tier: $dupes"; fail=1; }

actual=$("${PSQL[@]}" -F $'\t' -c "
  SELECT p.proname,
         bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')),
         bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef AND n.nspname IN ('public', 'private')
  GROUP BY p.proname ORDER BY 1")

declare -A tier=()
while IFS=$'\t' read -r t f; do tier[$f]=$t; done <<<"$tiers"
declare -A seen=()
while IFS=$'\t' read -r fn anon auth; do
  [[ -z "$fn" ]] && continue
  seen[$fn]=1
  t="${tier[$fn]:-}"
  case "$t" in
    public)        want_anon=t; want_auth=t ;;
    authenticated) want_anon=f; want_auth=t ;;
    service|internal) want_anon=f; want_auth=f ;;
    *) echo "FAIL $fn is SECURITY DEFINER but not in definer-execute.json — add it to a tier and grant/revoke in its migration"; fail=1; continue ;;
  esac
  if [[ "$anon" != "$want_anon" || "$auth" != "$want_auth" ]]; then
    echo "FAIL $fn ($t): anon=$anon authenticated=$auth, expected anon=$want_anon authenticated=$want_auth"; fail=1
  fi
done <<<"$actual"
for f in "${!tier[@]}"; do
  [[ -n "${seen[$f]:-}" ]] || { echo "FAIL $f is listed in definer-execute.json but is not a SECURITY DEFINER function"; fail=1; }
done
echo "definer EXECUTE policy: ${#seen[@]} functions checked"

# ── tenants column grants ─────────────────────────────────────────────────────
# tenants has column-level SELECT grants: every column except the secret
# *_enc ones must be readable by authenticated, or a select naming it fails
# with "permission denied for table tenants". A new column needs
# GRANT SELECT (col) ON TABLE public.tenants TO authenticated in its migration.
missing=$("${PSQL[@]}" -c "
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tenants'
    AND column_name NOT LIKE '%\\_enc'
    AND NOT has_column_privilege('authenticated', 'public.tenants', column_name, 'SELECT')")
if [[ -n "$missing" ]]; then
  echo "FAIL tenants columns not readable by authenticated (grant them in the migration that adds them): $missing"; fail=1
fi
leaked=$("${PSQL[@]}" -c "
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name LIKE '%\\_enc'
    AND (has_column_privilege('authenticated', 'public.tenants', column_name, 'SELECT')
         OR has_column_privilege('anon', 'public.tenants', column_name, 'SELECT'))")
if [[ -n "$leaked" ]]; then
  echo "FAIL secret tenants columns readable by anon/authenticated: $leaked"; fail=1
fi
echo "tenants column grants checked"

# ── waiver_evidence column grants ─────────────────────────────────────────────
# signer_details holds the signer's ID number: no direct SELECT for anon or
# authenticated (get_signed_record_details() is the only reader). Every OTHER
# column must stay readable, or lists that name them fail with "permission denied".
sd_leak=$("${PSQL[@]}" -c "
  SELECT (has_column_privilege('anon', 'public.waiver_evidence', 'signer_details', 'SELECT')
       OR has_column_privilege('authenticated', 'public.waiver_evidence', 'signer_details', 'SELECT'))::text")
if [[ "$sd_leak" != "false" ]]; then
  echo "FAIL waiver_evidence.signer_details is readable by anon/authenticated"; fail=1
fi
we_missing=$("${PSQL[@]}" -c "
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'waiver_evidence'
    AND column_name <> 'signer_details'
    AND NOT has_column_privilege('authenticated', 'public.waiver_evidence', column_name, 'SELECT')")
if [[ -n "$we_missing" ]]; then
  echo "FAIL waiver_evidence columns not readable by authenticated (GRANT SELECT (col) in the migration that adds them): $we_missing"; fail=1
fi
echo "waiver_evidence column grants checked"

# ── behaviour ─────────────────────────────────────────────────────────────────
"${PSQL[@]}" <<'SQL' || fail=1
DO $$
BEGIN
  -- anon is denied a service-only function at the privilege check, before any body runs.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM resolve_notification_blast_recipients(gen_random_uuid(), 'all');
    RAISE EXCEPTION 'FAIL anon could execute resolve_notification_blast_recipients';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  -- RLS policy helpers stay callable by anon and answer NULL.
  SET LOCAL ROLE anon;
  IF get_my_tenant_id() IS NOT NULL THEN RAISE EXCEPTION 'FAIL get_my_tenant_id() not NULL for anon'; END IF;
  RESET ROLE;
  RAISE NOTICE 'ok  anon denied service-only RPC; policy helper callable';
END;
$$;

-- Grow webhook secret: saved the way save_grow_webhook_secret saves it (bytea
-- into a text column), read back through get_grow_webhook_secret.
BEGIN;
INSERT INTO private.platform_config (key, value) VALUES ('encryption_key', 'test-only-key-for-security-run-sh')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
DO $$
DECLARE t uuid; got text;
BEGIN
  -- Throwaway tenant; the whole block is rolled back.
  INSERT INTO tenants (name, subdomain, contact_email)
  VALUES ('Security test', 'sec-run-sh-' || substr(md5(random()::text), 1, 8), 'security-test@example.test')
  RETURNING id INTO t;
  INSERT INTO grow_webhook_secrets (tenant_id, secret_enc, key_version)
  VALUES (t, extensions.pgp_sym_encrypt('whsec-roundtrip', get_app_encryption_key()), 9999);
  -- As PostgREST calls it for the service key: role + JWT claims.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT webhook_secret INTO got FROM get_grow_webhook_secret(t);
  RESET ROLE;
  IF got IS DISTINCT FROM 'whsec-roundtrip' THEN RAISE EXCEPTION 'FAIL grow secret round trip returned %', got; END IF;
  RAISE NOTICE 'ok  grow webhook secret decrypts';
END;
$$;
ROLLBACK;
SQL

[[ $fail == 0 ]] && echo "security: all checks passed"
exit $fail
