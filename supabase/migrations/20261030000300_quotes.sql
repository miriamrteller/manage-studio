-- =============================================================================
-- 20261030000300: Quotes + automatic shoot emails (photographer Thread C)
--
-- A quote is a priced proposal sent to a lead (or to the client of an
-- existing shoot). A shoot is an engagements row + job_details (Thread A,
-- vertical-neutral "job"). The client opens /quote/:token, ticks optional
-- add-ons and accepts. Acceptance is ONE transaction (accept_quote): lead →
-- job conversion, job_status 'booked', deposit + balance payment requests.
--
-- Amounts are GROSS minor units (SPEC §2.5.1): the invoicing provider owns the
-- pretax/VAT split, so no breakdown is stored here. The same formula lives in
-- packages/shared/src/quote-pricing.ts (computeQuoteTotals) for UI previews.
--
-- ADDITIVE MIGRATION (SPEC §2.5.3): new objects only, no base-chain edits.
-- DEPENDENCIES:
--   base chain (tenants, leads, accounts, people, offerings, engagements, audit_log)
--   20261030000100_job_details.sql — job_details, job_resolve_client, job_insert (Thread A)
--   20261030000200_*               — create_shoot_payment_requests (Thread B)
--   20260608002800 — get_supabase_functions_url / get_cron_secret
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE quotes (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id),
  lead_id                  UUID        REFERENCES leads(id),
  account_id               UUID        REFERENCES accounts(id),
  -- Existing shoot this quote prices; NULL until a lead quote is accepted.
  engagement_id            UUID        REFERENCES engagements(id),
  status                   TEXT        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  -- 256 random bits; the link IS the credential, so never expose it in lists to non-admins.
  public_token             TEXT        NOT NULL UNIQUE
                           DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  title                    TEXT        CHECK (title IS NULL OR char_length(title) <= 200),
  currency                 TEXT        NOT NULL DEFAULT 'ILS',
  -- Planned shoot date for lead quotes (no engagement yet). Balance falls due on it.
  shoot_date               DATE,
  valid_until              DATE,
  notes                    TEXT        CHECK (notes IS NULL OR char_length(notes) <= 5000),
  deposit_percent          INT         NOT NULL DEFAULT 30 CHECK (deposit_percent BETWEEN 0 AND 100),
  balance_max_installments INT         NOT NULL DEFAULT 1 CHECK (balance_max_installments BETWEEN 1 AND 36),
  send_contract_on_accept  BOOLEAN     NOT NULL DEFAULT false,
  -- Gross totals, maintained by quote_recalc_totals() + trg_quotes_deposit.
  required_minor           INT         NOT NULL DEFAULT 0 CHECK (required_minor >= 0),
  optional_selected_minor  INT         NOT NULL DEFAULT 0 CHECK (optional_selected_minor >= 0),
  total_minor              INT         NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  deposit_minor            INT         NOT NULL DEFAULT 0 CHECK (deposit_minor >= 0),
  balance_minor            INT         NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  sent_at                  TIMESTAMPTZ,
  sent_via                 TEXT        CHECK (sent_via IN ('email', 'whatsapp', 'link')),
  accepted_at              TIMESTAMPTZ,
  accepted_result          JSONB,
  declined_at              TIMESTAMPTZ,
  decline_reason           TEXT        CHECK (decline_reason IS NULL OR char_length(decline_reason) <= 2000),
  created_by               UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The client is the lead, or the person behind the shoot (account optional).
  -- Acceptance must also be able to produce a shoot: one exists or a lead converts.
  CONSTRAINT quotes_has_shoot_source CHECK (engagement_id IS NOT NULL OR lead_id IS NOT NULL),
  CONSTRAINT quotes_accepted_pair CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
  CONSTRAINT quotes_total_sum CHECK (total_minor = required_minor + optional_selected_minor),
  CONSTRAINT quotes_deposit_sum CHECK (deposit_minor + balance_minor = total_minor)
);

COMMENT ON TABLE quotes IS
  'Photographer quotes. Gross minor units (provider owns VAT split). Accepted via accept_quote() in one transaction.';
COMMENT ON COLUMN quotes.public_token IS 'Secret link token for /quote/:token. Public reads go through get_public_quote() only.';
COMMENT ON COLUMN quotes.accepted_result IS 'Snapshot returned by accept_quote(); replayed verbatim on repeat accepts (idempotency).';

