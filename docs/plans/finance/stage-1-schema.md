# Stage 1 — Schema Consolidation (Single Reset, Then Frozen)

> **Depends on:** nothing. First stage.
> **Method:** Edit existing numbered migration files in place, add finance tables, apply all
> vendor renames — one batch — then reset once and regenerate types. No shims.
> **Union of schema needs for all nine stages.** After reset, schema is **frozen**.

## Objective

Produce the final vendor-agnostic finance data model:
- Remove all `stripe_*` naming (payment layer).
- Remove all `gi_*` naming (invoicing layer).
- Decouple `billing_accounts` to the household-level billing home.
- Add invoicing credentials, token cache, document queue, cards, schedules, actors.
- **Drop internal invoice sequencing** — legal numbers come from the invoicing provider only.

## Cross-stage schema map

| Change | Needed by |
| --- | --- |
| `payment_provider_*` + `payment_provider` (TEXT, no CHECK enum) | Stage 3, 8 |
| `invoicing_provider` + `invoicing_*` credential columns + RPCs | Stage 2, 8 |
| `invoicing_auth_*` on tenants | Stage 9 |
| `billing_accounts.account_id` + nullable `person_id` + RLS | Stage 6, 8 |
| `billing_accounts.business_tax_id` / `business_name` | Stage 2 (optional buyer B2B) |
| `payments.provider` / `provider_payment_ref` / `payment_method` | Stage 3–5 |
| `payments.created_by` / `approved_by` / `billing_account_id` | Stage 4–7 |
| `payments.external_document_id` / `external_document_number` / `invoice_url` | Stage 2 |
| Drop `invoice_sequences` + `next_invoice_number()` | Stage 2 decision (locked) |
| `payments.refunds_payment_id` + `partially_refunded` + refund sign CHECK | Stage 7 |
| `engagements.provider_customer_ref` | Stage 3, 6 |
| `payment_method_tokens`, `billing_schedules` (+ `next_attempt_at`) | Stage 6, 8 |
| `invoicing_token_cache`, `document_queue` (no payload column; `processing_started_at`) | Stage 2, 9 |
| `get_billing_account_payment_method()` RPC (full auth body) | Stage 8 |
| `guest_enrolment_create_engagement` → `billing_accounts.account_id` | Stage 4 |

## Files to edit

### 1. `20260608000200_core_tenants.sql` — tenants

Replace Stripe block with:
```sql
-- Payment capture (money movement). Slug validated in app/Zod — no Postgres CHECK enum.
payment_provider              TEXT        NOT NULL DEFAULT 'stripe',
payment_provider_public_key   TEXT,
payment_provider_secret_enc   BYTEA,
payment_provider_webhook_enc  BYTEA,
payment_provider_account_id   TEXT,
payment_provider_updated_at   TIMESTAMPTZ,
-- Invoicing / tax documents (separate from payment capture)
invoicing_provider            TEXT        NOT NULL DEFAULT 'green_invoice',
invoicing_account_id          TEXT,
invoicing_api_key_enc         BYTEA,
invoicing_secret_enc          BYTEA,
invoicing_credentials_updated_at TIMESTAMPTZ,
invoicing_auth_valid_until    TIMESTAMPTZ,
invoicing_auth_checked_at     TIMESTAMPTZ,
billing_policy                JSONB       NOT NULL DEFAULT '{}'::jsonb,
```

Update comments: `stripe_secret_key_enc` → `payment_provider_secret_enc`; `stripe-webhook` →
`handle-payment-event`.

> Document language = `tenants.language_default`. Provisioning maps `tenants.country` → default
> slug in app code (`IL` → `green_invoice`). Registry lives in `_shared/invoicing/index.ts`.

### 2. `20260608000500_offerings.sql`

Delete `stripe_product_id`, `stripe_price_id`.

### 3. `20260608001100_billing_accounts.sql`

