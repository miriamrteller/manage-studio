#!/usr/bin/env bash
# Legal pack, part 2: lawyer-reviewed versions (20261102135215_tenant_legal_documents.sql).
# Needs Supabase's auth and storage schemas and every migration applied (the
# local stack), so sql-tests skips it (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/lawyer-documents/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS other,
  gen_random_uuid() AS admin, gen_random_uuid() AS parent, gen_random_uuid() AS other_admin,
  gen_random_uuid() AS form;
GRANT SELECT ON ids TO anon, authenticated;

INSERT INTO tenants (id, name, subdomain, contact_email, skin)
SELECT studio, 'Lawyer studio', 'lwd-' || substr(md5(random()::text), 1, 8), 'lwd@example.test', 'dance-studio' FROM ids
UNION ALL
SELECT other, 'Other studio', 'lwdo-' || substr(md5(random()::text), 1, 8), 'lwdo@example.test', 'dance-studio' FROM ids;

INSERT INTO consent_templates (id, tenant_id, name, content, version, version_hash, status, audience)
SELECT form, studio, 'Health declaration (under 18)', 'Child health text', 1,
       encode(sha256(convert_to('Child health text', 'UTF8')), 'hex'), 'active', 'child' FROM ids;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT u.id, u.email, jsonb_build_object('subdomain', t.subdomain)
FROM ids, LATERAL (VALUES (ids.admin, 'lwd-admin@example.test', ids.studio),
                          (ids.parent, 'lwd-parent@example.test', ids.studio),
                          (ids.other_admin, 'lwd-other@example.test', ids.other)) AS u(id, email, tenant)
JOIN tenants t ON t.id = u.tenant;
UPDATE user_profiles SET role = ARRAY['tenant_admin'] WHERE id IN (SELECT admin FROM ids UNION SELECT other_admin FROM ids);

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;

-- 1. A parent cannot upload; the admin can, and a second upload replaces the first.
SELECT pg_temp.act_as(parent) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM save_tenant_legal_document('studio-privacy', 'he', 'text', 'Parent text');
  RAISE EXCEPTION 'FAIL a parent uploaded a legal document';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%only a studio admin%' THEN RAISE; END IF;
END $$;
RESET ROLE;

SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT save_tenant_legal_document('studio-privacy', 'he', 'text', 'First lawyer text');
SELECT save_tenant_legal_document('studio-privacy', 'he', 'text', 'Second lawyer text');
DO $$
BEGIN
  -- A PDF path outside the studio's own folder is refused.
  PERFORM save_tenant_legal_document('cookies', 'he', 'pdf', NULL,
                                     (SELECT other FROM pg_temp.ids)::text || '/cookies/x.pdf', 'x.pdf');
  RAISE EXCEPTION 'FAIL a PDF from another studio''s folder was accepted';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%legal_document_file_missing%' THEN RAISE; END IF;
END $$;
DO $$
BEGIN
  IF (SELECT count(*) FROM tenant_legal_documents WHERE document = 'studio-privacy' AND status = 'active') <> 1
     OR (SELECT content FROM tenant_legal_documents WHERE document = 'studio-privacy' AND status = 'active') <> 'Second lawyer text'
     OR (SELECT count(*) FROM tenant_legal_documents WHERE document = 'studio-privacy' AND status = 'replaced') <> 1 THEN
    RAISE EXCEPTION 'FAIL the second upload should replace the first';
  END IF;
  RAISE NOTICE 'ok  only the admin uploads; a new version replaces the old one; other studios'' files are refused';
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM audit_log WHERE tenant_id = (SELECT studio FROM pg_temp.ids) AND entity_type = 'tenant_legal_documents') <> 2 THEN
    RAISE EXCEPTION 'FAIL each upload should be audited';
  END IF;
  RAISE NOTICE 'ok  uploads are audited';
END $$;

-- 2. Another studio's admin sees none of it.
SELECT pg_temp.act_as(other_admin) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenant_legal_documents) THEN
    RAISE EXCEPTION 'FAIL another studio read the uploads';
  END IF;
  IF EXISTS (SELECT 1 FROM get_tenant_legal_documents((SELECT studio FROM pg_temp.ids))) THEN
    RAISE EXCEPTION 'FAIL an unpublished studio''s uploads were visible to another studio';
  END IF;
  RAISE NOTICE 'ok  uploads stay inside the studio until it publishes';
