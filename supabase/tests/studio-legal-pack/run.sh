#!/usr/bin/env bash
# Studio legal pack (20261102123446_studio_legal_pack.sql) and the child/adult
# forms (20261102132031_consent_template_audience.sql) and their languages
# (20261102132821_consent_template_language.sql). Needs Supabase's auth
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
  gen_random_uuid() AS admin, gen_random_uuid() AS parent, gen_random_uuid() AS old_admin,
  gen_random_uuid() AS gen_studio, gen_random_uuid() AS gen_admin,
  gen_random_uuid() AS kid, gen_random_uuid() AS grown, gen_random_uuid() AS no_dob;
GRANT SELECT ON ids TO authenticated, service_role;

INSERT INTO tenants (id, name, subdomain, contact_email, skin)
SELECT studio, 'Pack studio', 'slp-' || substr(md5(random()::text), 1, 8), 'slp@example.test', 'dance-studio' FROM ids;
INSERT INTO tenants (id, name, subdomain, contact_email, skin)
SELECT gen_studio, 'General studio', 'slpgen-' || substr(md5(random()::text), 1, 8), 'gen@example.test', 'generic' FROM ids;
-- A studio from before the legal pack (what the migration backfilled).
INSERT INTO tenants (id, name, subdomain, contact_email, skin, legal_pack_required)
SELECT old_studio, 'Old studio', 'slpold-' || substr(md5(random()::text), 1, 8), 'old@example.test', 'dance-studio', false FROM ids;
INSERT INTO consent_templates (tenant_id, name, content, version, version_hash, status)
SELECT old_studio, 'Their own form', 'Existing wording', 1, encode(sha256('Existing wording'::bytea), 'hex'), 'active' FROM ids;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT u.id, u.email, jsonb_build_object('subdomain', t.subdomain)
FROM ids, LATERAL (VALUES (ids.admin, 'slp-admin@example.test', ids.studio),
                          (ids.parent, 'slp-parent@example.test', ids.studio),
                          (ids.old_admin, 'slp-old@example.test', ids.old_studio),
                          (ids.gen_admin, 'slp-gen@example.test', ids.gen_studio)) AS u(id, email, tenant)
JOIN tenants t ON t.id = u.tenant;
UPDATE user_profiles SET role = ARRAY['tenant_admin']
WHERE id IN (SELECT admin FROM ids UNION SELECT old_admin FROM ids UNION SELECT gen_admin FROM ids);

INSERT INTO people (id, tenant_id, name, date_of_birth)
SELECT kid, studio, 'Kid', (current_date - interval '9 years')::date FROM ids
UNION ALL SELECT grown, studio, 'Grown-up', (current_date - interval '30 years')::date FROM ids
UNION ALL SELECT no_dob, studio, 'No birthday', NULL FROM ids;

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
  PERFORM acknowledge_studio_legal_pack('v1', 'en');
  RAISE EXCEPTION 'FAIL a parent acknowledged the legal pack';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%only a studio admin%' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- 3. A dance studio with no health declaration cannot go live.
SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM acknowledge_studio_legal_pack('pack-v0', 'he');
  RAISE EXCEPTION 'FAIL a dance studio went live without its health declaration';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%signed_template_missing%' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- 3b. A general studio needs its agreement too.
SELECT pg_temp.act_as(gen_admin) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM acknowledge_studio_legal_pack('pack-v0', 'en');
  RAISE EXCEPTION 'FAIL a general studio went live without its agreement';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%signed_template_missing%' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- (provision-studio seeds them at creation; here, the rows it would add.)
INSERT INTO consent_templates (tenant_id, name, content, version, version_hash, status, audience)
SELECT studio, f.name, f.body, 1, encode(sha256(convert_to(f.body, 'UTF8')), 'hex'), 'active', f.audience
FROM ids, (VALUES ('הצהרת בריאות (מתחת לגיל 18)', 'Child health text', 'child'),
                  ('הצהרת בריאות (מבוגרים)', 'Adult health text', 'adult')) AS f(name, body, audience);

-- 3c. The participant's age picks the version; a missing birthday means a child.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_kid TEXT; v_grown TEXT; v_none TEXT;
BEGIN
  SELECT audience INTO v_kid FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT kid FROM pg_temp.ids));
  SELECT audience INTO v_grown FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT grown FROM pg_temp.ids));
  SELECT audience INTO v_none FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT no_dob FROM pg_temp.ids));
  IF v_kid IS DISTINCT FROM 'child' OR v_grown IS DISTINCT FROM 'adult' OR v_none IS DISTINCT FROM 'child' THEN
    RAISE EXCEPTION 'FAIL picked % / % / % for child / adult / no birthday', v_kid, v_grown, v_none;
  END IF;
  -- A studio with one form for everyone gets that form for anyone.
  IF (SELECT content FROM pick_active_consent_template((SELECT old_studio FROM pg_temp.ids), (SELECT grown FROM pg_temp.ids)))
     IS DISTINCT FROM 'Existing wording' THEN
    RAISE EXCEPTION 'FAIL a single form for everyone was not picked';
  END IF;
  RAISE NOTICE 'ok  the child or adult health declaration is picked by age';
