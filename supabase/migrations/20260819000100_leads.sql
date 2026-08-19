-- =============================================================================
-- 20260819000100: Leads — CRM pipeline entities that are NOT people/accounts
--
-- Phase 2 of the OpalSwift↔CRM integration. A lead is an inquiry ("mum asking
-- about a birthday party"), a separate entity from the operational
-- people/accounts stack: it has a pipeline stage, an acquisition channel and an
-- interest, and its terminal states are CONVERSION (converted_account_id set —
-- the account takes over as the Won contact) or stage 'lost'. Deliberately no
-- 'won' stage: winning IS converting.
--
-- Consumed read-only by the crm-contacts edge function (leads ∪ clients).
-- Writes come from tenant admins (future admin UI) and the service role
-- (future email-ingest worker; source_ref carries the ingest idempotency key).
--
-- ADDITIVE MIGRATION (post 2026-08-19 policy — SPEC §2.5.3): new file only,
-- no base-chain edits, no dev reset.
-- DEPENDENCIES: 000200 (tenants, RLS helpers), 000300 (accounts), 000500 (offerings)
-- =============================================================================

CREATE TABLE leads (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  name                    TEXT        NOT NULL CHECK (char_length(trim(name)) > 0),
  company                 TEXT,
  title                   TEXT,
  email                   TEXT,
  phone                   TEXT,
  stage                   TEXT        NOT NULL DEFAULT 'new'
                          CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'lost')),
  channel                 TEXT        NOT NULL DEFAULT 'website'
                          CHECK (channel IN ('email', 'website', 'whatsapp', 'linkedin', 'instagram')),
  -- What they asked about: free text ("birthday party"), and/or a concrete offering.
  interest                TEXT,
  offering_id             UUID        REFERENCES offerings(id),
  -- Quoted/expected amount in minor units of the tenant currency. NULL = not quoted.
  deal_value_minor        INT         CHECK (deal_value_minor IS NULL OR deal_value_minor >= 0),
  note                    TEXT,
  next_follow_up_at       TIMESTAMPTZ,
  last_contacted_at       TIMESTAMPTZ,
  last_communication_note TEXT,
  -- Consent is opt-IN for leads: false until they actually gave it.
  marketing_consent       BOOLEAN     NOT NULL DEFAULT false,
  -- Provenance / idempotency key for automated capture (e.g. inbound email Message-ID).
  source_ref              TEXT,
  -- Conversion handoff: once set, the account is the contact and the lead
  -- leaves the pipeline (crm-contacts stops serving it).
  converted_account_id    UUID        REFERENCES accounts(id),
  converted_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leads_converted_pair CHECK (
    (converted_account_id IS NULL AND converted_at IS NULL)
    OR (converted_account_id IS NOT NULL AND converted_at IS NOT NULL)
  )
);

COMMENT ON TABLE leads IS
  'CRM inquiries. Separate from people/accounts by design: an enrolled family is a Won client; a lead is still in the pipeline. Terminal states: converted (account takes over) or lost.';
COMMENT ON COLUMN leads.stage IS 'Pipeline stage. No won — winning is conversion (converted_account_id).';
COMMENT ON COLUMN leads.source_ref IS 'Idempotency/provenance key for automated ingest (e.g. email Message-ID). Unique per tenant when present.';

CREATE INDEX idx_leads_tenant        ON leads(tenant_id);
CREATE INDEX idx_leads_tenant_stage  ON leads(tenant_id, stage);
CREATE INDEX idx_leads_converted     ON leads(converted_account_id) WHERE converted_account_id IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_source_ref ON leads(tenant_id, source_ref) WHERE source_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_leads_updated_at();

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Staff-only data: parents/students never see leads.
CREATE POLICY leads_super_admin ON leads FOR ALL USING (is_super_admin());
CREATE POLICY leads_admin_manage ON leads FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;
