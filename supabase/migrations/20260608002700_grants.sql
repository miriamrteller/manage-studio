-- =============================================================================
-- 002700: All table + schema grants
-- Must run AFTER feature + scheduling tables exist.
-- DEPENDENCIES: all previous migrations through 002600
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
  public.verification_attempts,
  public.verticals,
  public.feature_definitions,
  public.tenant_feature_overrides,
  public.tenant_scheduling_settings,
  public.tenant_scheduling_hours,
  public.scheduling_blocks,
  public.scheduling_holds
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
  public.verification_attempts,
  public.tenant_scheduling_hours,
  public.scheduling_blocks,
  public.scheduling_holds
TO authenticated;

GRANT INSERT, UPDATE ON TABLE public.tenant_scheduling_settings TO authenticated;

GRANT UPDATE ON TABLE public.tenants TO authenticated;

-- waiver_evidence / waiver_events are SELECT-only for authenticated; all writes
-- go through sign_waiver() (service_role). No INSERT/UPDATE/DELETE grant here.

-- =============================================================================
-- Column-level lockdown of tenant secrets.
--
-- The `users see own tenant` RLS policy is deliberately broad — every member of
-- a tenant needs the row for branding, locale and feature config, and five admin
-- forms read it directly. But row access is not column access: with a plain
-- table-level GRANT SELECT, any authenticated user in the tenant — including a
-- parent — could read the studio's encrypted provider credentials. Verified by
-- `pnpm verify:rls`, which asserts exactly this.
--
-- Postgres cannot subtract a column from a table-level grant, so the table-level
-- SELECT is revoked and re-granted per column, excluding everything matching
-- '%_enc'. Generated rather than hardcoded so a future encrypted column is
-- excluded automatically — fail-closed, matching the naming convention already
-- used for every secret in this schema.
--
-- Edge Functions are unaffected (service_role), and so are the SECURITY DEFINER
-- RPCs, which execute as owner.
-- =============================================================================
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tenants'
    AND column_name NOT LIKE '%\_enc';

  EXECUTE 'REVOKE SELECT ON TABLE public.tenants FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.tenants TO anon, authenticated', cols);
END;
$$;

-- grow_webhook_secrets exists only to hold a secret; clients never read it.
-- The pre-shared key is consumed by handle-payment-event (service_role).
REVOKE SELECT ON TABLE public.grow_webhook_secrets FROM anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Belt-and-suspenders: sign_waiver is service_role only (already revoked in 001200).
REVOKE EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN
) FROM PUBLIC, authenticated;
