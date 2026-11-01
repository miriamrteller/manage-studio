-- =============================================================================
-- Security and data controls (docs/legal/APP-GAPS.md "Related (from the
-- security procedure, doc 11)"; docs/legal/11-security-procedure.en.md §7, §14).
--
-- 1. audit_log integrity + retention: rows are never edited, and are not
--    deleted before they are 24 months old (medium security level, Data
--    Security Regulations reg. 10). A deliberate purge (studio offboarding,
--    DPA §9) must say so: SET LOCAL app.allow_audit_purge = 'on'.
-- 2. Health data: changes to people.medical_notes / allergies are written to
--    audit_log (which fields, by whom — not the values), and admins' views of
--    them are logged through log_sensitive_read().
-- 3. export_tenant_data(): a studio admin downloads all the studio's data as
--    JSON (DPA §9 / Terms §10 data export). Secret columns (*_enc) are never
--    included; the export itself is audited.
--
-- Additive only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. audit_log: no updates; no deletes before 24 months
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_log rows cannot be changed';
  END IF;
  -- DELETE
  IF OLD.created_at > now() - interval '24 months'
     AND coalesce(current_setting('app.allow_audit_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'audit_log rows are kept for 24 months (set app.allow_audit_purge for a deliberate studio purge)';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_protect ON audit_log;
CREATE TRIGGER audit_log_protect
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION protect_audit_log();

-- ---------------------------------------------------------------------------
-- 2a. Health-detail changes → audit_log (field names only, not values)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_people_health_change()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_fields TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NEW.medical_notes IS DISTINCT FROM OLD.medical_notes THEN v_fields := array_append(v_fields, 'medical_notes'); END IF;
  IF NEW.allergies IS DISTINCT FROM OLD.allergies THEN v_fields := array_append(v_fields, 'allergies'); END IF;
  IF cardinality(v_fields) > 0 THEN
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (NEW.tenant_id, auth.uid(), 'health_details_changed', 'person', NEW.id,
            jsonb_build_object('fields', to_jsonb(v_fields)));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_health_audit ON people;
CREATE TRIGGER people_health_audit
  AFTER UPDATE OF medical_notes, allergies ON people
  FOR EACH ROW EXECUTE FUNCTION audit_people_health_change();

-- ---------------------------------------------------------------------------
-- 2b. log_sensitive_read — admins' views of health details (called by the app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_sensitive_read(p_entity_type TEXT, p_entity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_entity_type NOT IN ('person_health', 'waiver_evidence') THEN
    RAISE EXCEPTION 'unknown entity type';
  END IF;
  SELECT up.tenant_id INTO v_tenant FROM user_profiles up WHERE up.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_entity_type = 'person_health'
     AND NOT EXISTS (SELECT 1 FROM people p WHERE p.id = p_entity_id AND p.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_entity_type = 'waiver_evidence'
     AND NOT EXISTS (SELECT 1 FROM waiver_evidence w WHERE w.id = p_entity_id AND w.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  VALUES (v_tenant, v_uid, 'sensitive_read', p_entity_type, p_entity_id);
END;
$$;

-- Tier: authenticated (definer-execute.json). Revoke anon explicitly.
REVOKE ALL ON FUNCTION log_sensitive_read(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION log_sensitive_read(TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. export_tenant_data — everything the studio keeps, as JSON
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION export_tenant_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_tenant  UUID;
  v_result  JSONB := '{}'::jsonb;
  v_rows    JSONB;
  v_table   TEXT;
  v_drop    TEXT[];
  -- Tenant-owned tables with personal or business data. Tables that only
  -- exist on some deployments are skipped.
  v_tables  TEXT[] := ARRAY[
    'people', 'accounts', 'account_members', 'contact_preferences', 'staff',
    'leads', 'offerings', 'offering_sessions', 'seasons', 'categories',
    'engagements', 'attendance', 'waitlist', 'job_details', 'job_payment_requests',
    'quotes', 'quote_lines', 'billing_accounts', 'billing_schedules', 'payments',
    'service_credits', 'expenses', 'expense_categories', 'consent_templates',
    'waiver_evidence', 'waiver_events', 'consent_records', 'legal_acceptances',
    'notification_log', 'scheduling_blocks', 'tenant_scheduling_hours'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT up.tenant_id INTO v_tenant
  FROM user_profiles up
  WHERE up.id = v_uid AND 'tenant_admin' = ANY(up.role);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Forbidden: studio admins only';
  END IF;

  -- The studio's own settings row, without secrets.
  SELECT to_jsonb(t) INTO v_rows FROM tenants t WHERE t.id = v_tenant;
  SELECT array_agg(key) INTO v_drop FROM jsonb_object_keys(v_rows) AS key WHERE key LIKE '%\_enc';
  v_result := v_result || jsonb_build_object('tenant', v_rows - coalesce(v_drop, ARRAY[]::TEXT[]));

  -- Loop over a query result, not the array itself: plpgsql_check would
  -- otherwise trace the array literal into format() as one table name.
  FOR v_table IN SELECT unnest(v_tables) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_table AND c.column_name = 'tenant_id'
    ) THEN
      SELECT array_agg(c.column_name::text) INTO v_drop
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_table
        AND (c.column_name LIKE '%\_enc' OR c.column_name IN ('token', 'secret', 'code'));
      EXECUTE format(
        'SELECT coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) FROM %I x WHERE x.tenant_id = $1',
        v_table
      ) INTO v_rows USING v_tenant, coalesce(v_drop, ARRAY[]::TEXT[]);
      v_result := v_result || jsonb_build_object(v_table, v_rows);
    END IF;
  END LOOP;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  VALUES (v_tenant, v_uid, 'tenant_data_exported', 'tenant', v_tenant);

  RETURN jsonb_build_object(
    'exported_at', now(),
    'format', 'opalswift-studio-export/v1',
    'note', 'Signed waiver and contract PDFs are listed in waiver_evidence.pdf_storage_path; ask OpalSwift for a copy of the files.',
    'data', v_result
  );
END;
$$;

-- Tier: authenticated.
REVOKE ALL ON FUNCTION export_tenant_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION export_tenant_data() TO authenticated;
