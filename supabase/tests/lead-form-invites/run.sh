#!/usr/bin/env bash
# Admin "Send form" invites (20261103203500_lead_form_invites.sql): a visitor
# gets the name and email only with the right, unexpired token for that
# studio; nobody reads the table directly; the purge removes old invites.
# Needs the local stack (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/lead-form-invites/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT gen_random_uuid() AS b, gen_random_uuid() AS c;
INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT x.id, x.n, 'lfi-' || x.n || '-' || substr(md5(random()::text), 1, 8), 'lfi@example.test'
FROM ids, LATERAL (VALUES (ids.b, 'b'), (ids.c, 'c')) AS x(id, n);

-- Tokens: the link holds the token; the table only its sha256.
INSERT INTO lead_form_invites (tenant_id, token_hash, recipient_email, recipient_name, expires_at)
SELECT b, encode(sha256(convert_to(t, 'UTF8')), 'hex'), 'noa@example.test', 'Noa', e
FROM ids, LATERAL (VALUES
  ('good-token-0123456789abcdef0123456789abcdef', now() + INTERVAL '14 days'),
  ('expired-token-0123456789abcdef0123456789abcd', now() - INTERVAL '1 day'),
  ('ancient-token-0123456789abcdef0123456789abcd', now() - INTERVAL '40 days')
) AS v(t, e);

CREATE FUNCTION pg_temp.act_as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT set_config('request.jwt.claim.sub', '', true);
$$;
GRANT SELECT ON ids TO anon, authenticated;

SELECT pg_temp.act_as_anon();
SET LOCAL ROLE anon;
DO $$
DECLARE r jsonb;
BEGIN
  r := get_lead_form_invite((SELECT b FROM pg_temp.ids), 'good-token-0123456789abcdef0123456789abcdef');
  IF r ->> 'email' IS DISTINCT FROM 'noa@example.test' OR r ->> 'name' IS DISTINCT FROM 'Noa' THEN
    RAISE EXCEPTION 'FAIL the right token did not return the name and email: %', r;
  END IF;
  -- Read-only: asking again still works.
  IF get_lead_form_invite((SELECT b FROM pg_temp.ids), 'good-token-0123456789abcdef0123456789abcdef') IS NULL THEN
    RAISE EXCEPTION 'FAIL a second look-up failed';
  END IF;
  IF get_lead_form_invite((SELECT c FROM pg_temp.ids), 'good-token-0123456789abcdef0123456789abcdef') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL another studio''s host read the invite';
  END IF;
  IF get_lead_form_invite((SELECT b FROM pg_temp.ids), 'expired-token-0123456789abcdef0123456789abcd') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an expired token still prefills';
  END IF;
  IF get_lead_form_invite((SELECT b FROM pg_temp.ids), 'wrong-token-0123456789abcdef0123456789abcdef') IS NOT NULL
     OR get_lead_form_invite((SELECT b FROM pg_temp.ids), 'short') IS NOT NULL
     OR get_lead_form_invite((SELECT b FROM pg_temp.ids), NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a wrong, short or empty token returned something';
  END IF;
  BEGIN
    PERFORM 1 FROM lead_form_invites LIMIT 1;
    RAISE EXCEPTION 'FAIL anon can read lead_form_invites';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM purge_expired_lead_form_invites();
    RAISE EXCEPTION 'FAIL anon can run the purge';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  only the right, unexpired token for this studio prefills; the table is closed';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM lead_form_invites LIMIT 1;
    RAISE EXCEPTION 'FAIL authenticated can read lead_form_invites';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  signed-in users cannot read the table either';
END $$;
RESET ROLE;

DO $$
DECLARE n int;
BEGIN
  n := purge_expired_lead_form_invites();
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL purge removed % invites, expected 1 (40 days old)', n; END IF;
  IF (SELECT count(*) FROM lead_form_invites WHERE tenant_id = (SELECT b FROM pg_temp.ids)) <> 2 THEN
    RAISE EXCEPTION 'FAIL purge removed a recent or recently expired invite';
  END IF;
  RAISE NOTICE 'ok  purge removes invites 30+ days past expiry only';
END $$;

ROLLBACK;
SQL
echo "lead-form-invites: all checks passed"
