-- =============================================================================
-- DEV RESET SCRIPT
-- Drops ALL custom objects and clears migration history so migrations can be
-- re-applied from scratch on a fresh DB.
--
-- ⚠️  NEVER run this on production. Dev only.
--
-- Includes BOTH legacy (pre-Phase-A) and current generic names so reset works
-- whether the DB still has classes/families/enrolments OR offerings/accounts/engagements.
-- Also drops private.platform_config, get_app_encryption_key, save_tenant_grow_credentials.
--
-- Usage (Supabase SQL Editor on linked DEV project — not Supabase local):
--   1. Run this entire script
--   2. pnpm db:sync          (push migrations + types + email-dist copy)
--   3. Run seed.sql in SQL Editor
-- =============================================================================

SET client_min_messages = WARNING;

-- ---------------------------------------------------------------------------
-- 1. Drop auth trigger first (references auth.users, not a public table)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Drop all application tables (CASCADE handles FK dependencies)
--    Order: most dependent first, foundations last
--    Legacy + current names — IF EXISTS makes either safe to skip
-- ---------------------------------------------------------------------------
-- waivers first (waiver_events -> waiver_evidence; engagements FK -> waiver_evidence)
DROP TABLE IF EXISTS public.waiver_events                 CASCADE;
DROP TABLE IF EXISTS public.waiver_evidence               CASCADE;

DROP TABLE IF EXISTS public.payments                      CASCADE;
DROP TABLE IF EXISTS public.payment_document_access_log   CASCADE;
DROP TABLE IF EXISTS public.document_queue                CASCADE;
DROP TABLE IF EXISTS public.invoicing_token_cache           CASCADE;
DROP TABLE IF EXISTS public.billing_schedules               CASCADE;
DROP TABLE IF EXISTS public.payment_method_tokens           CASCADE;
DROP TABLE IF EXISTS public.invoice_sequences             CASCADE;
DROP TABLE IF EXISTS public.attendance                    CASCADE;

-- credits / waitlist (legacy + current)
DROP TABLE IF EXISTS public.makeup_credits                CASCADE;
DROP TABLE IF EXISTS public.service_credits               CASCADE;
DROP TABLE IF EXISTS public.waiting_list                  CASCADE;
DROP TABLE IF EXISTS public.waitlist                      CASCADE;

-- engagements (legacy + current)
DROP INDEX IF EXISTS public.idx_enrolment_resume_drafts_tenant;
DROP INDEX IF EXISTS public.idx_enrolment_resume_drafts_expires;
DROP TABLE IF EXISTS public.enrolment_resume_drafts          CASCADE;
DROP TABLE IF EXISTS public.enrolments                    CASCADE;
DROP TABLE IF EXISTS public.engagements                   CASCADE;

-- requirements (legacy + current)
DROP TABLE IF EXISTS public.class_requirements            CASCADE;
DROP TABLE IF EXISTS public.offering_requirements         CASCADE;
DROP TABLE IF EXISTS public.requirement_overrides         CASCADE;
DROP TABLE IF EXISTS public.requirement_templates         CASCADE;

-- sessions (legacy + current)
DROP TABLE IF EXISTS public.class_sessions                CASCADE;
DROP TABLE IF EXISTS public.offering_sessions             CASCADE;

DROP TABLE IF EXISTS public.billing_accounts              CASCADE;

-- consent / waivers (legacy + current)
DROP TABLE IF EXISTS public.waiver_templates              CASCADE;
DROP TABLE IF EXISTS public.consent_templates             CASCADE;

-- offerings stack (legacy + current)
DROP TABLE IF EXISTS public.classes                       CASCADE;
DROP TABLE IF EXISTS public.offerings                     CASCADE;
DROP TABLE IF EXISTS public.teachers                      CASCADE;
DROP TABLE IF EXISTS public.staff                         CASCADE;
DROP TABLE IF EXISTS public.levels                        CASCADE;
DROP TABLE IF EXISTS public.categories                    CASCADE;
DROP TABLE IF EXISTS public.terms                         CASCADE;
DROP TABLE IF EXISTS public.seasons                       CASCADE;

