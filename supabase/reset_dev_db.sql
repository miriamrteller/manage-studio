-- =============================================================================
-- DEV RESET SCRIPT
-- Drops ALL custom objects and clears migration history so migrations can be
-- re-applied from scratch on a fresh DB.
--
-- ⚠️  NEVER run this on production. Dev only.
--
-- Usage:
--   psql "$DATABASE_URL" -f supabase/reset_dev_db.sql
--
-- After running, apply fresh migrations (001–018):
--   supabase db push          (Supabase CLI — set SUPABASE_DB_PASSWORD)
--   -- or --
--   psql "$DATABASE_URL" -f supabase/migrations/20260526000100_tenants.sql
--   ... through 20260526001800_grants.sql
-- =============================================================================

-- Suppress notices for objects that may not exist
SET client_min_messages = WARNING;

-- ---------------------------------------------------------------------------
-- 1. Drop auth trigger first (references auth.users, not a public table)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Drop all application tables (CASCADE handles FK dependencies)
--    Order: most dependent first, foundations last
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.payments                      CASCADE;
DROP TABLE IF EXISTS public.invoice_sequences             CASCADE;
DROP TABLE IF EXISTS public.attendance                    CASCADE;
DROP TABLE IF EXISTS public.makeup_credits                CASCADE;
DROP TABLE IF EXISTS public.waiting_list                  CASCADE;
DROP TABLE IF EXISTS public.enrolments                    CASCADE;
DROP TABLE IF EXISTS public.class_requirements            CASCADE;
DROP TABLE IF EXISTS public.requirement_overrides         CASCADE;
DROP TABLE IF EXISTS public.requirement_templates         CASCADE;
DROP TABLE IF EXISTS public.class_sessions                CASCADE;
DROP TABLE IF EXISTS public.billing_accounts              CASCADE;
DROP TABLE IF EXISTS public.waiver_templates              CASCADE;
DROP TABLE IF EXISTS public.classes                       CASCADE;
DROP TABLE IF EXISTS public.teachers                      CASCADE;
DROP TABLE IF EXISTS public.levels                        CASCADE;
DROP TABLE IF EXISTS public.terms                         CASCADE;
DROP TABLE IF EXISTS public.contact_preferences           CASCADE;
DROP TABLE IF EXISTS public.family_members                CASCADE;
DROP TABLE IF EXISTS public.people                        CASCADE;
DROP TABLE IF EXISTS public.families                      CASCADE;
DROP TABLE IF EXISTS public.notification_log              CASCADE;
DROP TABLE IF EXISTS public.tenant_notification_templates CASCADE;
DROP TABLE IF EXISTS public.tenant_email_customizations   CASCADE;
DROP TABLE IF EXISTS public.expense_categories            CASCADE;
DROP TABLE IF EXISTS public.audit_log                     CASCADE;
DROP TABLE IF EXISTS public.otp_codes                     CASCADE;
DROP TABLE IF EXISTS public.verification_attempts         CASCADE;
DROP TABLE IF EXISTS public.user_profiles                 CASCADE;
DROP TABLE IF EXISTS public.tenants                       CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Drop all custom functions / triggers
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_tenant_id()                                        CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin()                                          CASCADE;
DROP FUNCTION IF EXISTS public.is_service_role()                                         CASCADE;
DROP FUNCTION IF EXISTS public.get_my_family_ids()                                       CASCADE;
DROP FUNCTION IF EXISTS public.get_my_person_id()                                        CASCADE;
DROP FUNCTION IF EXISTS public.is_minor(DATE)                                            CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_otps()                                    CASCADE;
DROP FUNCTION IF EXISTS public.update_tenant_email_customizations_updated_at()           CASCADE;
DROP FUNCTION IF EXISTS public.increment_verification_attempt(UUID, TEXT, TEXT)          CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_verification_attempts()                       CASCADE;
DROP FUNCTION IF EXISTS public.prevent_waiver_update()                                   CASCADE;
DROP FUNCTION IF EXISTS public.get_public_classes_by_subdomain(TEXT)                     CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_config_by_subdomain(TEXT)                      CASCADE;
DROP FUNCTION IF EXISTS public.next_invoice_number(UUID)                                 CASCADE;
DROP FUNCTION IF EXISTS public.get_tenant_stripe_credentials(UUID)                       CASCADE;
DROP FUNCTION IF EXISTS public.save_tenant_stripe_credentials(TEXT, TEXT, TEXT)          CASCADE;
DROP FUNCTION IF EXISTS public.get_my_profile()                                          CASCADE;
DROP FUNCTION IF EXISTS public.link_auth_user_to_person(UUID)                            CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Clear migration history so Supabase CLI re-applies all migrations
-- ---------------------------------------------------------------------------
DELETE FROM supabase_migrations.schema_migrations;

-- ---------------------------------------------------------------------------
-- 5. Confirm
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ Dev DB reset complete. All tables, functions, and migration records dropped.';
  RAISE NOTICE '   Run: supabase db push  (or apply migrations manually in order)';
END;
$$;
