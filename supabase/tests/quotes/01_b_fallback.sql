-- Used by run.sh only when Thread B's migration is not in this checkout:
-- the columns accept_quote() writes, with B's constraints on them.
CREATE TABLE job_payment_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  engagement_id    UUID        NOT NULL REFERENCES engagements(id),
  label            TEXT        NOT NULL CHECK (char_length(trim(label)) > 0),
  amount_minor     INT         NOT NULL CHECK (amount_minor > 0),
  currency         TEXT        NOT NULL DEFAULT 'ILS',
  due_date         DATE,
  status           TEXT        NOT NULL DEFAULT 'pending',
  max_installments INT         NOT NULL DEFAULT 1 CHECK (max_installments BETWEEN 1 AND 36),
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON job_payment_requests TO service_role;