Replace table definition:
```sql
CREATE TABLE billing_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  account_id      UUID        REFERENCES accounts(id),
  person_id       UUID        REFERENCES people(id),
  business_tax_id TEXT,        -- optional BUYER tax id (B2B)
  business_name   TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_account_owner CHECK (account_id IS NOT NULL OR person_id IS NOT NULL)
);
CREATE INDEX idx_billing_accounts_tenant  ON billing_accounts(tenant_id);
CREATE INDEX idx_billing_accounts_account ON billing_accounts(account_id);
CREATE INDEX idx_billing_accounts_status  ON billing_accounts(status);

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_accounts_super_admin ON billing_accounts FOR ALL
  USING (is_super_admin());
CREATE POLICY billing_accounts_admin ON billing_accounts FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY billing_accounts_household_select ON billing_accounts FOR SELECT
  USING (tenant_id = get_my_tenant_id()
         AND (account_id IN (SELECT get_my_account_ids())
              OR person_id = get_my_person_id()));
```

Remove `payment_method` column from the old definition.

### 4. `20260608001300_engagements.sql`

- Drop `stripe_subscription_id`.
- Rename `stripe_customer_id` → `provider_customer_ref`.
- Keep existing `billing_account_id` FK (already present — wire in payment inserts, Stage 4).
- Add `billing_status` comment:
```sql
COMMENT ON COLUMN engagements.billing_status IS
  'Managed exclusively by the billing engine (Stage 6). Source of truth for financial standing is payments + billing_schedules; this is a denormalised convenience flag.';
```

### 5. `20260608001600_finance.sql` — payments, RPCs, new tables

**`payments` changes:**
- `provider TEXT NOT NULL DEFAULT 'stripe'` — no CHECK enum; validate in app (`stripe` | `manual` | `mock`).
- Rename `stripe_payment_intent_id` → `provider_payment_ref TEXT UNIQUE`.
- Drop `stripe_invoice_id`.
- Add `payment_method TEXT CHECK (payment_method IN ('card','cash','bank_transfer','other'))`.
- Add `billing_account_id UUID REFERENCES billing_accounts(id)`.
- Add `created_by UUID REFERENCES user_profiles(id)`, `approved_by UUID REFERENCES user_profiles(id)`.
- Add `external_document_id TEXT`, `external_document_number TEXT`.
- Keep `invoice_url`, `invoice_issued_at` (populated by invoicing provider).
- Add `refunds_payment_id UUID REFERENCES payments(id)`.
- Extend status CHECK: `'partially_refunded'`.
- Add refund sign constraint:
```sql
CONSTRAINT payment_refund_amount_sign CHECK (
  charge_type <> 'refund' OR total_amount_minor <= 0
)
```
- Index: `CREATE INDEX idx_payments_billing_account ON payments(billing_account_id);`

**Remove internal invoice sequencing (locked decision):**
- Delete `invoice_sequences` table.
- Delete `next_invoice_number()` function and its GRANTs.
- Remove `payments.invoice_number` column if present (legal number → `external_document_number` only).
- Update `20260608002500_grants.sql`: remove `invoice_sequences` from grants list.
- Update `stripe-webhook` / future `handle-payment-event`: do **not** call `next_invoice_number()`.

**Payment RPC renames:**
- `get_tenant_payment_credentials` / `save_tenant_payment_credentials`.

**Invoicing RPCs:**
- `get_tenant_invoicing_credentials(p_tenant_id UUID)` — service_role.
- `save_tenant_invoicing_credentials(p_account_id, p_api_key, p_secret)` — tenant_admin.

**Safe card display RPC (Stage 8 UI; define here):**
```sql
CREATE OR REPLACE FUNCTION get_billing_account_payment_method(p_billing_account_id UUID)
RETURNS TABLE (card_brand TEXT, last4 TEXT, exp_month INT, exp_year INT, is_default BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id  UUID;
  v_account_id UUID;
  v_person_id  UUID;
BEGIN
  SELECT ba.tenant_id, ba.account_id, ba.person_id
    INTO v_tenant_id, v_account_id, v_person_id
  FROM billing_accounts ba
  WHERE ba.id = p_billing_account_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Authorize: super_admin, tenant_admin of same tenant, or household member of billing account.
  IF NOT (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND tenant_id = v_tenant_id
        AND 'tenant_admin' = ANY(role)
    )
    OR (
      v_tenant_id = get_my_tenant_id()
      AND (
        (v_account_id IS NOT NULL AND v_account_id IN (SELECT get_my_account_ids()))
        OR (v_person_id IS NOT NULL AND v_person_id = get_my_person_id())
      )
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pmt.card_brand, pmt.last4, pmt.exp_month, pmt.exp_year, pmt.is_default
  FROM payment_method_tokens pmt
  WHERE pmt.billing_account_id = p_billing_account_id
    AND pmt.revoked_at IS NULL
    AND pmt.is_default = true
  LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION get_billing_account_payment_method(UUID) TO authenticated;
```

