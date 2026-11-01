-- Security hardening (2026-11-01), from the Supabase security advisors.
--
-- 1. EXECUTE on SECURITY DEFINER functions. Supabase grants EXECUTE on every new
--    function in `public` to anon and authenticated DIRECTLY, so the
--    `REVOKE ... FROM PUBLIC` in earlier migrations never took it away: 63+
--    definer functions were callable by anyone holding the public API key,
--    including some with no internal check (e.g. resolve_notification_blast_recipients,
--    increment_verification_attempt). Tiers are listed in
--    supabase/security/definer-execute.json and enforced by
--    supabase/tests/security/run.sh in db-ci.
--    Default privileges are deliberately NOT changed: revoking the PUBLIC
--    default can only be done for every schema at once and breaks ordinary
--    invoker functions. Instead the CI test fails on any definer function
--    whose grants do not match its tier, so each new one is decided explicitly.
-- 2. Fixed search_path on two functions (function_search_path_mutable).
-- 3. Two bugs found by `supabase db lint`:
--    get_grow_webhook_secret  — secret_enc is text; pgp_sym_decrypt needs bytea
--    get_admin_dashboard_overview — 'PGRST403' is not a valid SQLSTATE; 42501
--                               (insufficient_privilege) is what PostgREST maps to 403.
-- 4. Indexes for foreign keys without one (unindexed_foreign_keys). Additive.
--
-- Backward-compatible: only removes access no client is meant to have (checked
-- against every supabase.rpc() call in apps/web and supabase/functions) and
-- adds indexes.

