-- =============================================================================
-- 002500: All table + schema grants
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
  public.waiver_evidence,
  public.waiver_events,
  public.engagements,
  public.billing_accounts,
  public.waitlist,
  public.attendance,
  public.service_credits,
  public.payments,
  public.payment_method_tokens,
  public.billing_schedules,
  public.invoicing_token_cache,
  public.document_queue,
  public.payment_document_access_log,
  public.tenant_notification_templates,
  public.tenant_email_customizations,
  public.expense_categories,
  public.expenses,
  public.grow_webhook_secrets,
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

-- waiver_evidence / waiver_events are SELECT-only for authenticated; all writes
-- go through sign_waiver() (service_role). No INSERT/UPDATE/DELETE grant here.

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Belt-and-suspenders: sign_waiver is service_role only (already revoked in 001200).
REVOKE EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN
) FROM PUBLIC, authenticated;