**New tables:**

```sql
CREATE TABLE payment_method_tokens (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  billing_account_id  UUID        NOT NULL REFERENCES billing_accounts(id),
  provider            TEXT        NOT NULL,  -- slug: stripe | mock; validated in app
  provider_token      TEXT        NOT NULL,
  card_brand          TEXT,
  last4               TEXT,
  exp_month           INT         CHECK (exp_month BETWEEN 1 AND 12),
  exp_year            INT,
  is_default          BOOLEAN     NOT NULL DEFAULT false,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pmt_tenant  ON payment_method_tokens(tenant_id);
CREATE INDEX idx_pmt_account ON payment_method_tokens(billing_account_id);
CREATE UNIQUE INDEX idx_pmt_one_default ON payment_method_tokens(billing_account_id)
  WHERE is_default AND revoked_at IS NULL;

CREATE TABLE billing_schedules (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id),
  engagement_id            UUID        NOT NULL UNIQUE REFERENCES engagements(id),
  billing_account_id       UUID        REFERENCES billing_accounts(id),
  payment_method_token_id  UUID        REFERENCES payment_method_tokens(id) ON DELETE SET NULL,
  next_billing_date        DATE        NOT NULL,   -- calendar billing period (1st of month)
  next_attempt_at          TIMESTAMPTZ,            -- dunning retry time; NULL = bill on next_billing_date
  last_attempt_at          TIMESTAMPTZ,
  last_error               TEXT,
  attempt_count            INT         NOT NULL DEFAULT 0,
  status                   TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','paused','suspended','cancelled')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_billing_schedules_tenant ON billing_schedules(tenant_id);
CREATE INDEX idx_billing_schedules_due ON billing_schedules(status, next_billing_date, next_attempt_at)
  WHERE status = 'active';

CREATE TABLE invoicing_token_cache (
  tenant_id   UUID        PRIMARY KEY REFERENCES tenants(id),
  token       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Lean queue: no payload JSONB — worker builds canonical input from live rows at process time.
CREATE TABLE document_queue (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id),
  payment_id     UUID        NOT NULL REFERENCES payments(id),
  document_kind  TEXT        NOT NULL CHECK (document_kind IN ('sale','refund')),
  attempts       INT         NOT NULL DEFAULT 0,
  last_error     TEXT,
  scheduled_for  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ,   -- set when status → processing; stale sweep uses this
  succeeded_at   TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','succeeded','dead')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_queue_due ON document_queue(scheduled_for)
  WHERE status = 'pending';
-- One active issuance job per payment + kind (idempotency).
CREATE UNIQUE INDEX idx_document_queue_one_active ON document_queue(payment_id, document_kind)
  WHERE status IN ('pending', 'processing');
```

### 6. `20260608002100_guest_enrolment_rpcs.sql` — billing account household wiring

Update `guest_enrolment_create_engagement` so billing accounts attach to the **payer household**
(`account_id`), not only `person_id`:

```sql
DECLARE
  ...
  v_payer_account_id   UUID;
BEGIN
  ...
  SELECT account_id INTO v_payer_account_id
  FROM people
  WHERE id = v_payer_person_id;

  -- Prefer household-level billing account (account_id)
  IF v_payer_account_id IS NOT NULL THEN
    SELECT id INTO v_billing_account_id
    FROM billing_accounts
    WHERE tenant_id = v_tenant_id
      AND account_id = v_payer_account_id
      AND status = 'active'
    LIMIT 1;
  END IF;

  -- Fallback: legacy person_id-only row (pre-migration or edge cases)
  IF v_billing_account_id IS NULL THEN
    SELECT id INTO v_billing_account_id
    FROM billing_accounts
    WHERE tenant_id = v_tenant_id
      AND person_id = v_payer_person_id
      AND status = 'active'
    LIMIT 1;
  END IF;

  IF v_billing_account_id IS NULL THEN
    INSERT INTO billing_accounts (tenant_id, account_id, person_id, status)
    VALUES (v_tenant_id, v_payer_account_id, v_payer_person_id, 'active')
    RETURNING id INTO v_billing_account_id;
  END IF;
  ...
END;
```

