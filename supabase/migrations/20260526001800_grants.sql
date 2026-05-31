-- =============================================================================
-- 018: All Table + Schema Grants
-- Must run LAST — all tables must exist before grants can reference them.
-- DEPENDENCIES: all previous migrations
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT ON TABLE
  public.tenants,
  public.user_profiles,
  public.accounts,
  public.account_members,
  public.people,
  public.contact_preferences,
  public.seasons,
  public.categories,
  public.staff,
  public.offerings,
  public.offering_sessions,
  public.offering_requirements,
  public.requirement_templates,
  public.requirement_overrides,
  public.consent_templates,
  public.engagements,
  public.billing_accounts,
  public.waitlist,
  public.attendance,
  public.service_credits,
  public.payments,
  public.invoice_sequences,
  public.tenant_notification_templates,
  public.tenant_email_customizations,
  public.expense_categories,
  public.notification_log,
  public.audit_log,
  public.verification_attempts
TO authenticated;

GRANT INSERT ON TABLE public.audit_log        TO authenticated;
GRANT INSERT ON TABLE public.notification_log TO authenticated;

GRANT INSERT, UPDATE ON TABLE
  public.people,
  public.accounts,
  public.account_members
TO authenticated;

GRANT INSERT, UPDATE ON TABLE public.engagements TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.user_profiles,
  public.contact_preferences,
  public.seasons,
  public.categories,
  public.staff,
  public.offerings,
  public.offering_sessions,
  public.offering_requirements,
  public.requirement_templates,
  public.requirement_overrides,
  public.consent_templates,
  public.billing_accounts,
  public.waitlist,
  public.attendance,
  public.service_credits,
  public.tenant_notification_templates,
  public.tenant_email_customizations,
  public.expense_categories,
  public.verification_attempts
TO authenticated;

GRANT UPDATE ON TABLE public.tenants TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT ALL ON TABLE public.tenants       TO service_role;
GRANT ALL ON TABLE public.user_profiles TO service_role;
