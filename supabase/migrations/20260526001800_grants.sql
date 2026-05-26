-- =============================================================================
-- 018: All Table + Schema Grants
-- Must run LAST — all tables must exist before grants can reference them.
-- DEPENDENCIES: all previous migrations
--
-- GRANT vs RLS (SPEC §4.3.1):
--   GRANT  = can this role attempt the operation? (HTTP 403 if missing)
--   RLS    = which rows can this user actually touch?
--
-- Compliance rules (SPEC §1.7, §4.5, §D):
--   audit_log, payments     — immutable; no UPDATE/DELETE grants
--   people, families        — anonymise via RPC; no DELETE grants
--   notification_log        — append-only
--   enrolments              — status-change only; no hard DELETE
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- ---------------------------------------------------------------------------
-- SELECT: every tenant-scoped table the app reads
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE
  public.tenants,
  public.user_profiles,
  public.families,
  public.family_members,
  public.people,
  public.contact_preferences,
  public.terms,
  public.levels,
  public.teachers,
  public.classes,
  public.class_sessions,
  public.class_requirements,
  public.requirement_templates,
  public.requirement_overrides,
  public.waiver_templates,
  public.enrolments,
  public.billing_accounts,
  public.waiting_list,
  public.attendance,
  public.makeup_credits,
  public.payments,
  public.invoice_sequences,
  public.tenant_notification_templates,
  public.tenant_email_customizations,
  public.expense_categories,
  public.notification_log,
  public.audit_log,
  public.verification_attempts
TO authenticated;

-- ---------------------------------------------------------------------------
-- Immutable / append-only tables
-- ---------------------------------------------------------------------------
GRANT INSERT ON TABLE public.audit_log        TO authenticated;
GRANT INSERT ON TABLE public.notification_log TO authenticated;
-- payments: SELECT only above; writes via service_role (Stripe webhooks)

-- ---------------------------------------------------------------------------
-- PII — anonymise, never hard-delete
-- ---------------------------------------------------------------------------
GRANT INSERT, UPDATE ON TABLE
  public.people,
  public.families,
  public.family_members
TO authenticated;

-- ---------------------------------------------------------------------------
-- Enrolments — mutate status; do not hard-delete
-- ---------------------------------------------------------------------------
GRANT INSERT, UPDATE ON TABLE public.enrolments TO authenticated;

-- ---------------------------------------------------------------------------
-- Operational / admin setup — full CRUD (config entities, not financial records)
-- ---------------------------------------------------------------------------
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.user_profiles,
  public.contact_preferences,
  public.terms,
  public.levels,
  public.teachers,
  public.classes,
  public.class_sessions,
  public.class_requirements,
  public.requirement_templates,
  public.requirement_overrides,
  public.waiver_templates,
  public.billing_accounts,
  public.waiting_list,
  public.attendance,
  public.makeup_credits,
  public.tenant_notification_templates,
  public.tenant_email_customizations,
  public.expense_categories,
  public.verification_attempts
TO authenticated;

-- tenants: admins update own tenant branding/settings (UPDATE, not DELETE)
GRANT UPDATE ON TABLE public.tenants TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- service_role retains full access for webhooks, OTP, invoicing
GRANT ALL ON TABLE public.tenants       TO service_role;
GRANT ALL ON TABLE public.user_profiles TO service_role;

-- Not granted to authenticated:
--   otp_codes (service_role only)
--   payments INSERT/UPDATE/DELETE (immutable financial records)
--   audit_log UPDATE/DELETE
--   people/families/family_members DELETE
--   enrolments DELETE
