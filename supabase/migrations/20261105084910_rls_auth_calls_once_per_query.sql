-- Database rules (RLS) ask "who is signed in?" once per query, not once per row.
--
-- Supabase's performance advisor (auth_rls_initplan) flags policies that call
-- auth.uid() / auth.jwt() / auth.role() directly: Postgres then re-runs the
-- call for every row it checks. Wrapping the call as (select auth.uid()) makes
-- Postgres run it once and reuse the answer. Who can see or change what is
-- unchanged: every policy below keeps its exact rule, only the call is wrapped.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Generated from the live policy text (identical on prod and in the migration
-- chain at the time of writing); supabase/tests/rls-initplan checks none is left.

ALTER POLICY "admins manage account_members" ON public.account_members
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "members see own account_members" ON public.account_members
  USING (((user_profile_id = (select auth.uid())) OR (account_id IN ( SELECT get_my_account_ids() AS get_my_account_ids))));

ALTER POLICY "admins manage accounts" ON public.accounts
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage attendance" ON public.attendance
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "staff mark attendance" ON public.attendance
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('staff'::text = ANY (user_profiles.role)))))));

ALTER POLICY audit_log_admin_read ON public.audit_log
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY automatic_email_log_admin_read ON public.automatic_email_log
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY billing_accounts_admin ON public.billing_accounts
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY billing_month_adjustments_admin_read ON public.billing_month_adjustments
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY billing_schedules_admin ON public.billing_schedules
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage categories" ON public.categories
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins read own tenant consent_records" ON public.consent_records
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage consent_templates" ON public.consent_templates
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage preferences" ON public.contact_preferences
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "users manage own preferences" ON public.contact_preferences
  USING (((person_id = get_my_person_id()) OR (account_member_id IN ( SELECT account_members.id
   FROM account_members
  WHERE (account_members.user_profile_id = (select auth.uid()))))));

ALTER POLICY document_queue_admin_select ON public.document_queue
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage engagements" ON public.engagements
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY expense_categories_admin_manage ON public.expense_categories
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY expenses_admin_select ON public.expenses
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY gws_tenant_admin_select ON public.grow_webhook_secrets
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND (user_profiles.tenant_id = get_my_tenant_id()) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY job_details_admin_manage ON public.job_details
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY job_details_admin_only_select ON public.job_details
  USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY job_payment_requests_admin_manage ON public.job_payment_requests
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY job_photo_order_items_admin_select ON public.job_photo_order_items
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY job_photo_orders_admin_select ON public.job_photo_orders
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY job_photo_shops_admin_select ON public.job_photo_shops
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY lead_digest_optouts_own ON public.lead_digest_optouts
  USING (((user_id = (select auth.uid())) AND (tenant_id = get_my_tenant_id())))
  WITH CHECK (((user_id = (select auth.uid())) AND (tenant_id = get_my_tenant_id())));

ALTER POLICY lead_forms_admin_manage ON public.lead_forms
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY leads_admin_manage ON public.leads
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins read own tenant legal_acceptances" ON public.legal_acceptances
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "users read own legal_acceptances" ON public.legal_acceptances
  USING ((user_id = (select auth.uid())));

ALTER POLICY notification_log_admin_read ON public.notification_log
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY notification_log_service_insert ON public.notification_log
  WITH CHECK ((is_service_role() OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage offering_requirements" ON public.offering_requirements
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage sessions" ON public.offering_sessions
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "staff manage sessions" ON public.offering_sessions
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('staff'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage offerings" ON public.offerings
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY pdal_tenant_admin_select ON public.payment_document_access_log
  USING (((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = payment_document_access_log.payment_id) AND (p.tenant_id = get_my_tenant_id())))) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND (user_profiles.tenant_id = get_my_tenant_id()) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY pmt_admin_all ON public.payment_method_tokens
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY payments_admin_all ON public.payments
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage people" ON public.people
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "staff see all people" ON public.people
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY platform_access_log_admin_read ON public.platform_access_log
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY quote_lines_admin_manage ON public.quote_lines
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY quotes_admin_manage ON public.quotes
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage requirement_overrides" ON public.requirement_overrides
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage requirement_templates" ON public.requirement_templates
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage scheduling_blocks" ON public.scheduling_blocks
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage scheduling_holds" ON public.scheduling_holds
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage seasons" ON public.seasons
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage service_credits" ON public.service_credits
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage staff" ON public.staff
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY tenant_automatic_emails_admin_manage ON public.tenant_automatic_emails
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY tenant_custom_domains_admin_read ON public.tenant_custom_domains
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY tenant_email_customizations_admin_manage ON public.tenant_email_customizations
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins read own legal documents" ON public.tenant_legal_documents
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (up.role)))))));

