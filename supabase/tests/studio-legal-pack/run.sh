#!/usr/bin/env bash
# Studio legal pack (20261102114735_studio_legal_pack.sql). Needs Supabase's auth
# schema and every migration applied (the local stack), so sql-tests skips it
# (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/studio-legal-pack/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS old_studio,
  gen_random_uuid() AS admin, gen_random_uuid() AS parent, gen_random_uuid() AS old_admin;
GRANT SELECT ON ids TO authenticated;

INSERT INTO tenants (id, name, subdomain, contact_email, skin)
SELECT studio, 'Pack studio', 'slp-' || substr(md5(random()::text), 1, 8), 'slp@example.test', 'dance-studio' FROM ids;
-- A studio from before the legal pack (what the migration backfilled).
INSERT INTO tenants (id, name, subdomain, contact_email, skin, legal_pack_required)
SELECT old_studio, 'Old studio', 'slpold-' || substr(md5(random()::text), 1, 8), 'old@example.test', 'dance-studio', false FROM ids;
INSERT INTO consent_templates (tenant_id, name, content, version, version_hash, status)
SELECT old_studio, 'Their own form', 'Existing wording', 1, encode(sha256('Existing wording'::bytea), 'hex'), 'active' FROM ids;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT u.id, u.email, jsonb_build_object('subdomain', t.subdomain)
FROM ids, LATERAL (VALUES (ids.admin, 'slp-admin@example.test', ids.studio),
                          (ids.parent, 'slp-parent@example.test', ids.studio),
                          (ids.old_admin, 'slp-old@example.test', ids.old_studio)) AS u(id, email, tenant)
JOIN tenants t ON t.id = u.tenant;
UPDATE user_profiles SET role = ARRAY['tenant_admin'] WHERE id IN (SELECT admin FROM ids UNION SELECT old_admin FROM ids);

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;

DO $$
DECLARE
  v_t tenants%ROWTYPE;
  v_n INT;
  v_p RECORD;
BEGIN
  -- 1. A new studio waits for the acknowledgement; an old one does not.
  SELECT * INTO v_t FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids);
  IF v_t.legal_pack_required IS NOT TRUE OR v_t.legal_pack_acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a new studio should need the legal pack';
  END IF;
  SELECT * INTO v_p FROM get_tenant_legal_profile((SELECT studio FROM pg_temp.ids));
  IF v_p.legal_pack_required IS NOT TRUE OR v_p.language_default IS NULL THEN
    RAISE EXCEPTION 'FAIL get_tenant_legal_profile lacks the legal pack fields';
  END IF;
  RAISE NOTICE 'ok  new studios need the legal pack; the public profile says so';
END $$;

-- 2. A parent (not an admin) cannot acknowledge.
SELECT pg_temp.act_as(parent) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM acknowledge_studio_legal_pack('v1', 'en', 'Health declaration', 'Text');
  RAISE EXCEPTION 'FAIL a parent acknowledged the legal pack';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%only a studio admin%' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- 3. The admin acknowledges: evidence, published pages, the seeded template.
SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT acknowledge_studio_legal_pack('pack-v1', 'he', 'הצהרת בריאות', 'Health text for Pack studio');
SELECT acknowledge_studio_legal_pack('pack-v2', 'he', 'הצהרת בריאות', 'Different text');
RESET ROLE;
DO $$
DECLARE
  v_t tenants%ROWTYPE;
  v_n INT;
  v_ct consent_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids);
  IF v_t.legal_pack_acknowledged_at IS NULL OR v_t.legal_pages_published IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL acknowledgement did not publish the studio';
  END IF;
  SELECT count(*) INTO v_n FROM legal_acceptances
  WHERE tenant_id = v_t.id AND document = 'studio_legal_pack' AND user_id = (SELECT admin FROM pg_temp.ids)
    AND accepted_by_role = 'tenant_admin' AND language = 'he' AND document_version IN ('pack-v1', 'pack-v2');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL expected 2 acknowledgement records, got %', v_n; END IF;
  SELECT count(*) INTO v_n FROM consent_templates WHERE tenant_id = v_t.id;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL expected exactly one seeded template, got %', v_n; END IF;
  SELECT * INTO v_ct FROM consent_templates WHERE tenant_id = v_t.id;
  IF v_ct.status <> 'active' OR v_ct.content <> 'Health text for Pack studio' OR v_ct.name <> 'הצהרת בריאות'
     OR v_ct.version_hash <> encode(sha256(convert_to(v_ct.content, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'FAIL seeded template is wrong: % % %', v_ct.status, v_ct.name, v_ct.content;
  END IF;
  RAISE NOTICE 'ok  the admin''s acknowledgement is recorded, publishes the pages and seeds one active template';
END $$;

-- 4. An old studio keeps its own form: acknowledging never replaces it.
SELECT pg_temp.act_as(old_admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT acknowledge_studio_legal_pack('pack-v1', 'en', 'Health declaration', 'Seeded text');
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM consent_templates WHERE tenant_id = (SELECT old_studio FROM pg_temp.ids)) <> 1
     OR NOT EXISTS (SELECT 1 FROM consent_templates WHERE tenant_id = (SELECT old_studio FROM pg_temp.ids) AND content = 'Existing wording') THEN
    RAISE EXCEPTION 'FAIL an existing form was replaced or duplicated';
  END IF;
  RAISE NOTICE 'ok  a studio''s existing form is never replaced';
END $$;

-- 5. Anonymous visitors cannot call it.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM acknowledge_studio_legal_pack('v1', 'en');
  RAISE EXCEPTION 'FAIL anon could acknowledge';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

ROLLBACK;
SQL
echo "studio-legal-pack: all checks passed"
