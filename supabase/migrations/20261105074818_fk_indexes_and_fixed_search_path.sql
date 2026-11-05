-- =============================================================================
-- Indexes for foreign keys that had none, and a fixed search_path for six
-- functions (Supabase database advisor: unindexed_foreign_keys,
-- function_search_path_mutable). No data or behaviour changes.
--
--  * Without an index, a lookup by the linked column (and every delete of the
--    linked row) scans the whole table. tenant_id is used by almost every
--    query and security rule.
--  * The six functions only use fully qualified names, so an empty
--    search_path changes nothing except that a caller can no longer steer
--    which schema they resolve names in.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_consent_records_engagement ON public.consent_records(engagement_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_recorded_by ON public.consent_records(recorded_by);
CREATE INDEX IF NOT EXISTS idx_consent_templates_lawyer_reviewed_by ON public.consent_templates(lawyer_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_custom_domain_rollout_enabled_by ON public.custom_domain_rollout(enabled_by);
CREATE INDEX IF NOT EXISTS idx_job_photo_order_items_tenant ON public.job_photo_order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_photo_orders_person ON public.job_photo_orders(person_id);
CREATE INDEX IF NOT EXISTS idx_lead_digest_optouts_tenant ON public.lead_digest_optouts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_form_invites_created_by ON public.lead_form_invites(created_by);
CREATE INDEX IF NOT EXISTS idx_lead_form_invites_form ON public.lead_form_invites(form_id);
CREATE INDEX IF NOT EXISTS idx_lead_form_invites_lead ON public.lead_form_invites(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_form_invites_tenant ON public.lead_form_invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_forms_offering ON public.lead_forms(offering_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted_engagement ON public.leads(converted_engagement_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON public.legal_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_takbull_orders_tenant ON public.takbull_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_feature_optouts_created_by ON public.tenant_feature_optouts(created_by);
CREATE INDEX IF NOT EXISTS idx_tenant_legal_documents_uploaded_by ON public.tenant_legal_documents(uploaded_by);

ALTER FUNCTION private.feature_set_of(text, public.tenant_plan) SET search_path = '';
ALTER FUNCTION private.feature_studio_switchable(text, text, public.tenant_plan) SET search_path = '';
ALTER FUNCTION private.green_invoice_type_for_status(text) SET search_path = '';
ALTER FUNCTION private.prefill_green_invoice_document_type() SET search_path = '';
ALTER FUNCTION private.prefill_takbull_document_type() SET search_path = '';
ALTER FUNCTION public.guard_tenant_business_profile() SET search_path = '';