CREATE INDEX idx_quotes_tenant      ON quotes(tenant_id, created_at DESC);
CREATE INDEX idx_quotes_lead        ON quotes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_quotes_engagement  ON quotes(engagement_id) WHERE engagement_id IS NOT NULL;

CREATE TABLE quote_lines (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  quote_id         UUID        NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  -- Package/add-on from the catalogue; NULL for a free-text line.
  offering_id      UUID        REFERENCES offerings(id),
  description      TEXT        NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 500),
  qty              INT         NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 100),
  -- Gross per-unit price; cap keeps qty × price inside INT.
  unit_price_minor INT         NOT NULL CHECK (unit_price_minor BETWEEN 0 AND 10000000),
  is_optional      BOOLEAN     NOT NULL DEFAULT false,
  is_selected      BOOLEAN     NOT NULL DEFAULT true,
  sort_order       INT         NOT NULL DEFAULT 0,
  line_total_minor INT         GENERATED ALWAYS AS (qty * unit_price_minor) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quote_lines_required_selected CHECK (is_optional OR is_selected)
);

CREATE INDEX idx_quote_lines_quote ON quote_lines(quote_id, sort_order);

-- Per-tenant toggles for the fixed set of automatic emails. Missing row = ON.
CREATE TABLE tenant_automatic_emails (
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  email_key  TEXT        NOT NULL CHECK (email_key IN
               ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready')),
  enabled    BOOLEAN     NOT NULL,
  updated_by UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, email_key)
);

-- One automatic send per (email, quote|shoot). Claimed before sending so a
-- concurrent cron run or a double-click cannot send twice.
CREATE TABLE automatic_email_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  email_key       TEXT        NOT NULL CHECK (email_key IN
                    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready')),
  quote_id        UUID        REFERENCES quotes(id) ON DELETE CASCADE,
  engagement_id   UUID        REFERENCES engagements(id) ON DELETE CASCADE,
  recipient_email TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        INT         NOT NULL DEFAULT 1,
  failure_reason  TEXT,
  external_msg_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT automatic_email_log_subject CHECK (num_nonnulls(quote_id, engagement_id) = 1)
);

CREATE UNIQUE INDEX uq_automatic_email_quote
  ON automatic_email_log(email_key, quote_id) WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX uq_automatic_email_engagement
  ON automatic_email_log(email_key, engagement_id) WHERE engagement_id IS NOT NULL;
