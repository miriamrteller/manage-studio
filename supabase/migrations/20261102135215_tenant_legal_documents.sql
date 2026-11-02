-- Legal pack, part 2: lawyer-reviewed versions.
--
-- A studio can replace any generated draft with its lawyer's version:
--   * informational documents (privacy policy, enrolment terms, accessibility
--     statement, cookie notice): a PDF or edited text, stored here;
--   * the forms clients sign: edited in the Forms editor and marked
--     lawyer-reviewed (consent_templates.lawyer_reviewed_at).
--
-- Strict gate: going live needs every required document to be either a draft
-- the admin acknowledged, or lawyer-reviewed. The acknowledgement records which
-- documents were still drafts (tenants.legal_pack_ack_drafts). Replacing a draft
-- with a lawyer's version never needs a new acknowledgement; going back to the
-- template for a document that was lawyer-reviewed when the admin acknowledged
-- does, so it clears legal_pack_acknowledged_at (signing stops until the admin
-- confirms again).

-- ---------------------------------------------------------------------------
-- 1. Which documents the acknowledgement covered as drafts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS legal_pack_ack_drafts TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tenants.legal_pack_ack_drafts IS
  'Documents the admin acknowledged as drafts (the rest were lawyer-reviewed then). '
  'Ids: studio-privacy, enrolment-terms, accessibility, cookies, signed-forms.';

-- Studios that acknowledged before this column existed acknowledged everything as a draft.
UPDATE public.tenants
SET legal_pack_ack_drafts = ARRAY['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies', 'signed-forms']
WHERE legal_pack_acknowledged_at IS NOT NULL AND legal_pack_ack_drafts = '{}';

-- ---------------------------------------------------------------------------
-- 2. Lawyer-reviewed informational documents.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_legal_documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document     TEXT        NOT NULL CHECK (document IN ('studio-privacy', 'enrolment-terms', 'accessibility', 'cookies')),
  language     TEXT        NOT NULL CHECK (language IN ('he', 'en')),
  kind         TEXT        NOT NULL CHECK (kind IN ('pdf', 'text')),
  -- pdf: the object in the tenant-legal-documents bucket; text: the edited text (markdown).
  storage_path TEXT,
  content      TEXT,
  file_name    TEXT,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'reverted')),
  uploaded_by  UUID        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'pdf' AND storage_path IS NOT NULL AND content IS NULL)
    OR (kind = 'text' AND content IS NOT NULL AND length(content) BETWEEN 1 AND 200000 AND storage_path IS NULL)
  ),
  CHECK (file_name IS NULL OR length(file_name) <= 200)
);

COMMENT ON TABLE public.tenant_legal_documents IS
  'A studio''s lawyer-reviewed versions of its informational legal documents. One active row per document; older ones are kept (replaced / reverted).';

CREATE UNIQUE INDEX IF NOT EXISTS tenant_legal_documents_one_active
  ON public.tenant_legal_documents (tenant_id, document) WHERE status = 'active';

ALTER TABLE public.tenant_legal_documents ENABLE ROW LEVEL SECURITY;

-- Studio admins read their own rows; every write goes through the functions below (with audit).
DROP POLICY IF EXISTS "Admins read own legal documents" ON public.tenant_legal_documents;
CREATE POLICY "Admins read own legal documents"
  ON public.tenant_legal_documents FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND 'tenant_admin' = ANY (up.role))
  );

REVOKE ALL ON public.tenant_legal_documents FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_legal_documents FROM authenticated;
GRANT SELECT ON public.tenant_legal_documents TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private bucket for the PDFs: <tenant_id>/<document>/<file>.pdf
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tenant-legal-documents', 'tenant-legal-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins upload own legal documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins read own legal documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone reads published legal documents" ON storage.objects;

CREATE POLICY "Admins upload own legal documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-legal-documents'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND (storage.foldername(name))[2] IN ('studio-privacy', 'enrolment-terms', 'accessibility', 'cookies')
    AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND 'tenant_admin' = ANY (up.role))
  );

CREATE POLICY "Admins read own legal documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tenant-legal-documents'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND 'tenant_admin' = ANY (up.role))
  );