END $$;
RESET ROLE;

-- 3. Acknowledging: the reviewed privacy policy is not a draft; the unreviewed
--    form and the cookie notice left off the list are drafts anyway (strict gate).
SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT acknowledge_studio_legal_pack('pack-v1', 'he', ARRAY['enrolment-terms', 'accessibility']);
RESET ROLE;
DO $$
DECLARE
  v_drafts TEXT[];
BEGIN
  SELECT legal_pack_ack_drafts INTO v_drafts FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids);
  IF 'studio-privacy' = ANY (v_drafts) OR NOT ('cookies' = ANY (v_drafts)) OR NOT ('signed-forms' = ANY (v_drafts)) THEN
    RAISE EXCEPTION 'FAIL drafts recorded as %', v_drafts;
  END IF;
  RAISE NOTICE 'ok  the acknowledgement records the drafts; nothing unreviewed is left out';
END $$;

-- 4. Published: anyone reads the reviewed version.
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT content FROM get_tenant_legal_documents((SELECT studio FROM pg_temp.ids)) WHERE document = 'studio-privacy')
     IS DISTINCT FROM 'Second lawyer text' THEN
    RAISE EXCEPTION 'FAIL the published reviewed version is not public';
  END IF;
  RAISE NOTICE 'ok  the reviewed version is public once published';
END $$;
DO $$
BEGIN
  PERFORM save_tenant_legal_document('cookies', 'he', 'text', 'x');
  RAISE EXCEPTION 'FAIL anon could upload';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- 5. Back to the template: a draft that was acknowledged needs nothing; one that
--    was lawyer-reviewed when acknowledged needs a new acknowledgement.
SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT save_tenant_legal_document('cookies', 'en', 'text', 'Cookie text');
DO $$
BEGIN
  IF revert_tenant_legal_document('cookies') THEN
    RAISE EXCEPTION 'FAIL reverting an acknowledged draft asked for a new acknowledgement';
  END IF;
  IF NOT revert_tenant_legal_document('studio-privacy') THEN
    RAISE EXCEPTION 'FAIL reverting a reviewed document should ask for a new acknowledgement';
  END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT legal_pack_acknowledged_at FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the acknowledgement was not cleared';
  END IF;
  RAISE NOTICE 'ok  only going back from a reviewed document needs a new acknowledgement';
END $$;

-- 6. Forms: marked lawyer-reviewed, then back to a draft, clears the acknowledgement.
SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT set_consent_template_lawyer_reviewed((SELECT form FROM pg_temp.ids), true);
SELECT acknowledge_studio_legal_pack('pack-v2', 'he', ARRAY['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies']);
RESET ROLE;
DO $$
BEGIN
  IF 'signed-forms' = ANY ((SELECT legal_pack_ack_drafts FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids))) THEN
    RAISE EXCEPTION 'FAIL reviewed forms were recorded as a draft';
  END IF;
END $$;
SELECT pg_temp.act_as(admin) FROM ids;
SET LOCAL ROLE authenticated;
SELECT set_consent_template_lawyer_reviewed((SELECT form FROM pg_temp.ids), false);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT legal_pack_acknowledged_at FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL un-marking a reviewed form did not clear the acknowledgement';
  END IF;
  RAISE NOTICE 'ok  a reviewed form back to a draft needs a new acknowledgement';
END $$;

-- 7. Another studio cannot mark this studio's form.
SELECT pg_temp.act_as(other_admin) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_consent_template_lawyer_reviewed((SELECT form FROM pg_temp.ids), true);
  RAISE EXCEPTION 'FAIL another studio marked the form';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%form not found%' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- 8. Older acknowledgements covered everything as drafts (backfill).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE legal_pack_acknowledged_at IS NOT NULL AND legal_pack_ack_drafts = '{}') THEN
    RAISE EXCEPTION 'FAIL an acknowledged studio has no drafts recorded';
  END IF;
  RAISE NOTICE 'ok  earlier acknowledgements count every document as a draft';
END $$;

ROLLBACK;
SQL
echo "lawyer-documents: all checks passed"