CREATE INDEX idx_automatic_email_log_tenant ON automatic_email_log(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. RLS — staff-only data; clients reach quotes through SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------

ALTER TABLE quotes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_automatic_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE automatic_email_log     ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_super_admin ON quotes FOR ALL USING (is_super_admin());
CREATE POLICY quotes_admin_manage ON quotes FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

CREATE POLICY quote_lines_super_admin ON quote_lines FOR ALL USING (is_super_admin());
CREATE POLICY quote_lines_admin_manage ON quote_lines FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

CREATE POLICY tenant_automatic_emails_super_admin ON tenant_automatic_emails FOR ALL USING (is_super_admin());
CREATE POLICY tenant_automatic_emails_admin_manage ON tenant_automatic_emails FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Delivery log: admins read; writes are service-role only (claim/complete RPCs).
CREATE POLICY automatic_email_log_super_admin ON automatic_email_log FOR SELECT USING (is_super_admin());
CREATE POLICY automatic_email_log_admin_read ON automatic_email_log FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quotes                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quote_lines             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_automatic_emails TO authenticated;
GRANT SELECT                         ON TABLE public.automatic_email_log     TO authenticated;
GRANT ALL ON TABLE public.quotes, public.quote_lines, public.tenant_automatic_emails,
               public.automatic_email_log TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Totals (gross) + locking
-- ---------------------------------------------------------------------------

-- Deposit = round-half-up(total × pct / 100). Mirrors computeQuoteTotals().
CREATE OR REPLACE FUNCTION quote_deposit_minor(p_total_minor INT, p_deposit_percent INT)
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ((p_total_minor::bigint * p_deposit_percent + 50) / 100)::int;
$$;

CREATE OR REPLACE FUNCTION quote_recalc_totals(p_quote_id UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE quotes q SET
    required_minor          = s.required_minor,
    optional_selected_minor = s.optional_minor,
    total_minor             = s.required_minor + s.optional_minor
  FROM (
    SELECT
      COALESCE(SUM(line_total_minor) FILTER (WHERE NOT is_optional), 0)::int AS required_minor,
      COALESCE(SUM(line_total_minor) FILTER (WHERE is_optional AND is_selected), 0)::int AS optional_minor
    FROM quote_lines WHERE quote_id = p_quote_id
  ) s
  WHERE q.id = p_quote_id
    AND (q.required_minor, q.optional_selected_minor)
        IS DISTINCT FROM (s.required_minor, s.optional_minor);
END;
$$;

CREATE OR REPLACE FUNCTION trg_quotes_before_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.deposit_minor := quote_deposit_minor(NEW.total_minor, NEW.deposit_percent);
  NEW.balance_minor := NEW.total_minor - NEW.deposit_minor;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    -- Once settled, the money terms are frozen (payment requests derive from them).
    IF OLD.status IN ('accepted', 'declined', 'expired')
       AND (NEW.total_minor, NEW.deposit_percent, NEW.balance_max_installments, NEW.shoot_date)
           IS DISTINCT FROM (OLD.total_minor, OLD.deposit_percent, OLD.balance_max_installments, OLD.shoot_date) THEN
      RAISE EXCEPTION 'quote % is %, its terms can no longer change', OLD.id, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
      RAISE EXCEPTION 'an accepted quote cannot change status' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotes_before_write
  BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION trg_quotes_before_write();

-- An accepted quote is the record behind a booking and its payment requests.
CREATE OR REPLACE FUNCTION trg_quotes_before_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    RAISE EXCEPTION 'an accepted quote cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_quotes_before_delete
  BEFORE DELETE ON quotes
  FOR EACH ROW EXECUTE FUNCTION trg_quotes_before_delete();

CREATE OR REPLACE FUNCTION trg_quote_lines_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_status TEXT;
  v_quote  UUID := COALESCE(NEW.quote_id, OLD.quote_id);
BEGIN
  SELECT status INTO v_status FROM quotes WHERE id = v_quote;
  -- v_status IS NULL: parent being deleted (cascade) — allow.
  IF v_status IS NOT NULL AND v_status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'quote % is %, its lines are locked', v_quote, v_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM quotes WHERE id = NEW.quote_id) THEN
      RAISE EXCEPTION 'quote line tenant mismatch' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_quote_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION trg_quote_lines_guard();

CREATE OR REPLACE FUNCTION trg_quote_lines_recalc()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM quote_recalc_totals(COALESCE(NEW.quote_id, OLD.quote_id));
  IF TG_OP = 'UPDATE' AND NEW.quote_id <> OLD.quote_id THEN
    PERFORM quote_recalc_totals(OLD.quote_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_quote_lines_recalc
  AFTER INSERT OR UPDATE OR DELETE ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION trg_quote_lines_recalc();

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION quote_assert_tenant_admin(p_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_super_admin() THEN RETURN; END IF;
  IF auth.uid() IS NULL OR p_tenant_id IS DISTINCT FROM get_my_tenant_id() OR NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- Client contact for a quote: lead first, then the account's primary person,
-- then the shoot's own person.
CREATE OR REPLACE FUNCTION quote_client_contact(p_quote_id UUID)
RETURNS TABLE (client_name TEXT, client_email TEXT, client_phone TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(l.name, a.name, ap.name, ep.name),
    COALESCE(l.email, ap.email, ep.email),
    COALESCE(l.phone, ap.emergency_contact_phone, ep.emergency_contact_phone)
  FROM quotes q
  LEFT JOIN leads       l  ON l.id = q.lead_id
  LEFT JOIN accounts    a  ON a.id = q.account_id
  LEFT JOIN people      ap ON ap.id = a.person_id
  LEFT JOIN engagements e  ON e.id = q.engagement_id
  LEFT JOIN people      ep ON ep.id = e.person_id
  WHERE q.id = p_quote_id;
$$;

CREATE OR REPLACE FUNCTION is_automatic_email_enabled(p_tenant_id UUID, p_email_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT enabled FROM tenant_automatic_emails WHERE tenant_id = p_tenant_id AND email_key = p_email_key),
    true);
$$;

-- Package for the job a lead quote turns into: first included package line,
-- else the lead's own package (job_insert requires one).
CREATE OR REPLACE FUNCTION quote_job_offering_id(p_quote_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT offering_id FROM quote_lines
     WHERE quote_id = p_quote_id AND offering_id IS NOT NULL AND NOT is_optional
     ORDER BY sort_order, created_at LIMIT 1),
    (SELECT l.offering_id FROM quotes q JOIN leads l ON l.id = q.lead_id WHERE q.id = p_quote_id));
$$;

CREATE OR REPLACE FUNCTION quote_lines_json(p_quote_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'offering_id', offering_id, 'description', description, 'qty', qty,
    'unit_price_minor', unit_price_minor, 'line_total_minor', line_total_minor,
    'is_optional', is_optional, 'is_selected', is_selected, 'sort_order', sort_order
  ) ORDER BY sort_order, created_at), '[]'::jsonb)
  FROM quote_lines WHERE quote_id = p_quote_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Admin RPCs
