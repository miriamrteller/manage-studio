-- =============================================================================
-- 23 Nov 2026 (owner): "the payment options should be everywhere, also for my ballet school".
--
-- The ways a client may pay the studio directly (Bit with the studio's Bit phone, bank
-- transfer with its details, cash, cheque) were saved on tenant_photo_shop_settings
-- (20261122213217) and the settings card showed only with the photo shop switched on.
-- They are now the studio's own, for every checkout: class and booking enrolments,
-- class cards, shop orders, deposits / balances on /pay links, and photo orders.
--
-- tenant_pay_ways (one row per studio, written by studio admins on
-- Settings > Online payments): the same columns as before. Existing photo-shop values are
-- copied across once. The old tenant_photo_shop_settings columns are no longer read or
-- written (kept only so a rollback of the app still finds them; drop in a later migration).
--
-- client_payment_proofs: what a client picked on a payment page and, for Bit / bank
-- transfer, the screenshot of the payment (reminders at 1, 3 and 7 days, as photo orders). One row per payment request (/pay/:token) or
-- per enrolment (engagement) waiting for payment. Asked for, never required: nothing reads
-- it to stop, hold or cancel anything. Only the service role writes (client-pay-direct);
-- studio admins read their own studio's rows.
--
-- Storage bucket 'payment-proofs' (private, images only, 5 MB):
--   <tenant_id>/<proof_id>/<uuid>.<ext>. Studio admins read their own studio's folder.
--
-- ADDITIVE. DEPENDENCIES: 20261122213217_photo_shop_pay_direct_details.sql,
--                         20261030000200_job_payment_requests.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_pay_ways (
  tenant_id           UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  accepts_bit         BOOLEAN     NOT NULL DEFAULT false,
  bit_phone           TEXT,
  accepts_bank        BOOLEAN     NOT NULL DEFAULT false,
  bank_details        TEXT,
  accepts_cash        BOOLEAN     NOT NULL DEFAULT false,
  cash_instructions   TEXT,
  accepts_cheque      BOOLEAN     NOT NULL DEFAULT false,
  cheque_instructions TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_pay_ways_bit_phone_check
    CHECK (bit_phone IS NULL OR (char_length(bit_phone) <= 30 AND bit_phone ~ '^[0-9+() -]*$')),
  CONSTRAINT tenant_pay_ways_text_check
    CHECK (COALESCE(char_length(bank_details), 0) <= 500
       AND COALESCE(char_length(cash_instructions), 0) <= 500
       AND COALESCE(char_length(cheque_instructions), 0) <= 500)
);

COMMENT ON TABLE tenant_pay_ways IS
  'How clients may pay the studio directly (Bit, bank transfer, cash, cheque), for every checkout. Settings > Online payments. Wording only: never stops a payment.';

DROP TRIGGER IF EXISTS trigger_tenant_pay_ways_updated_at ON tenant_pay_ways;
CREATE TRIGGER trigger_tenant_pay_ways_updated_at
  BEFORE UPDATE ON tenant_pay_ways
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE tenant_pay_ways ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_pay_ways_super_admin ON tenant_pay_ways;
CREATE POLICY tenant_pay_ways_super_admin ON tenant_pay_ways FOR ALL USING (is_super_admin());
DROP POLICY IF EXISTS tenant_pay_ways_admin_manage ON tenant_pay_ways;
CREATE POLICY tenant_pay_ways_admin_manage ON tenant_pay_ways FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
GRANT SELECT, INSERT, UPDATE ON TABLE tenant_pay_ways TO authenticated;

-- Copy what studios already set in the photo shop (once; never overwrites newer values).
INSERT INTO tenant_pay_ways (tenant_id, accepts_bit, bit_phone, accepts_bank, bank_details,
                             accepts_cash, cash_instructions, accepts_cheque, cheque_instructions)
SELECT tenant_id, accepts_bit, bit_phone, accepts_bank, bank_details,
       accepts_cash, cash_instructions, accepts_cheque, cheque_instructions
