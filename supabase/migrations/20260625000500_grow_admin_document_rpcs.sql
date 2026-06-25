-- =============================================================================
-- 000500: Admin document RPCs — retrieve stored document fields + signed URL path
-- GAP 5: Admin-only access to Grow invoice documents with full audit logging.
-- DEPENDENCIES: 000400 (payment_document_access_log, payments.document_*)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RPC: admin_get_payment_document
-- Returns all document fields for a payment. Logs every call to audit table.
-- Caller must be tenant_admin for the tenant that owns the payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_get_payment_document(p_payment_id uuid)
RETURNS TABLE (
  payment_id               uuid,
  external_document_id     text,
  external_document_number text,
  invoice_url              text,
  document_pdf_path        text,
  document_stored_at       timestamptz,
  document_type            text,
  retention_expires_at     timestamptz,
  legal_hold               boolean,
  tenant_id                uuid
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Verify caller is a tenant_admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'admin_get_payment_document: tenant_admin role required';
  END IF;

  -- Verify payment belongs to caller's tenant
  SELECT p.tenant_id INTO v_tenant_id
  FROM payments p
  WHERE p.id = p_payment_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'admin_get_payment_document: payment not found';
  END IF;

  IF v_tenant_id <> get_my_tenant_id() THEN
    RAISE EXCEPTION 'admin_get_payment_document: cross-tenant access denied';
  END IF;

  -- Audit log
  INSERT INTO payment_document_access_log (payment_id, accessed_by, action)
  VALUES (p_payment_id, auth.uid(), 'view');

  RETURN QUERY
  SELECT
    p.id,
    p.external_document_id,
    p.external_document_number,
    p.invoice_url,
    p.document_pdf_path,
    p.document_stored_at,
    p.document_type,
    p.retention_expires_at,
    p.legal_hold,
    p.tenant_id
  FROM payments p
  WHERE p.id = p_payment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin_get_document_signed_url_path
-- Returns the storage path for the stored PDF so the client can generate a
-- short-lived signed URL via supabase.storage.from('legal-documents').createSignedUrl(path, 300).
-- (Supabase does not support Storage signed-URL generation inside PL/pgSQL.)
-- Logs a 'download' event to the audit table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_get_document_signed_url_path(p_payment_id uuid)
RETURNS text
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_pdf_path  text;
  v_tenant_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: tenant_admin role required';
  END IF;

  SELECT p.document_pdf_path, p.tenant_id
    INTO v_pdf_path, v_tenant_id
  FROM payments p
  WHERE p.id = p_payment_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: payment not found';
  END IF;

  IF v_tenant_id <> get_my_tenant_id() THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: cross-tenant access denied';
  END IF;

  IF v_pdf_path IS NULL THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: no stored PDF for payment %', p_payment_id;
  END IF;

  -- Audit log
  INSERT INTO payment_document_access_log (payment_id, accessed_by, action)
  VALUES (p_payment_id, auth.uid(), 'download');

  -- Client calls: supabase.storage.from('legal-documents').createSignedUrl(path, 300)
  RETURN v_pdf_path;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin_get_payment_document(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_document_signed_url_path(uuid)   TO authenticated;