-- ---------------------------------------------------------------------------

-- Upsert a quote and replace its lines atomically. p_quote.id NULL → create.
CREATE OR REPLACE FUNCTION save_quote(p_quote JSONB, p_lines JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant     UUID := get_my_tenant_id();
  v_id         UUID := NULLIF(p_quote->>'id', '')::uuid;
  v_lead       UUID := NULLIF(p_quote->>'lead_id', '')::uuid;
  v_account    UUID := NULLIF(p_quote->>'account_id', '')::uuid;
  v_engagement UUID := NULLIF(p_quote->>'engagement_id', '')::uuid;
  v_status     TEXT;
  v_line       JSONB;
  v_i          INT := 0;
BEGIN
  PERFORM quote_assert_tenant_admin(v_tenant);
  IF jsonb_typeof(COALESCE(p_lines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_lines must be an array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_lead IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads WHERE id = v_lead AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_engagement IS NOT NULL THEN
    -- Account comes from the shoot's person when the caller did not pass one.
    SELECT COALESCE(v_account, p.account_id) INTO v_account
    FROM engagements e JOIN people p ON p.id = e.person_id
    WHERE e.id = v_engagement AND e.tenant_id = v_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shoot not found' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  IF v_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_account AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO quotes (tenant_id, lead_id, account_id, engagement_id, title, currency, shoot_date,
                        valid_until, notes, deposit_percent, balance_max_installments,
                        send_contract_on_accept, created_by)
    VALUES (v_tenant, v_lead, v_account, v_engagement, NULLIF(trim(p_quote->>'title'), ''),
            COALESCE(NULLIF(p_quote->>'currency', ''), 'ILS'),
            NULLIF(p_quote->>'shoot_date', '')::date, NULLIF(p_quote->>'valid_until', '')::date,
            NULLIF(trim(p_quote->>'notes'), ''), COALESCE((p_quote->>'deposit_percent')::int, 30),
            COALESCE((p_quote->>'balance_max_installments')::int, 1),
            COALESCE((p_quote->>'send_contract_on_accept')::boolean, false), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT status INTO v_status FROM quotes WHERE id = v_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_status NOT IN ('draft', 'sent') THEN
      RAISE EXCEPTION 'Quote is % and can no longer be edited', v_status USING ERRCODE = 'check_violation';
    END IF;
    UPDATE quotes SET
      lead_id = v_lead, account_id = v_account, engagement_id = v_engagement,
      title = NULLIF(trim(p_quote->>'title'), ''),
      currency = COALESCE(NULLIF(p_quote->>'currency', ''), currency),
      shoot_date = NULLIF(p_quote->>'shoot_date', '')::date,
      valid_until = NULLIF(p_quote->>'valid_until', '')::date,
      notes = NULLIF(trim(p_quote->>'notes'), ''),
      deposit_percent = COALESCE((p_quote->>'deposit_percent')::int, deposit_percent),
      balance_max_installments = COALESCE((p_quote->>'balance_max_installments')::int, balance_max_installments),
      send_contract_on_accept = COALESCE((p_quote->>'send_contract_on_accept')::boolean, send_contract_on_accept)
    WHERE id = v_id;
    DELETE FROM quote_lines WHERE quote_id = v_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) LOOP
    v_i := v_i + 1;
    IF NULLIF(v_line->>'offering_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM offerings WHERE id = (v_line->>'offering_id')::uuid AND tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'Package not found' USING ERRCODE = 'foreign_key_violation';
    END IF;
    INSERT INTO quote_lines (tenant_id, quote_id, offering_id, description, qty, unit_price_minor,
                             is_optional, is_selected, sort_order)
    VALUES (v_tenant, v_id, NULLIF(v_line->>'offering_id', '')::uuid, trim(v_line->>'description'),
            COALESCE((v_line->>'qty')::int, 1), (v_line->>'unit_price_minor')::int,
            COALESCE((v_line->>'is_optional')::boolean, false),
            -- Required lines are always in; optional ones start unticked unless preselected.
            NOT COALESCE((v_line->>'is_optional')::boolean, false)
              OR COALESCE((v_line->>'is_selected')::boolean, false),
            v_i);
  END LOOP;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_quote_sent(p_quote_id UUID, p_via TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM quote_assert_tenant_admin(v_q.tenant_id);
  IF v_q.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'Quote is % and cannot be sent', v_q.status USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM quote_lines WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'Add at least one line before sending' USING ERRCODE = 'check_violation';
  END IF;
  IF v_q.engagement_id IS NULL AND quote_job_offering_id(p_quote_id) IS NULL THEN
    RAISE EXCEPTION 'Add a package line (or set the lead''s package) before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE quotes SET status = 'sent', sent_at = now(), sent_via = p_via WHERE id = p_quote_id;
  RETURN jsonb_build_object('id', p_quote_id, 'public_token', v_q.public_token, 'status', 'sent');
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_quote(p_quote_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q quotes%ROWTYPE;
  v_c RECORD;
BEGIN
  SELECT * INTO v_q FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM quote_assert_tenant_admin(v_q.tenant_id);
  SELECT * INTO v_c FROM quote_client_contact(p_quote_id);
  RETURN to_jsonb(v_q) || jsonb_build_object(
    'client_name', v_c.client_name, 'client_email', v_c.client_email, 'client_phone', v_c.client_phone,
    'lines', quote_lines_json(p_quote_id));
END;
$$;

CREATE OR REPLACE FUNCTION list_admin_quotes()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := get_my_tenant_id();
BEGIN
  PERFORM quote_assert_tenant_admin(v_tenant);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'status', q.status, 'title', q.title, 'lead_id', q.lead_id,
      'engagement_id', q.engagement_id, 'total_minor', q.total_minor, 'currency', q.currency,
      'shoot_date', q.shoot_date, 'valid_until', q.valid_until, 'sent_at', q.sent_at,
      'accepted_at', q.accepted_at, 'created_at', q.created_at, 'client_name', c.client_name
    ) ORDER BY q.created_at DESC)
    FROM (SELECT * FROM quotes WHERE tenant_id = v_tenant ORDER BY created_at DESC LIMIT 500) q
    CROSS JOIN LATERAL quote_client_contact(q.id) c
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Public RPCs (token is the credential)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_public_quote(p_token TEXT, p_tenant_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q      quotes%ROWTYPE;
  v_status TEXT;
  v_today  DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  IF p_token IS NULL OR char_length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO v_q FROM quotes WHERE public_token = p_token AND tenant_id = p_tenant_id;
  -- Drafts are invisible: the admin has not sent them yet.
  IF NOT FOUND OR v_q.status = 'draft' THEN RETURN NULL; END IF;

  v_status := CASE WHEN v_q.status = 'sent' AND v_q.valid_until < v_today THEN 'expired' ELSE v_q.status END;

  RETURN jsonb_build_object(
    'status', v_status, 'title', v_q.title, 'currency', v_q.currency,
    'shoot_date', v_q.shoot_date, 'valid_until', v_q.valid_until, 'notes', v_q.notes,
    'deposit_percent', v_q.deposit_percent, 'balance_max_installments', v_q.balance_max_installments,
    'required_minor', v_q.required_minor, 'optional_selected_minor', v_q.optional_selected_minor,
    'total_minor', v_q.total_minor, 'deposit_minor', v_q.deposit_minor, 'balance_minor', v_q.balance_minor,
    'accepted_at', v_q.accepted_at,
    'client_name', (SELECT client_name FROM quote_client_contact(v_q.id)),
    'lines', quote_lines_json(v_q.id));
END;
$$;

CREATE OR REPLACE FUNCTION decline_public_quote(p_token TEXT, p_tenant_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM quotes WHERE public_token = p_token AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_q.status = 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v_q.status = 'declined' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'declined');
  END IF;
  IF v_q.status <> 'sent' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_open', 'status', v_q.status);
  END IF;
  UPDATE quotes SET status = 'declined', declined_at = now(), decline_reason = left(NULLIF(trim(p_reason), ''), 2000)
  WHERE id = v_q.id;
  RETURN jsonb_build_object('ok', true, 'status', 'declined');
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Acceptance — ONE transaction, idempotent
--
-- Called by the accept-quote edge function (service role) so the booking
-- confirmation email can follow a first acceptance. Expected failures return
-- {ok:false, code} instead of raising; unexpected ones raise and roll back.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accept_quote(
  p_token             TEXT,
  p_tenant_id         UUID,
  p_selected_line_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q            quotes%ROWTYPE;
  v_today        DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_selected     UUID[] := COALESCE(p_selected_line_ids, '{}');
  v_engagement   UUID;
  v_job_status   TEXT;
  v_offering     UUID;
  v_lead         leads%ROWTYPE;
  v_client       RECORD;
  v_shoot_date   DATE;
  v_balance_due  DATE;
  v_lang         TEXT;
  v_requests     JSONB := '[]'::jsonb;
  v_result       JSONB;
BEGIN
  -- 1. Lock. A concurrent second click blocks here, then sees 'accepted'.
  SELECT * INTO v_q FROM quotes
  WHERE public_token = p_token AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_q.status = 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF v_q.status = 'accepted' THEN
    RETURN v_q.accepted_result || jsonb_build_object('already_accepted', true);
  END IF;
  IF v_q.status <> 'sent' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_open', 'status', v_q.status);
  END IF;
  IF v_q.valid_until < v_today THEN
    UPDATE quotes SET status = 'expired' WHERE id = v_q.id;
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  -- 2. Validate before mutating anything.
  IF EXISTS (
    SELECT 1 FROM unnest(v_selected) AS s(id)
    WHERE NOT EXISTS (SELECT 1 FROM quote_lines l WHERE l.id = s.id AND l.quote_id = v_q.id AND l.is_optional)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_selection');
  END IF;
  IF v_q.engagement_id IS NOT NULL THEN
    SELECT job_status INTO v_job_status FROM job_details WHERE engagement_id = v_q.engagement_id;
    IF v_job_status = 'cancelled' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'shoot_cancelled');
    END IF;
  ELSE
    v_offering := quote_job_offering_id(v_q.id);
    IF v_offering IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'no_package');
    END IF;
  END IF;

  -- 3. Client's add-on selection → totals.
  UPDATE quote_lines SET is_selected = (NOT is_optional) OR id = ANY(v_selected)
  WHERE quote_id = v_q.id
    AND is_selected IS DISTINCT FROM ((NOT is_optional) OR id = ANY(v_selected));
  PERFORM quote_recalc_totals(v_q.id);
  SELECT * INTO v_q FROM quotes WHERE id = v_q.id;

  -- 4. Shoot: convert the lead or reuse the existing engagement.
  -- convert_lead_to_job() requires a signed-in tenant admin, but the client
  -- accepting here is anonymous, so this mirrors it with Thread A's internal
  -- building blocks (job_resolve_client + job_insert, service-only helpers).
  -- If the admin already converted this lead (A's UI), reuse its live job
  -- rather than tripping the one-undated-job-per-package index.
  v_engagement := v_q.engagement_id;
  IF v_engagement IS NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_q.lead_id AND tenant_id = v_q.tenant_id FOR UPDATE;
    SELECT * INTO v_client
    FROM job_resolve_client(v_q.tenant_id, NULL, v_lead.name, v_lead.email, v_lead.phone);
    SELECT jd.engagement_id INTO v_engagement
    FROM job_details jd JOIN engagements e ON e.id = jd.engagement_id
    WHERE jd.lead_id = v_lead.id AND jd.tenant_id = v_q.tenant_id
      AND jd.job_status <> 'cancelled' AND e.status <> 'cancelled'
    ORDER BY jd.created_at DESC LIMIT 1;
    IF v_engagement IS NULL THEN
      v_engagement := job_insert(
        v_q.tenant_id, v_client.person_id, v_offering,
        NULL, NULL, NULL, COALESCE(v_q.notes, v_lead.note, v_lead.interest), v_lead.id);
    END IF;

    IF v_lead.converted_account_id IS NULL THEN
      UPDATE leads SET converted_account_id = v_client.account_id, converted_at = now(), updated_at = now()
      WHERE id = v_lead.id;
      INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
      VALUES (v_q.tenant_id, NULL, 'UPDATE', 'leads', v_lead.id,
              jsonb_build_object('stage', v_lead.stage, 'converted_account_id', NULL),
              jsonb_build_object('converted_account_id', v_client.account_id, 'engagement_id', v_engagement,
                                 'offering_id', v_offering, 'client_created', v_client.created,
                                 'transition', 'quote_accepted', 'quote_id', v_q.id));
    END IF;
    UPDATE quotes SET account_id = COALESCE(account_id, v_client.account_id) WHERE id = v_q.id;
  END IF;

  INSERT INTO job_details (engagement_id, tenant_id, job_status, lead_id)
  VALUES (v_engagement, v_q.tenant_id, 'booked', v_q.lead_id)
  ON CONFLICT (engagement_id) DO UPDATE SET job_status = 'booked'
  WHERE job_details.job_status IN ('enquiry', 'booked');

  -- 5. Payment requests (Thread B): deposit now, balance on the shoot date.
  SELECT COALESCE(v_q.shoot_date, (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date)
  INTO v_shoot_date FROM engagements e WHERE e.id = v_engagement;
  v_balance_due := GREATEST(COALESCE(v_shoot_date, v_today), v_today);
  SELECT CASE WHEN language_default = 'he' THEN 'he' ELSE 'en' END INTO v_lang
  FROM tenants WHERE id = v_q.tenant_id;

  IF v_q.deposit_minor > 0 THEN
    v_requests := v_requests || jsonb_build_object(
      'label', CASE WHEN v_lang = 'he' THEN 'מקדמה' ELSE 'Deposit' END,
      'amount_minor', v_q.deposit_minor, 'due_date', v_today, 'max_installments', 1);
  END IF;
  IF v_q.balance_minor > 0 THEN
    v_requests := v_requests || jsonb_build_object(
      'label', CASE WHEN v_lang = 'he' THEN 'יתרה' ELSE 'Balance' END,
      'amount_minor', v_q.balance_minor, 'due_date', v_balance_due,
      'max_installments', v_q.balance_max_installments);
  END IF;
  IF jsonb_array_length(v_requests) > 0 THEN
    PERFORM create_shoot_payment_requests(p_engagement_id := v_engagement, p_requests := v_requests);
  END IF;

  -- 6. Settle the quote and keep the result for replay.
  v_result := jsonb_build_object(
    'ok', true, 'quote_id', v_q.id, 'engagement_id', v_engagement,
    'converted_lead', v_q.engagement_id IS NULL,
    'total_minor', v_q.total_minor, 'deposit_minor', v_q.deposit_minor,
    'balance_minor', v_q.balance_minor, 'currency', v_q.currency,
    'shoot_date', v_shoot_date, 'balance_due_date', v_balance_due,
    'payment_requests', v_requests,
    'send_contract', v_q.send_contract_on_accept);

  UPDATE quotes SET status = 'accepted', accepted_at = now(), engagement_id = v_engagement,
                    accepted_result = v_result
  WHERE id = v_q.id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_q.tenant_id, NULL, 'quote_accepted', 'quote', v_q.id, v_result);

  RETURN v_result || jsonb_build_object('already_accepted', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Automatic emails — claim/complete + due list for the cron
-- ---------------------------------------------------------------------------

-- Returns the log id when the caller may send now; NULL when already sent,
-- in flight, disabled for the tenant, or out of retries (3 attempts).
CREATE OR REPLACE FUNCTION claim_automatic_email(
  p_tenant_id UUID, p_email_key TEXT, p_quote_id UUID, p_engagement_id UUID, p_recipient_email TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_automatic_email_enabled(p_tenant_id, p_email_key) OR NULLIF(trim(p_recipient_email), '') IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO automatic_email_log (tenant_id, email_key, quote_id, engagement_id, recipient_email)
  VALUES (p_tenant_id, p_email_key, p_quote_id, p_engagement_id, trim(p_recipient_email))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Retry a failed send (stale 'pending' > 30 min counts as failed).
  UPDATE automatic_email_log SET status = 'pending', attempts = attempts + 1, updated_at = now(),
                                 recipient_email = trim(p_recipient_email)
  WHERE email_key = p_email_key
    AND ((p_quote_id IS NOT NULL AND quote_id = p_quote_id)
      OR (p_engagement_id IS NOT NULL AND engagement_id = p_engagement_id))
    AND attempts < 3
    AND (status = 'failed' OR (status = 'pending' AND updated_at < now() - interval '30 minutes'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION complete_automatic_email(
  p_log_id UUID, p_status TEXT, p_failure_reason TEXT DEFAULT NULL, p_external_msg_id TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'invalid status %', p_status USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE automatic_email_log
  SET status = p_status, failure_reason = left(p_failure_reason, 1000),
      external_msg_id = p_external_msg_id, updated_at = now()
  WHERE id = p_log_id;
END;
$$;

-- Shoots due for reminder (1–2 days ahead), thank-you (1–3 days after) or
-- gallery-ready (released in the last 7 days). Windows tolerate missed runs;
-- automatic_email_log makes each send happen once.
CREATE OR REPLACE FUNCTION list_due_shoot_emails(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
  email_key TEXT, tenant_id UUID, engagement_id UUID, recipient_email TEXT, recipient_name TEXT,
  shoot_starts_at TIMESTAMPTZ, location TEXT, gallery_url TEXT, offering_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_today DATE := (p_now AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  RETURN QUERY
  WITH shoots AS (
    SELECT e.id AS engagement_id, e.tenant_id, e.booked_starts_at,
           (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date AS shoot_day,
           jd.job_status, jd.gallery_url, jd.gallery_released_at,
           COALESCE(jd.location, o.location) AS location, o.name AS offering_name,
           COALESCE(p.email, pp.email) AS email, COALESCE(p.name, pp.name) AS name
    FROM job_details jd
    JOIN engagements e ON e.id = jd.engagement_id
    JOIN people p      ON p.id = e.person_id
    LEFT JOIN accounts a ON a.id = p.account_id
    LEFT JOIN people pp  ON pp.id = a.person_id
    LEFT JOIN offerings o ON o.id = e.offering_id
    WHERE jd.job_status <> 'cancelled' AND e.status <> 'cancelled'
  ), due AS (
    SELECT 'shoot_reminder'::text AS k, s.* FROM shoots s
    WHERE s.job_status = 'booked' AND s.shoot_day BETWEEN v_today + 1 AND v_today + 2
    UNION ALL
    SELECT 'shoot_thank_you', s.* FROM shoots s
    WHERE s.job_status IN ('booked', 'shot', 'editing', 'delivered')
      AND s.shoot_day BETWEEN v_today - 3 AND v_today - 1
    UNION ALL
    SELECT 'gallery_ready', s.* FROM shoots s
    WHERE s.gallery_released_at IS NOT NULL AND s.gallery_url IS NOT NULL
      AND s.gallery_released_at BETWEEN p_now - interval '7 days' AND p_now
  )
  SELECT d.k, d.tenant_id, d.engagement_id, d.email, d.name, d.booked_starts_at,
         d.location, d.gallery_url, d.offering_name
  FROM due d
  WHERE d.email IS NOT NULL
    AND is_automatic_email_enabled(d.tenant_id, d.k)
    AND NOT EXISTS (
      SELECT 1 FROM automatic_email_log l
      WHERE l.email_key = d.k AND l.engagement_id = d.engagement_id
        AND (l.status = 'sent' OR l.attempts >= 3))
  LIMIT 200;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants. New functions are EXECUTE-able by PUBLIC by default: revoke first.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION quote_deposit_minor(INT, INT)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION quote_recalc_totals(UUID)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION quote_assert_tenant_admin(UUID)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION quote_client_contact(UUID)                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION is_automatic_email_enabled(UUID, TEXT)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION quote_lines_json(UUID)                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION quote_job_offering_id(UUID)                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_quote(JSONB, JSONB)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mark_quote_sent(UUID, TEXT)                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_admin_quote(UUID)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION list_admin_quotes()                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_public_quote(TEXT, UUID)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION decline_public_quote(TEXT, UUID, TEXT)                FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_quote(TEXT, UUID, UUID[])                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_automatic_email(UUID, TEXT, UUID, UUID, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_automatic_email(UUID, TEXT, TEXT, TEXT)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION list_due_shoot_emails(TIMESTAMPTZ)                    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION quote_deposit_minor(INT, INT)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_quote(JSONB, JSONB)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mark_quote_sent(UUID, TEXT)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_quote(UUID)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION list_admin_quotes()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_public_quote(TEXT, UUID)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION decline_public_quote(TEXT, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION accept_quote(TEXT, UUID, UUID[])       TO service_role;
GRANT EXECUTE ON FUNCTION claim_automatic_email(UUID, TEXT, UUID, UUID, TEXT)  TO service_role;
GRANT EXECUTE ON FUNCTION complete_automatic_email(UUID, TEXT, TEXT, TEXT)     TO service_role;
GRANT EXECUTE ON FUNCTION list_due_shoot_emails(TIMESTAMPTZ)                   TO service_role;
GRANT EXECUTE ON FUNCTION is_automatic_email_enabled(UUID, TEXT)               TO service_role;
GRANT EXECUTE ON FUNCTION quote_client_contact(UUID)                           TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Cron: hourly at :07 (off the :00 pile-up)
-- ---------------------------------------------------------------------------

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command ILIKE '%/functions/v1/run-shoot-emails%';

SELECT cron.schedule(
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/run-shoot-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
