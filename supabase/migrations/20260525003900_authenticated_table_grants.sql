-- Migration 039: Grant authenticated role table access (RLS still enforces row access)
--
-- Aligns with SPEC §4.3.1 (RLS policy inventory) and §4.5 (financial integrity):
--   - GRANT  = can this role attempt the operation? (403 if missing)
--   - RLS    = which rows can this user touch?
--
-- Legal / compliance (SPEC §1.7, §4.5, §D privacy tests, coding rules):
--   - audit_log, payments: immutable — no UPDATE or DELETE grants
--   - people, families: never hard-delete — anonymise via RPC; no DELETE grants
--   - notification_log: append-only — INSERT + SELECT only
--   - enrolments: status changes via UPDATE; no hard DELETE grant
--
-- service_role / Edge Functions retain full access for webhooks, OTP, invoicing.

GRANT USAGE ON SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- SELECT: all tenant-scoped tables the app reads
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
  public.teachers,
  public.tenant_notification_templates,
  public.tenant_email_customizations,
  public.expense_categories,
  public.notification_log,
  public.audit_log,
  public.verification_attempts
TO authenticated;

-- ---------------------------------------------------------------------------
-- IMMUTABLE / APPEND-ONLY (SPEC: no UPDATE or DELETE — ever for audit; payments immutable)
-- ---------------------------------------------------------------------------
GRANT INSERT ON TABLE public.audit_log TO authenticated;
GRANT INSERT ON TABLE public.notification_log TO authenticated;
-- payments: SELECT only above; inserts/updates via service_role (Stripe webhooks)

-- ---------------------------------------------------------------------------
-- PII — anonymise, never hard-delete (SPEC §D: anonymise_student keeps financial trail)
-- ---------------------------------------------------------------------------
GRANT INSERT, UPDATE ON TABLE
  public.people,
  public.families,
  public.family_members
TO authenticated;

-- ---------------------------------------------------------------------------
-- ENROLMENTS — mutate status; do not hard-delete records
-- ---------------------------------------------------------------------------
GRANT INSERT, UPDATE ON TABLE public.enrolments TO authenticated;

-- ---------------------------------------------------------------------------
-- OPERATIONAL / ADMIN SETUP — full CRUD where SPEC grants tenant_admin ALL
-- (config entities, not financial or immutable audit records)
-- ---------------------------------------------------------------------------
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.user_profiles,
  public.contact_preferences,
  public.terms,
  public.levels,
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
  public.teachers,
  public.tenant_notification_templates,
  public.tenant_email_customizations,
  public.expense_categories,
  public.verification_attempts
TO authenticated;

-- tenants: admins update own tenant branding/settings (SPEC: UPDATE, not DELETE)
GRANT UPDATE ON TABLE public.tenants TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Not granted to authenticated (service_role / Edge Functions only):
--   otp_codes
--   payments INSERT/UPDATE/DELETE (immutable financial records)
--   audit_log UPDATE/DELETE
--   people/families/family_members DELETE
--   enrolments DELETE