END $$;
RESET ROLE;

-- 3d. Signed-in users only see their own studio's forms.
SELECT pg_temp.act_as(parent) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT audience FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT grown FROM pg_temp.ids)))
     IS DISTINCT FROM 'adult' THEN
    RAISE EXCEPTION 'FAIL a member could not get their own studio''s form';
  END IF;
  IF EXISTS (SELECT 1 FROM pick_active_consent_template((SELECT old_studio FROM pg_temp.ids), NULL)) THEN
    RAISE EXCEPTION 'FAIL a member read another studio''s form';
  END IF;
  RAISE NOTICE 'ok  the picker is limited to the caller''s studio';
END $$;
RESET ROLE;

-- 4. The admin acknowledges: evidence and published pages.
SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT acknowledge_studio_legal_pack('pack-v1', 'he');
SELECT acknowledge_studio_legal_pack('pack-v2', 'he');
RESET ROLE;
DO $$
DECLARE
  v_t tenants%ROWTYPE;
  v_n INT;
BEGIN
  SELECT * INTO v_t FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids);
  IF v_t.legal_pack_acknowledged_at IS NULL OR v_t.legal_pages_published IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL acknowledgement did not publish the studio';
  END IF;
  SELECT count(*) INTO v_n FROM legal_acceptances
  WHERE tenant_id = v_t.id AND document = 'studio_legal_pack' AND user_id = (SELECT admin FROM pg_temp.ids)
    AND accepted_by_role = 'tenant_admin' AND language = 'he' AND document_version IN ('pack-v1', 'pack-v2');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL expected 2 acknowledgement records, got %', v_n; END IF;
  IF (SELECT count(*) FROM consent_templates WHERE tenant_id = v_t.id) <> 2 THEN
    RAISE EXCEPTION 'FAIL acknowledging changed the studio''s forms';
  END IF;
  RAISE NOTICE 'ok  every studio needs its forms; the admin''s acknowledgement is recorded and publishes the pages';
END $$;

-- 5. An old studio keeps its own form: acknowledging never replaces it.
SELECT pg_temp.act_as(old_admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT acknowledge_studio_legal_pack('pack-v1', 'en');
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM consent_templates WHERE tenant_id = (SELECT old_studio FROM pg_temp.ids)) <> 1
     OR NOT EXISTS (SELECT 1 FROM consent_templates WHERE tenant_id = (SELECT old_studio FROM pg_temp.ids) AND content = 'Existing wording') THEN
    RAISE EXCEPTION 'FAIL an existing form was replaced or duplicated';
  END IF;
  RAISE NOTICE 'ok  a studio''s existing form is never replaced';
END $$;

-- 5b. The same form in the reader's language when the studio has it.
-- (A Hebrew studio: its older rows, with no language, are in Hebrew.)
UPDATE tenants SET language_default = 'he' WHERE id = (SELECT studio FROM ids);
INSERT INTO consent_templates (tenant_id, name, content, version, version_hash, status, audience, language)
SELECT studio, 'Health declaration (under 18)', 'Child health text EN', 1,
       encode(sha256(convert_to('Child health text EN', 'UTF8')), 'hex'), 'active', 'child', 'en' FROM ids;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_en TEXT; v_he TEXT; v_none TEXT;
BEGIN
  SELECT content INTO v_en FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT kid FROM pg_temp.ids), 'en');
  SELECT content INTO v_he FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT kid FROM pg_temp.ids), 'he');
  SELECT content INTO v_none FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT kid FROM pg_temp.ids));
  IF v_en IS DISTINCT FROM 'Child health text EN' OR v_he IS DISTINCT FROM 'Child health text' THEN
    RAISE EXCEPTION 'FAIL language pick: en=% he=%', v_en, v_he;
  END IF;
  -- The audience still comes first: an adult never gets the child form in their language.
  IF (SELECT audience FROM pick_active_consent_template((SELECT studio FROM pg_temp.ids), (SELECT grown FROM pg_temp.ids), 'en'))
     IS DISTINCT FROM 'adult' THEN
    RAISE EXCEPTION 'FAIL the reader''s language outranked the participant''s age';
  END IF;
  IF v_none IS NULL THEN RAISE EXCEPTION 'FAIL no language given should still pick a form'; END IF;
  RAISE NOTICE 'ok  the form is picked in the reader''s language, after the participant''s age';
END $$;
RESET ROLE;

-- 6. Rows from before 2026-11-02 were backfilled as not required.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE created_at < '2026-11-02' AND legal_pack_required) THEN
    RAISE EXCEPTION 'FAIL an older studio was marked as needing the legal pack';
  END IF;
  RAISE NOTICE 'ok  older studios are not gated';
END $$;

-- 7. Anonymous visitors cannot call it.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM acknowledge_studio_legal_pack('v1', 'en');
  RAISE EXCEPTION 'FAIL anon could acknowledge';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM pick_active_consent_template(gen_random_uuid(), NULL);
  RAISE EXCEPTION 'FAIL anon could pick a form';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

ROLLBACK;
SQL
echo "studio-legal-pack: all checks passed"