DROP TABLE IF EXISTS public.contact_preferences           CASCADE;

-- accounts (legacy + current)
DROP TABLE IF EXISTS public.family_members                CASCADE;
DROP TABLE IF EXISTS public.account_members               CASCADE;
DROP TABLE IF EXISTS public.people                        CASCADE;
DROP TABLE IF EXISTS public.families                      CASCADE;
DROP TABLE IF EXISTS public.accounts                      CASCADE;

DROP INDEX IF EXISTS public.idx_notification_log_dunning_key;
DROP INDEX IF EXISTS public.idx_offerings_season_dow_status;
DROP TABLE IF EXISTS public.notification_log              CASCADE;
DROP TABLE IF EXISTS public.tenant_notification_templates CASCADE;
DROP TABLE IF EXISTS public.tenant_email_customizations   CASCADE;
DROP TABLE IF EXISTS public.tenant_feature_overrides      CASCADE;
DROP TABLE IF EXISTS public.feature_definitions           CASCADE;
DROP TABLE IF EXISTS public.verticals                     CASCADE;
DROP TABLE IF EXISTS public.expenses                      CASCADE;
DROP TABLE IF EXISTS public.grow_webhook_secrets          CASCADE;
DROP TABLE IF EXISTS public.expense_categories            CASCADE;
DROP TABLE IF EXISTS public.audit_log                     CASCADE;
DROP TABLE IF EXISTS public.otp_codes                     CASCADE;
DROP TABLE IF EXISTS public.verification_attempts         CASCADE;
DROP TABLE IF EXISTS public.user_profiles                 CASCADE;
DROP TABLE IF EXISTS public.tenants                       CASCADE;