FROM tenant_photo_shop_settings
WHERE accepts_bit OR accepts_bank OR accepts_cash OR accepts_cheque
   OR bit_phone IS NOT NULL OR bank_details IS NOT NULL
   OR cash_instructions IS NOT NULL OR cheque_instructions IS NOT NULL
ON CONFLICT (tenant_id) DO NOTHING;

COMMENT ON COLUMN tenant_photo_shop_settings.accepts_bit IS
  'SUPERSEDED 23 Nov 2026 by tenant_pay_ways (not read or written). Drop in a later migration.';
COMMENT ON COLUMN tenant_photo_shop_settings.accepts_bank IS
  'SUPERSEDED 23 Nov 2026 by tenant_pay_ways (not read or written). Drop in a later migration.';
COMMENT ON COLUMN tenant_photo_shop_settings.accepts_cash IS
  'SUPERSEDED 23 Nov 2026 by tenant_pay_ways (not read or written). Drop in a later migration.';
COMMENT ON COLUMN tenant_photo_shop_settings.accepts_cheque IS
  'SUPERSEDED 23 Nov 2026 by tenant_pay_ways (not read or written). Drop in a later migration.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_payment_proofs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_request_id UUID        REFERENCES job_payment_requests(id) ON DELETE CASCADE,
  engagement_id      UUID        REFERENCES engagements(id) ON DELETE CASCADE,
  pay_method         TEXT        CHECK (pay_method IS NULL OR pay_method IN ('bit', 'bank', 'cash', 'cheque')),
  proof_path         TEXT,
  proof_sent_at      TIMESTAMPTZ,
  -- Bit / bank transfer were on offer when the client opened the payment page: a screenshot
  -- is asked for, and reminder emails follow at 1, 3 and 7 days (owner, 23 Nov 2026) until
  -- one arrives, the client picks cash / cheque, or the studio records the payment.
  proof_requested      BOOLEAN     NOT NULL DEFAULT false,
  proof_reminders_sent INT         NOT NULL DEFAULT 0 CHECK (proof_reminders_sent BETWEEN 0 AND 10),
  proof_reminded_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_payment_proofs_one_subject
    CHECK ((payment_request_id IS NULL) <> (engagement_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS client_payment_proofs_request_key
  ON client_payment_proofs (payment_request_id) WHERE payment_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS client_payment_proofs_engagement_key
  ON client_payment_proofs (engagement_id) WHERE engagement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_payment_proofs_tenant_sent
  ON client_payment_proofs (tenant_id, proof_sent_at DESC);
-- The reminder job (expire-scheduling-holds) looks for these.
CREATE INDEX IF NOT EXISTS client_payment_proofs_reminder_due
  ON client_payment_proofs (created_at)
  WHERE proof_requested AND proof_path IS NULL;

COMMENT ON TABLE client_payment_proofs IS
  'A client''s chosen way to pay the studio directly and (Bit / bank transfer) the payment screenshot, per /pay request or enrolment. Never blocks anything.';

DROP TRIGGER IF EXISTS trigger_client_payment_proofs_updated_at ON client_payment_proofs;
CREATE TRIGGER trigger_client_payment_proofs_updated_at
  BEFORE UPDATE ON client_payment_proofs
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE client_payment_proofs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_payment_proofs_super_admin ON client_payment_proofs;
CREATE POLICY client_payment_proofs_super_admin ON client_payment_proofs FOR SELECT USING (is_super_admin());
DROP POLICY IF EXISTS client_payment_proofs_admin_read ON client_payment_proofs;
CREATE POLICY client_payment_proofs_admin_read ON client_payment_proofs FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(role)));
GRANT SELECT ON TABLE client_payment_proofs TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Studio admins read client payment screenshots" ON storage.objects;
CREATE POLICY "Studio admins read client payment screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (SELECT 1 FROM public.user_profiles up
                WHERE up.id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(up.role))
  );