-- Parents read a studio's current lawyer-reviewed PDF once the studio's legal pages are published.
CREATE POLICY "Anyone reads published legal documents"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'tenant-legal-documents'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_legal_documents d
      JOIN public.tenants t ON t.id = d.tenant_id
      WHERE d.storage_path = storage.objects.name
        AND d.status = 'active'
        AND t.legal_pages_published
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Signed forms: marked lawyer-reviewed in the Forms editor.
-- ---------------------------------------------------------------------------
ALTER TABLE public.consent_templates
  ADD COLUMN IF NOT EXISTS lawyer_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lawyer_reviewed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.consent_templates.lawyer_reviewed_at IS
  'When a studio admin marked this version as reviewed by their lawyer; NULL for a draft.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The caller's studio, if they are its admin.
CREATE OR REPLACE FUNCTION public.legal_admin_tenant()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.tenant_id FROM user_profiles up
  WHERE up.id = auth.uid() AND up.tenant_id IS NOT NULL AND 'tenant_admin' = ANY (up.role);
$$;
REVOKE ALL ON FUNCTION public.legal_admin_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legal_admin_tenant() TO authenticated;

-- A document that was lawyer-reviewed when the admin acknowledged is back to a
-- draft: the acknowledgement no longer covers it, so the admin must confirm again.
CREATE OR REPLACE FUNCTION public.legal_pack_document_back_to_draft(p_tenant UUID, p_document TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t tenants%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT v_t.legal_pack_required OR v_t.legal_pack_acknowledged_at IS NULL
     OR p_document = ANY (v_t.legal_pack_ack_drafts) THEN
    RETURN false;
  END IF;
  UPDATE tenants SET legal_pack_acknowledged_at = NULL WHERE id = p_tenant;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (p_tenant, auth.uid(), 'UPDATE', 'tenants', p_tenant,
          jsonb_build_object('legal_pack_acknowledged_at', v_t.legal_pack_acknowledged_at),
          jsonb_build_object('legal_pack_acknowledged_at', NULL, 'reason', 'document_back_to_draft', 'document', p_document));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.legal_pack_document_back_to_draft(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Save / revert a lawyer-reviewed informational document.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_tenant_legal_document(
  p_document     TEXT,
  p_language     TEXT,
  p_kind         TEXT,
  p_content      TEXT DEFAULT NULL,
  p_storage_path TEXT DEFAULT NULL,
  p_file_name    TEXT DEFAULT NULL
)
RETURNS public.tenant_legal_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := legal_admin_tenant();
  v_old    tenant_legal_documents%ROWTYPE;
  v_row    tenant_legal_documents%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'only a studio admin can upload legal documents';
  END IF;
  IF p_kind = 'pdf' THEN
    -- The file must be one this studio uploaded for this document.
    IF p_storage_path IS NULL OR split_part(p_storage_path, '/', 1) <> v_tenant::text
       OR split_part(p_storage_path, '/', 2) <> p_document
       OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'tenant-legal-documents' AND o.name = p_storage_path) THEN
      RAISE EXCEPTION 'legal_document_file_missing';
    END IF;
    p_content := NULL;
  ELSIF p_kind = 'text' THEN
    p_content := nullif(trim(p_content), '');
    IF p_content IS NULL THEN
      RAISE EXCEPTION 'legal_document_text_missing';
    END IF;
    p_storage_path := NULL;
  ELSE
    RAISE EXCEPTION 'kind must be pdf or text';
  END IF;

  SELECT * INTO v_old FROM tenant_legal_documents
  WHERE tenant_id = v_tenant AND document = p_document AND status = 'active'
  FOR UPDATE;
  IF FOUND THEN
    UPDATE tenant_legal_documents SET status = 'replaced' WHERE id = v_old.id;
  END IF;

  INSERT INTO tenant_legal_documents (tenant_id, document, language, kind, storage_path, content, file_name, uploaded_by)
  VALUES (v_tenant, p_document, p_language, p_kind, p_storage_path, p_content, left(p_file_name, 200), auth.uid())
  RETURNING * INTO v_row;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (v_tenant, auth.uid(), 'CREATE', 'tenant_legal_documents', v_row.id,
          CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('replaced_id', v_old.id) END,
          jsonb_build_object('document', p_document, 'language', p_language, 'kind', p_kind,
                             'file_name', v_row.file_name, 'storage_path', v_row.storage_path));
  RETURN v_row;
END;
$$;
COMMENT ON FUNCTION public.save_tenant_legal_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'A studio admin stores the lawyer-reviewed version of an informational document (PDF already uploaded, or text). Replaces the previous one; no new acknowledgement is needed.';
REVOKE ALL ON FUNCTION public.save_tenant_legal_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_legal_document(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.revert_tenant_legal_document(p_document TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := legal_admin_tenant();
  v_old    tenant_legal_documents%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'only a studio admin can change legal documents';
  END IF;
  SELECT * INTO v_old FROM tenant_legal_documents
  WHERE tenant_id = v_tenant AND document = p_document AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE tenant_legal_documents SET status = 'reverted' WHERE id = v_old.id;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (v_tenant, auth.uid(), 'UPDATE', 'tenant_legal_documents', v_old.id,
          jsonb_build_object('status', 'active'), jsonb_build_object('status', 'reverted', 'document', p_document));
  -- Returns whether the admin must confirm the legal pack again.
  RETURN legal_pack_document_back_to_draft(v_tenant, p_document);
END;
$$;
COMMENT ON FUNCTION public.revert_tenant_legal_document(TEXT) IS
  'A studio admin goes back to the generated draft. If the document was lawyer-reviewed when they acknowledged, they must acknowledge again (returns true).';
REVOKE ALL ON FUNCTION public.revert_tenant_legal_document(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_tenant_legal_document(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Mark a signed form lawyer-reviewed (or back to a draft).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_consent_template_lawyer_reviewed(p_template_id UUID, p_reviewed BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := legal_admin_tenant();
  v_ct     consent_templates%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'only a studio admin can mark forms';
  END IF;
  SELECT * INTO v_ct FROM consent_templates WHERE id = p_template_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'form not found';
  END IF;
  UPDATE consent_templates
  SET lawyer_reviewed_at = CASE WHEN p_reviewed THEN now() ELSE NULL END,
      lawyer_reviewed_by = CASE WHEN p_reviewed THEN auth.uid() ELSE NULL END
  WHERE id = p_template_id;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (v_tenant, auth.uid(), 'UPDATE', 'consent_templates', p_template_id,
          jsonb_build_object('lawyer_reviewed_at', v_ct.lawyer_reviewed_at),
          jsonb_build_object('lawyer_reviewed', p_reviewed));
  -- Un-marking an active form is going back to a draft (the trigger below handles it).
  RETURN true;
END;
$$;
COMMENT ON FUNCTION public.set_consent_template_lawyer_reviewed(UUID, BOOLEAN) IS
  'A studio admin marks a form version as reviewed by their lawyer, or as a draft again.';
REVOKE ALL ON FUNCTION public.set_consent_template_lawyer_reviewed(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_consent_template_lawyer_reviewed(UUID, BOOLEAN) TO authenticated;

-- An active form that is not lawyer-reviewed is a draft: if the acknowledgement
-- did not cover the forms as drafts, the admin must confirm again. Covers both
-- un-marking a form and activating an unreviewed new version.
CREATE OR REPLACE FUNCTION public.consent_template_draft_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.lawyer_reviewed_at IS NULL
     AND (OLD.status IS DISTINCT FROM 'active' OR OLD.lawyer_reviewed_at IS NOT NULL) THEN
    PERFORM legal_pack_document_back_to_draft(NEW.tenant_id, 'signed-forms');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.consent_template_draft_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consent_template_draft_check ON public.consent_templates;
CREATE TRIGGER consent_template_draft_check
  AFTER UPDATE OF status, lawyer_reviewed_at ON public.consent_templates
  FOR EACH ROW EXECUTE FUNCTION public.consent_template_draft_check();

-- ---------------------------------------------------------------------------
-- 7. The public view of a studio's lawyer-reviewed documents.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_legal_documents(p_tenant_id UUID)
RETURNS TABLE (
  document     TEXT,
  language     TEXT,
  kind         TEXT,
  content      TEXT,
  storage_path TEXT,
  file_name    TEXT,
  uploaded_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.document, d.language, d.kind, d.content, d.storage_path, d.file_name, d.uploaded_at
  FROM tenant_legal_documents d
  JOIN tenants t ON t.id = d.tenant_id
  WHERE d.tenant_id = p_tenant_id
    AND d.status = 'active'
    AND (t.legal_pages_published OR d.tenant_id = legal_admin_tenant());
$$;
COMMENT ON FUNCTION public.get_tenant_legal_documents(UUID) IS
  'A studio''s current lawyer-reviewed documents: public once its legal pages are published, always for its admins.';
REVOKE ALL ON FUNCTION public.get_tenant_legal_documents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_legal_documents(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. The legal profile also says which documents were acknowledged as drafts.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_tenant_legal_profile(UUID);
CREATE FUNCTION public.get_tenant_legal_profile(p_tenant_id UUID)
RETURNS TABLE (
  tenant_id                  UUID,
  name                       TEXT,
  contact_email              TEXT,
  skin                       TEXT,
  legal_profile              JSONB,
  legal_pages_published      BOOLEAN,
  legal_profile_updated_at   TIMESTAMPTZ,
  legal_pack_required        BOOLEAN,
  legal_pack_acknowledged_at TIMESTAMPTZ,
  language_default           TEXT,
  legal_pack_ack_drafts      TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.contact_email, t.skin, t.legal_profile,
         t.legal_pages_published, t.legal_profile_updated_at,
         t.legal_pack_required, t.legal_pack_acknowledged_at, t.language_default,
         t.legal_pack_ack_drafts
  FROM tenants t
  WHERE t.id = p_tenant_id;
$$;
REVOKE ALL ON FUNCTION public.get_tenant_legal_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_legal_profile(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. The acknowledgement records which documents it covers as drafts.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.acknowledge_studio_legal_pack(TEXT, TEXT);
CREATE FUNCTION public.acknowledge_studio_legal_pack(
  p_version  TEXT,
  p_language TEXT,
  p_drafts   TEXT[] DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_tenant  UUID;
  v_headers JSONB;
  v_ip      INET;
  v_ua      TEXT;
  v_now     TIMESTAMPTZ := now();
  v_drafts  TEXT[];
  v_doc     TEXT;
BEGIN
  SELECT up.tenant_id INTO v_tenant
  FROM user_profiles up
  WHERE up.id = v_uid AND up.tenant_id IS NOT NULL AND 'tenant_admin' = ANY (up.role);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'only a studio admin can acknowledge the legal pack';
  END IF;
  IF p_version IS NULL OR length(trim(p_version)) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'version is required';
  END IF;
  IF p_language NOT IN ('he', 'en') THEN
    RAISE EXCEPTION 'language must be he or en';
  END IF;

  -- No list: everything is acknowledged as a draft (as before).
  v_drafts := coalesce(p_drafts, ARRAY['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies', 'signed-forms']);
  FOREACH v_doc IN ARRAY v_drafts LOOP
    IF v_doc NOT IN ('studio-privacy', 'enrolment-terms', 'accessibility', 'cookies', 'signed-forms') THEN
      RAISE EXCEPTION 'unknown document %', v_doc;
    END IF;
  END LOOP;
  -- Strict gate: a document left out of the drafts must be lawyer-reviewed now.
  FOREACH v_doc IN ARRAY ARRAY['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies'] LOOP
    IF NOT (v_doc = ANY (v_drafts))
       AND NOT EXISTS (SELECT 1 FROM tenant_legal_documents d
                       WHERE d.tenant_id = v_tenant AND d.document = v_doc AND d.status = 'active') THEN
      v_drafts := array_append(v_drafts, v_doc);
    END IF;
  END LOOP;
  IF NOT ('signed-forms' = ANY (v_drafts))
     AND EXISTS (SELECT 1 FROM consent_templates ct
                 WHERE ct.tenant_id = v_tenant AND ct.status = 'active' AND ct.lawyer_reviewed_at IS NULL) THEN
    v_drafts := array_append(v_drafts, 'signed-forms');
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NOT NULL THEN
    BEGIN
      v_ip := split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)::inet;
    EXCEPTION WHEN others THEN
      v_ip := NULL;
    END;
    v_ua := left(v_headers->>'user-agent', 512);
  END IF;

  INSERT INTO legal_acceptances (tenant_id, user_id, document, document_version, language, accepted_by_role, ip_address, user_agent)
  VALUES (v_tenant, v_uid, 'studio_legal_pack', trim(p_version), p_language, 'tenant_admin', v_ip, v_ua);

  -- Every studio type has forms (health declarations or a service agreement):
  -- none can go live without an active one.
  IF NOT EXISTS (SELECT 1 FROM consent_templates ct WHERE ct.tenant_id = v_tenant AND ct.status = 'active') THEN
    RAISE EXCEPTION 'signed_template_missing';
  END IF;

  UPDATE tenants
  SET legal_pack_acknowledged_at = v_now, legal_pages_published = true, legal_pack_ack_drafts = v_drafts
  WHERE id = v_tenant;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant, v_uid, 'UPDATE', 'tenants', v_tenant,
          jsonb_build_object('legal_pack_acknowledged_at', v_now, 'version', trim(p_version), 'drafts', to_jsonb(v_drafts)));

  RETURN v_now;
END;
$$;

COMMENT ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT, TEXT[]) IS
  'A studio admin acknowledges the legal pack: the listed documents as drafts, the rest as lawyer-reviewed. Records it and publishes the legal pages. Refuses while the studio has no active signed form.';

REVOKE ALL ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT, TEXT[]) TO authenticated;