DROP TABLE IF EXISTS private.platform_config              CASCADE;
DROP SCHEMA IF EXISTS private CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Drop all custom functions / triggers (legacy + current)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_tenant_grow_credentials(TEXT, TEXT, TEXT)          CASCADE;
DROP FUNCTION IF EXISTS public.get_app_encryption_key()                                CASCADE;
DROP FUNCTION IF EXISTS public.get_my_tenant_id()                                        CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin()                                          CASCADE;
DROP FUNCTION IF EXISTS public.is_service_role()                                         CASCADE;
DROP FUNCTION IF EXISTS public.get_my_family_ids()                                       CASCADE;
DROP FUNCTION IF EXISTS public.get_my_account_ids()                                      CASCADE;
DROP FUNCTION IF EXISTS public.get_my_person_id()                                        CASCADE;
DROP FUNCTION IF EXISTS public.is_minor(DATE)                                            CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_otps()                                    CASCADE;
DROP FUNCTION IF EXISTS public.update_tenant_email_customizations_updated_at()           CASCADE;
DROP FUNCTION IF EXISTS public.increment_verification_attempt(UUID, TEXT, TEXT)          CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_verification_attempts()                       CASCADE;
DROP FUNCTION IF EXISTS public.prevent_waiver_update()                                   CASCADE;
DROP FUNCTION IF EXISTS public.prevent_waiver_evidence_update()                          CASCADE;
DROP FUNCTION IF EXISTS public.prevent_consent_template_update()                         CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_waiver_engagement(UUID)                       CASCADE;
DROP FUNCTION IF EXISTS public.get_engagement_person_id(UUID)                            CASCADE;
DROP FUNCTION IF EXISTS public.get_public_classes_by_subdomain(TEXT)                     CASCADE;
DROP FUNCTION IF EXISTS public.get_public_offerings_by_subdomain(TEXT)                   CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_config_by_subdomain(TEXT)                      CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_features(UUID)                                 CASCADE;
DROP FUNCTION IF EXISTS public.next_invoice_number(UUID)                                 CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_stripe_credentials(UUID)                       CASCADE;
DROP FUNCTION IF EXISTS public.save_tenant_stripe_credentials(TEXT, TEXT, TEXT)          CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_payment_credentials(UUID)                      CASCADE;
DROP FUNCTION IF EXISTS public.save_tenant_payment_credentials(TEXT, TEXT, TEXT)         CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_invoicing_credentials(UUID)                      CASCADE;
DROP FUNCTION IF EXISTS public.save_tenant_invoicing_credentials(TEXT, TEXT, TEXT)         CASCADE;
DROP FUNCTION IF EXISTS public.get_billing_account_payment_method(UUID)                    CASCADE;
DROP FUNCTION IF EXISTS public.get_my_profile()                                          CASCADE;
DROP FUNCTION IF EXISTS public.link_auth_user_to_person(UUID)                            CASCADE;
DROP FUNCTION IF EXISTS public.resolve_engagement_guardian(UUID)                       CASCADE;
DROP FUNCTION IF EXISTS public.link_auth_user_to_guardian_for_engagement(UUID)         CASCADE;
DROP FUNCTION IF EXISTS public.guest_enrolment_check_email(TEXT, TEXT)                 CASCADE;
DROP FUNCTION IF EXISTS public.guest_enrolment_create_family(TEXT, TEXT, TEXT, TEXT, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.guest_enrolment_create_adult(TEXT, TEXT, TEXT, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.guest_enrolment_create_engagement(TEXT, UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.search_enrolment_students(TEXT, INT)                    CASCADE;
DROP FUNCTION IF EXISTS public.admin_enrolment_lookup_email(TEXT)                      CASCADE;
DROP FUNCTION IF EXISTS public.cancel_engagement(UUID, TEXT)                           CASCADE;
DROP FUNCTION IF EXISTS public.check_subdomain_available(TEXT)                          CASCADE;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_expense',
        'get_finance_summary',
        'reject_expense_mutation',
        'validate_expense_category_tenant',
        'payments_set_retention_expires_at',
        'admin_get_payment_document',
        'admin_get_document_signed_url_path',
        'get_grow_webhook_secret',
        'save_grow_webhook_secret',
        'engagement_age_at_season_start',
        'assert_age_ineligible_for_offering',
        'resolve_engagement_billing_account',
        'assert_can_request_age_review',
        'request_age_review_engagement',
        'guest_enrolment_request_age_review',
        'approve_age_review_engagement',
        'decline_age_review_engagement',
        'save_icount_webhook_secret',
        'save_tenant_icount_credentials',
        'get_tenant_today',
        'get_admin_dashboard_overview'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3c. Drop custom enum/types introduced in newer migrations
-- ---------------------------------------------------------------------------
DROP TYPE IF EXISTS public.subscription_status CASCADE;
DROP TYPE IF EXISTS public.tenant_vertical CASCADE;
DROP TYPE IF EXISTS public.tenant_skin CASCADE;
DROP TYPE IF EXISTS public.tenant_plan CASCADE;



DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('resolve_notification_blast_recipients', 'preview_notification_blast_recipients')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- sign_waiver and provision_tenant have evolved through several parameter-count
-- overloads. Drop EVERY overload by name regardless of signature.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sign_waiver', 'provision_tenant')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3b. Drop app storage policies (buckets/objects persist — Supabase blocks
--     direct DELETE on storage tables; migrations use DROP POLICY IF EXISTS)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "legal_documents_service_role_all" ON storage.objects;
DROP POLICY IF EXISTS "legal_documents_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "Admins insert own tenant expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins read own tenant expense receipts" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 4. Clear migration history so Supabase CLI re-applies all migrations
-- ---------------------------------------------------------------------------
DELETE FROM supabase_migrations.schema_migrations;

-- ---------------------------------------------------------------------------
-- 5. Confirm — list any remaining public app tables (should be empty)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('schema_migrations'); -- supabase internal if present

  IF remaining > 0 THEN
    RAISE WARNING 'Reset done but % public table(s) still exist — check Table Editor', remaining;
  ELSE
    RAISE NOTICE 'Dev DB reset complete. No public app tables remain.';
  END IF;

  RAISE NOTICE 'Next: third squash reset complete. Run pnpm db:push, then seed.sql, then seed-finance.sql.';
END;
$$;
