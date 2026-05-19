-- =============================================================================
-- Payments, invoice sequences, Stripe credential RPCs
-- DEPENDS ON: 001 tenants, 002 families/people, 026 enrolments
-- Encryption: pgp_sym_encrypt + app.encryption_key (set via manual runbook)
-- Inserts to payments: Edge webhook via service_role only (no user INSERT policy)
-- =============================================================================

CREATE TABLE payments (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID        NOT NULL REFERENCES tenants(id),
  family_id                  UUID        REFERENCES families(id),
  person_id                  UUID        REFERENCES people(id),
  enrolment_id               UUID        REFERENCES enrolments(id),
  stripe_payment_intent_id   TEXT        UNIQUE,
  stripe_invoice_id          TEXT,
  pretax_amount_minor        INT         NOT NULL,
  vat_rate                   NUMERIC(5,4) NOT NULL DEFAULT 0,
  vat_amount_minor           INT         NOT NULL DEFAULT 0,
  total_amount_minor         INT         NOT NULL,
  currency                   TEXT        NOT NULL DEFAULT 'ILS',
  invoice_number             TEXT,
  invoice_issued_at          TIMESTAMPTZ,
  invoice_url                TEXT,
  status                     TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','succeeded','failed','refunded','disputed')),
  description                TEXT,
  paid_at                    TIMESTAMPTZ,
  refunded_at                TIMESTAMPTZ,
  refund_amount_minor        INT,
  anonymised_at              TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_payer CHECK ((family_id IS NOT NULL) OR (person_id IS NOT NULL)),
  CONSTRAINT payments_invoice_unique_per_tenant UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_enrolment ON payments(enrolment_id);

CREATE TABLE invoice_sequences (
  tenant_id      UUID    PRIMARY KEY REFERENCES tenants(id),
  last_number    INT     NOT NULL DEFAULT 0,
  prefix         TEXT    NOT NULL DEFAULT 'INV',
  year_prefix    BOOLEAN NOT NULL DEFAULT true,
  current_year   TEXT    NOT NULL DEFAULT EXTRACT(YEAR FROM now())::TEXT
);

CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq           RECORD;
  new_number    INT;
  invoice_num   TEXT;
  this_year     TEXT;
BEGIN
  this_year := EXTRACT(YEAR FROM now())::TEXT;

  SELECT * INTO seq
  FROM invoice_sequences
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO invoice_sequences (tenant_id, last_number, current_year)
    VALUES (p_tenant_id, 1, this_year)
    RETURNING * INTO seq;
    new_number := 1;
  ELSIF seq.current_year <> this_year THEN
    UPDATE invoice_sequences
    SET last_number = 1,
        current_year = this_year
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO seq;
    new_number := 1;
  ELSE
    UPDATE invoice_sequences
    SET last_number = last_number + 1
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO seq;
    new_number := seq.last_number;
  END IF;

  IF seq.year_prefix THEN
    invoice_num := seq.prefix || '-' || this_year || '-' || LPAD(new_number::TEXT, 4, '0');
  ELSE
    invoice_num := seq.prefix || '-' || LPAD(new_number::TEXT, 6, '0');
  END IF;

  RETURN invoice_num;
END;
$$;

CREATE OR REPLACE FUNCTION is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role',
    false
  );
$$;

CREATE OR REPLACE FUNCTION get_tenant_stripe_credentials(p_tenant_id UUID)
RETURNS TABLE (
  stripe_publishable_key TEXT,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_stripe_credentials: service_role only';
  END IF;

  enc_key := current_setting('app.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not configured';
  END IF;

  RETURN QUERY
  SELECT
    t.stripe_publishable_key,
    CASE
      WHEN t.stripe_secret_key_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.stripe_secret_key_enc, enc_key)
      ELSE NULL
    END,
    CASE
      WHEN t.stripe_webhook_secret_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.stripe_webhook_secret_enc, enc_key)
      ELSE NULL
    END
  FROM tenants t
  WHERE t.id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_stripe_credentials(
  p_publishable_key TEXT,
  p_secret_key TEXT,
  p_webhook_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enc_key TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;

  enc_key := current_setting('app.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not configured';
  END IF;

  UPDATE tenants
  SET
    stripe_publishable_key = NULLIF(trim(p_publishable_key), ''),
    stripe_secret_key_enc = CASE
      WHEN p_secret_key IS NOT NULL AND trim(p_secret_key) <> ''
      THEN pgp_sym_encrypt(trim(p_secret_key), enc_key)
      ELSE stripe_secret_key_enc
    END,
    stripe_webhook_secret_enc = CASE
      WHEN p_webhook_secret IS NOT NULL AND trim(p_webhook_secret) <> ''
      THEN pgp_sym_encrypt(trim(p_webhook_secret), enc_key)
      ELSE stripe_webhook_secret_enc
    END,
    stripe_credentials_updated_at = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_stripe_credentials(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_stripe_credentials(UUID) TO service_role;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_admin_all ON payments
  FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY payments_parent_select ON payments
  FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      person_id IN (SELECT id FROM people WHERE user_profile_id = auth.uid())
      OR family_id IN (
        SELECT family_id FROM family_members WHERE user_profile_id = auth.uid()
      )
    )
  );

CREATE POLICY invoice_sequences_admin ON invoice_sequences
  FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

REVOKE ALL ON FUNCTION next_invoice_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_invoice_number(UUID) TO service_role;