> Admin-created billing accounts via the web app must also supply `account_id` when creating
> rows (Stage 8 / shared schema validation).

### 7. RLS

```sql
ALTER TABLE payment_method_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_schedules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoicing_token_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_queue        ENABLE ROW LEVEL SECURITY;

CREATE POLICY pmt_super_admin ON payment_method_tokens FOR ALL USING (is_super_admin());
CREATE POLICY pmt_admin_all ON payment_method_tokens FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
-- No client SELECT on payment_method_tokens — use get_billing_account_payment_method() RPC.

CREATE POLICY billing_schedules_super_admin ON billing_schedules FOR ALL USING (is_super_admin());
CREATE POLICY billing_schedules_admin ON billing_schedules FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

REVOKE ALL ON invoicing_token_cache FROM anon;
REVOKE ALL ON invoicing_token_cache FROM authenticated;
CREATE POLICY invoicing_token_cache_super_admin ON invoicing_token_cache FOR ALL
  USING (is_super_admin());

CREATE POLICY document_queue_super_admin ON document_queue FOR ALL USING (is_super_admin());
CREATE POLICY document_queue_admin_select ON document_queue FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
```

## Code registry (not schema)

Define allowed provider slugs in TypeScript (Zod), e.g. `_shared/payments/registry.ts` and
`_shared/invoicing/registry.ts`:
```ts
export const PAYMENT_PROVIDER_SLUGS = ['stripe', 'mock'] as const;
export const INVOICING_PROVIDER_SLUGS = ['green_invoice', 'mock'] as const;
```
Adding `xero` = new adapter file + registry entry only.

## Reset & regenerate (linked remote dev)

Supabase **local is not used** on this project.

1. Apply all migration edits (including `20260608002500_grants.sql`).
2. **You:** run `supabase/reset_dev_db.sql` in Supabase SQL Editor (dev project only).
3. **Agent (after you confirm reset done):** `pnpm db:sync`.
4. **You:** `pnpm seed:auth-parent` (if needed) → `pnpm seed:dev -- --finance`.
5. Verify greps in Definition of Done below.
6. **Schema frozen.**

See [AGENT-RUNBOOK.md](AGENT-RUNBOOK.md) for agent gates.

## Definition of Done

- [ ] Reset clean; re-run idempotent.
- [ ] `grep -ri "stripe_" supabase/migrations/` → nothing.
- [ ] No table/column named with `gi_` prefix; no `invoice_sequences` / `next_invoice_number`.
- [ ] `tenants.invoicing_provider` + `payment_provider` exist as TEXT (no CHECK enum).
- [ ] `document_queue` has no `payload` column; `processing_started_at` present; unique active index present.
- [ ] `billing_schedules.next_attempt_at` exists.
- [ ] `billing_accounts` household RLS policy present.
- [ ] `get_billing_account_payment_method` RPC: auth enforced; display fields only; unauthorized → empty.
- [ ] `guest_enrolment_create_engagement` sets `billing_accounts.account_id` from payer household.
- [ ] Payment + invoicing credential RPC round-trips verified.
- [ ] Committed.

## Test cases

1. Reset idempotency.
2. Default-instrument unique index (with `revoked_at`).
3. `billing_account_owner` CHECK.
4. Payment + invoicing credential round-trips.
5. RLS: anon cannot read `invoicing_token_cache`.
6. `document_queue`: second insert same `(payment_id, document_kind)` while pending → unique violation.
7. Refund row with positive `total_amount_minor` → CHECK violation.
8. `get_billing_account_payment_method`: household member sees last4; admin OK; stranger gets empty; token column unreachable from client.
9. `guest_enrolment_create_engagement`: new billing account has `account_id` matching payer household.

## Open items (minor — no schema change expected)

- OAuth providers may need extra fields in `invoicing_token_cache` later (`metadata JSONB`).
- Retention: delete old `succeeded` queue rows (Stage 9), not payload redaction.