-- ── 1. EXECUTE tiers ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_public text[] := ARRAY[
    'create_scheduling_hold',
    'decline_public_quote',
    'get_available_slots',
    'get_bookable_offerings_by_subdomain',
    'get_my_account_ids',
    'get_my_person_id',
    'get_my_tenant_id',
    'get_public_offerings_by_subdomain',
    'get_public_quote',
    'get_public_schedule_events_by_subdomain',
    'get_tenant_config_by_subdomain',
    'guest_enrolment_check_email',
    'guest_enrolment_create_adult',
    'guest_enrolment_create_engagement',
    'guest_enrolment_create_family',
    'guest_enrolment_request_age_review',
    'is_super_admin',
    'release_scheduling_hold'
  ];
  v_authenticated text[] := ARRAY[
    'admin_enrolment_lookup_email',
    'admin_get_document_signed_url_path',
    'admin_get_payment_document',
    'approve_age_review_engagement',
    'assert_age_ineligible_for_offering',
    'assert_can_request_age_review',
    'cancel_engagement',
    'check_subdomain_available',
    'convert_lead_to_job',
    'create_expense',
    'create_job',
    'create_job_payment_requests',
    'decline_age_review_engagement',
    'engagement_age_at_season_start',
    'get_admin_dashboard_overview',
    'get_admin_quote',
    'get_billing_account_payment_method',
    'get_client_job_gallery',
    'get_engagement_person_id',
    'get_finance_summary',
    'get_google_calendar_connection',
    'get_my_profile',
    'get_pending_waiver_engagement',
    'get_schedule_events',
    'get_tenant_features',
    'get_tenant_today',
    'job_payment_requests_all_paid',
    'link_auth_user_to_guardian_for_engagement',
    'link_auth_user_to_person',
    'list_admin_quotes',
    'mark_quote_sent',
    'preview_notification_blast_recipients',
    'release_job_gallery',
    'replace_tenant_scheduling_hours',
    'request_age_review_engagement',
    'resolve_engagement_guardian',
    'save_grow_webhook_secret',
    'save_icount_webhook_secret',
    'save_quote',
    'save_tenant_grow_credentials',
    'save_tenant_icount_credentials',
    'save_tenant_invoice4u_credentials',
    'save_tenant_invoicing_credentials',
    'save_tenant_payment_credentials',
    'save_tenant_tranzila_credentials',
    'save_tenant_yesh_credentials',
    'save_tenant_ypay_credentials',
    'search_enrolment_students',
    'search_notification_blast_accounts'
  ];
  v_service text[] := ARRAY[
    'accept_quote',
    'claim_automatic_email',
    'cleanup_expired_otps',
    'cleanup_old_verification_attempts',
    'complete_automatic_email',
    'disconnect_tenant_google_calendar',
    'enforce_super_admin_reserved',
    'get_grow_webhook_secret',
    'get_tenant_google_credentials',
    'get_tenant_invoicing_credentials',
    'get_tenant_payment_credentials',
    'get_tenant_tranzila_credentials',
    'get_tenant_waiver_link_secret',
    'get_tenant_yesh_credentials',
    'handle_new_user',
    'increment_verification_attempt',
    'is_automatic_email_enabled',
    'job_insert',
    'job_resolve_client',
    'job_store_client_phone',
    'list_due_shoot_emails',
    'provision_tenant',
    'quote_client_contact',
    'resolve_engagement_billing_account',
    'resolve_notification_blast_recipients',
    'save_tenant_google_credentials',
    'sign_waiver',
    'update_tenant_google_access_token'
  ];
  v_internal text[] := ARRAY[
    'get_app_encryption_key',
    'get_cron_secret',
    'get_supabase_functions_url',
    'quote_assert_tenant_admin',
    'quote_job_offering_id',
    'quote_lines_json'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname IN ('public', 'private')
  LOOP
    IF r.proname = ANY (v_public) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
    ELSIF r.proname = ANY (v_authenticated) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    ELSIF r.proname = ANY (v_service) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    ELSIF r.proname = ANY (v_internal) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    ELSE
      -- A definer function this migration does not know (e.g. created on the
      -- project outside git). Stop rather than guess its access.
      RAISE EXCEPTION 'definer function % is not classified in supabase/security/definer-execute.json', r.sig;
    END IF;
  END LOOP;
END;
$$;

-- ── 2. search_path ──────────────────────────────────────────────────────────
ALTER FUNCTION public.payments_set_retention_expires_at() SET search_path = public;
ALTER FUNCTION public.is_reserved_subdomain(text) SET search_path = public;

-- ── 3. db lint fixes (final definitions, one change each) ───────────────────
CREATE OR REPLACE FUNCTION public.get_grow_webhook_secret(p_tenant_id uuid)
 RETURNS TABLE(webhook_secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_grow_webhook_secret: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY
  SELECT pgp_sym_decrypt(s.secret_enc::bytea, enc_key)
  FROM grow_webhook_secrets s
  WHERE s.tenant_id = p_tenant_id
    AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY s.key_version DESC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id         UUID;
    v_season_id         UUID;
    v_season_name       TEXT;
    v_today_dow         INTEGER;
    v_today_date        DATE;
    v_month_start       DATE;
    v_today_classes     JSONB;
    v_term_enrolments   INTEGER;
    v_admin_review      INTEGER;
    v_pending_payment   INTEGER;
    v_finance_summary   JSONB;
BEGIN
    -- Auth validation (same pattern as get_finance_summary)
    v_tenant_id := get_my_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
          AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
    ) THEN
        RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    -- Get active season
    SELECT id, name
    INTO v_season_id, v_season_name
    FROM seasons
    WHERE tenant_id = v_tenant_id
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- [PA Condition 6] No active season → RAISE EXCEPTION P0001 (not silent NULL).
    -- Client must catch SQLSTATE P0001 and render "No active season" UI state.
    -- Navigation hint: go to /admin/setup/terms to create an active season.
    IF v_season_id IS NULL THEN
        RAISE EXCEPTION 'No active season found for this tenant'
            USING ERRCODE = 'P0001',
                  HINT = 'Create an active season under Settings > Seasons before using the admin dashboard overview.';
    END IF;

    -- [PA Condition 4] day_of_week alignment: offerings.day_of_week CHECK 0..6 matches
    -- EXTRACT(DOW) 0=Sun..6=Sat. No translation layer needed. VERIFIED.
    v_today_date  := public.get_tenant_today(v_tenant_id);
    v_today_dow   := EXTRACT(DOW FROM v_today_date)::INTEGER;
    v_month_start := DATE_TRUNC('month', v_today_date)::DATE;

    -- Today's classes with enrolled + waitlist counts
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id',             o.id,
                'name',           o.name,
                'start_time',     o.start_time::TEXT,
                'end_time',       o.end_time::TEXT,
                'location',       o.location,
                'max_capacity',   o.max_capacity,
                'enrolled_count', COALESCE(enrolled.cnt, 0),
                'waitlist_count', COALESCE(waitlisted.cnt, 0),
                'staff_name',     s.name
            )
            ORDER BY o.start_time
        ),
        '[]'::JSONB
    ) INTO v_today_classes
    FROM offerings o
    LEFT JOIN staff s ON o.staff_id = s.id
    LEFT JOIN (
        SELECT offering_id, COUNT(*) AS cnt
        FROM engagements
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer')
        GROUP BY offering_id
    ) enrolled ON o.id = enrolled.offering_id
    LEFT JOIN (
        SELECT offering_id, COUNT(*) AS cnt
        FROM waitlist
        WHERE tenant_id = v_tenant_id
        GROUP BY offering_id
    ) waitlisted ON o.id = waitlisted.offering_id
    WHERE o.tenant_id  = v_tenant_id
      AND o.season_id  = v_season_id
      AND o.day_of_week = v_today_dow
      AND o.status     IN ('active', 'full');

    -- Term enrolments (non-terminal)
    SELECT COUNT(*)::INTEGER
    INTO v_term_enrolments
    FROM engagements
    WHERE tenant_id = v_tenant_id
      AND season_id = v_season_id
      AND status NOT IN ('cancelled', 'withdrawn');

    -- Admin review queue
    SELECT COUNT(*)::INTEGER
    INTO v_admin_review
    FROM engagements
    WHERE tenant_id = v_tenant_id
      AND season_id = v_season_id
      AND status = 'admin_review';

    -- Pending payment (outstanding)
    SELECT COUNT(*)::INTEGER
    INTO v_pending_payment
    FROM engagements
    WHERE tenant_id = v_tenant_id
      AND season_id = v_season_id
      AND status = 'pending_payment';

    -- Finance summary — get_finance_summary returns TABLE; capture first row as JSONB
    SELECT to_jsonb(fs.*)
    INTO v_finance_summary
    FROM public.get_finance_summary(v_month_start, v_today_date) AS fs;

    IF v_finance_summary IS NULL THEN
        v_finance_summary := jsonb_build_object(
            'net_revenue_minor',       0,
            'payment_count',           0,
            'outstanding_engagements', 0,
            'failed_payments_7d',      0,
            'net_expenses_minor',      0
        );
    END IF;

    RETURN jsonb_build_object(
        'season_id',              v_season_id,
        'season_name',            v_season_name,
        'today_classes',          v_today_classes,
        'term_enrolments_count',  v_term_enrolments,
        'admin_review_count',     v_admin_review,
        'pending_payment_count',  v_pending_payment,
        'finance',                v_finance_summary
    );