ALTER POLICY templates_admin_manage ON public.tenant_notification_templates
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY tenant_photo_shop_settings_admin_manage ON public.tenant_photo_shop_settings
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage scheduling_hours" ON public.tenant_scheduling_hours
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage scheduling_settings" ON public.tenant_scheduling_settings
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins update own tenant" ON public.tenants
  USING (((id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "users read own profile" ON public.user_profiles
  USING ((id = (select auth.uid())));

ALTER POLICY admin_manage_attempts ON public.verification_attempts
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "admins manage waitlist" ON public.waitlist
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY waiver_events_select ON public.waiver_events
  USING (((tenant_id = get_my_tenant_id()) AND (is_service_role() OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role))))) OR (waiver_evidence_id IN ( SELECT we.id
   FROM (waiver_evidence we
     JOIN people p ON ((p.id = we.person_id)))
  WHERE ((p.tenant_id = get_my_tenant_id()) AND ((p.id = ( SELECT user_profiles.person_id
           FROM user_profiles
          WHERE (user_profiles.id = (select auth.uid())))) OR (p.account_id IN ( SELECT account_members.account_id
           FROM account_members
          WHERE (account_members.user_profile_id = (select auth.uid())))))))) OR (waiver_evidence_id IS NULL))));

ALTER POLICY waiver_evidence_select ON public.waiver_evidence
  USING (((tenant_id = get_my_tenant_id()) AND (is_service_role() OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role))))) OR (person_id IN ( SELECT p.id
   FROM people p
  WHERE ((p.tenant_id = get_my_tenant_id()) AND ((p.id = ( SELECT user_profiles.person_id
           FROM user_profiles
          WHERE (user_profiles.id = (select auth.uid())))) OR (p.account_id IN ( SELECT account_members.account_id
           FROM account_members
          WHERE (account_members.user_profile_id = (select auth.uid())))))))))));

ALTER POLICY waiver_evidence_pdfs_admin_select ON public.waiver_evidence_pdfs
  USING (((tenant_id = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins delete offering images" ON storage.objects
  USING (((bucket_id = 'offering-images'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = ((storage.foldername(o.name))[2])::uuid) AND (o.tenant_id = get_my_tenant_id())))) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins insert offering images" ON storage.objects
  WITH CHECK (((bucket_id = 'offering-images'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND ((storage.foldername(name))[3] = 'cover.webp'::text) AND (EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = ((storage.foldername(o.name))[2])::uuid) AND (o.tenant_id = get_my_tenant_id())))) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins insert own tenant expense receipts" ON storage.objects
  WITH CHECK (((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins read own legal documents" ON storage.objects
  USING (((bucket_id = 'tenant-legal-documents'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (up.role)))))));

ALTER POLICY "Admins read own tenant expense receipts" ON storage.objects
  USING (((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins read own tenant waiver PDFs" ON storage.objects
  USING (((bucket_id = 'waiver-pdfs'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins update offering images" ON storage.objects
  USING (((bucket_id = 'offering-images'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND (EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = ((storage.foldername(o.name))[2])::uuid) AND (o.tenant_id = get_my_tenant_id())))) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))))
  WITH CHECK (((bucket_id = 'offering-images'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND ((storage.foldername(name))[3] = 'cover.webp'::text) AND (EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = ((storage.foldername(o.name))[2])::uuid) AND (o.tenant_id = get_my_tenant_id())))) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "Admins upload own legal documents" ON storage.objects
  WITH CHECK (((bucket_id = 'tenant-legal-documents'::text) AND ((storage.foldername(name))[1] = (get_my_tenant_id())::text) AND ((storage.foldername(name))[2] = ANY (ARRAY['studio-privacy'::text, 'enrolment-terms'::text, 'accessibility'::text, 'cookies'::text])) AND (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (up.role)))))));

ALTER POLICY "Users read own waiver PDFs" ON storage.objects
  USING (((bucket_id = 'waiver-pdfs'::text) AND (((storage.foldername(name))[2] = ( SELECT (user_profiles.person_id)::text AS person_id
   FROM user_profiles
  WHERE (user_profiles.id = (select auth.uid())))) OR ((storage.foldername(name))[2] IN ( SELECT (p.id)::text AS id
   FROM people p
  WHERE ((p.tenant_id = get_my_tenant_id()) AND (p.account_id IN ( SELECT account_members.account_id
           FROM account_members
          WHERE (account_members.user_profile_id = (select auth.uid()))))))))));

ALTER POLICY legal_documents_admin_select ON storage.objects
  USING (((bucket_id = 'legal-documents'::text) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND ('tenant_admin'::text = ANY (user_profiles.role)))))));

ALTER POLICY "tenant-assets admin delete" ON storage.objects
  USING (((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND (('tenant_admin'::text = ANY (user_profiles.role)) OR ('super_admin'::text = ANY (user_profiles.role))))))));

ALTER POLICY "tenant-assets admin insert" ON storage.objects
  WITH CHECK (((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND (('tenant_admin'::text = ANY (user_profiles.role)) OR ('super_admin'::text = ANY (user_profiles.role))))))));

ALTER POLICY "tenant-assets admin update" ON storage.objects
  USING (((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid = get_my_tenant_id()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = (select auth.uid())) AND (('tenant_admin'::text = ANY (user_profiles.role)) OR ('super_admin'::text = ANY (user_profiles.role))))))));