END;
$function$;

-- CREATE OR REPLACE keeps existing grants; restate the tiers for these two.
REVOKE EXECUTE ON FUNCTION public.get_grow_webhook_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_grow_webhook_secret(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_overview() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard_overview() TO authenticated, service_role;

-- ── 4. Foreign-key indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_skin ON public.tenants (skin);
CREATE INDEX IF NOT EXISTS idx_people_user_profile_id ON public.people (user_profile_id);
CREATE INDEX IF NOT EXISTS idx_accounts_person_id ON public.accounts (person_id);
CREATE INDEX IF NOT EXISTS idx_account_members_person_id ON public.account_members (person_id);
CREATE INDEX IF NOT EXISTS idx_account_members_user_profile_id ON public.account_members (user_profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_profile_id ON public.staff (user_profile_id);
CREATE INDEX IF NOT EXISTS idx_offerings_category_id ON public.offerings (category_id);
CREATE INDEX IF NOT EXISTS idx_requirement_overrides_requirement_template_id ON public.requirement_overrides (requirement_template_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_person_id ON public.billing_accounts (person_id);
CREATE INDEX IF NOT EXISTS idx_waiver_evidence_account_member_id ON public.waiver_evidence (account_member_id);
CREATE INDEX IF NOT EXISTS idx_waiver_events_actor_id ON public.waiver_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_waiver_events_tenant_id ON public.waiver_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_engagements_age_override_by ON public.engagements (age_override_by);
CREATE INDEX IF NOT EXISTS idx_engagements_billing_account_id ON public.engagements (billing_account_id);
CREATE INDEX IF NOT EXISTS idx_engagements_cancelled_by ON public.engagements (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_engagements_scheduling_hold_id ON public.engagements (scheduling_hold_id);
CREATE INDEX IF NOT EXISTS idx_enrolment_resume_drafts_engagement_id ON public.enrolment_resume_drafts (engagement_id);
CREATE INDEX IF NOT EXISTS idx_payments_account_id ON public.payments (account_id);
CREATE INDEX IF NOT EXISTS idx_payments_approved_by ON public.payments (approved_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments (created_by);
CREATE INDEX IF NOT EXISTS idx_payments_person_id ON public.payments (person_id);
CREATE INDEX IF NOT EXISTS idx_payments_refunds_payment_id ON public.payments (refunds_payment_id);
CREATE INDEX IF NOT EXISTS idx_billing_schedules_billing_account_id ON public.billing_schedules (billing_account_id);
CREATE INDEX IF NOT EXISTS idx_billing_schedules_payment_method_token_id ON public.billing_schedules (payment_method_token_id);
CREATE INDEX IF NOT EXISTS idx_document_queue_tenant_id ON public.document_queue (tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_corrects_expense_id ON public.expenses (corrects_expense_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_feature_definitions_skin_restriction ON public.feature_definitions (skin_restriction);
CREATE INDEX IF NOT EXISTS idx_feature_definitions_successor_key ON public.feature_definitions (successor_key);
CREATE INDEX IF NOT EXISTS idx_tenant_feature_overrides_feature_key ON public.tenant_feature_overrides (feature_key);
CREATE INDEX IF NOT EXISTS idx_scheduling_blocks_created_by ON public.scheduling_blocks (created_by);
CREATE INDEX IF NOT EXISTS idx_scheduling_holds_engagement_id ON public.scheduling_holds (engagement_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_holds_offering_id ON public.scheduling_holds (offering_id);
CREATE INDEX IF NOT EXISTS idx_leads_offering_id ON public.leads (offering_id);
CREATE INDEX IF NOT EXISTS idx_job_payment_requests_created_by ON public.job_payment_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_account_id ON public.quotes (account_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON public.quotes (created_by);
CREATE INDEX IF NOT EXISTS idx_quote_lines_offering_id ON public.quote_lines (offering_id);
CREATE INDEX IF NOT EXISTS idx_quote_lines_tenant_id ON public.quote_lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_automatic_emails_updated_by ON public.tenant_automatic_emails (updated_by);
CREATE INDEX IF NOT EXISTS idx_automatic_email_log_engagement_id ON public.automatic_email_log (engagement_id);
CREATE INDEX IF NOT EXISTS idx_automatic_email_log_quote_id ON public.automatic_email_log (quote_id);
CREATE INDEX IF NOT EXISTS idx_waiver_evidence_pdfs_generated_by ON public.waiver_evidence_pdfs (generated_by);

-- Accepted, not changed:
--  * pg_net in schema public (extension_in_public): pg_net cannot be relocated;
--    recreating it would drop queued cron HTTP calls. Its functions live in `net`.
--  * otp_codes, payment_provider_token_cache: RLS on with no policy is intended —
--    service_role only (rls_enabled_no_policy, INFO).
