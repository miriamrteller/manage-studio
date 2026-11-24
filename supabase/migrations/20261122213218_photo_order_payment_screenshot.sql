-- =============================================================================
-- 22 Nov 2026 (owner): a client who pays the studio by Bit or bank transfer sends a
-- screenshot of the payment in OpalSwift. It is saved on the order, the studio is
-- emailed, and the studio's orders show "Payment screenshot sent" with the picture.
-- The screenshot is asked for, never required: the order is never blocked or
-- cancelled without one. Instead the client gets reminder emails (1, 3 and 7 days
-- after ordering) until a screenshot arrives or the studio records the payment.
--
-- The client sends the order from the gallery, then a separate payment page shows the
-- ways the studio switched on; the client picks one, pays and (Bit / bank transfer) sends
-- the screenshot there (owner, 22 Nov 2026).
--
-- job_photo_orders:
--   proof_requested       the studio had Bit / bank transfer details when the order was
--                         sent: a screenshot is asked for and reminders follow.
--   pay_method            'bit' | 'bank' | 'cash' | 'cheque': what the client picked on the
--                         payment page. Cash / cheque need no screenshot (no reminders).
--   proof_path            the screenshot in the private bucket below (NULL = none yet).
--   proof_sent_at         when it was sent.
--   proof_reminders_sent  how many reminder emails went (0..3).
--   proof_reminded_at     when the last one went.
-- Only the service role writes these (client-photo-shop, expire-scheduling-holds).
--
-- Storage bucket 'photo-order-proofs' (private, images only, 5 MB):
--   <tenant_id>/<order_id>/<uuid>.<ext>. Studio admins may read their own studio's
--   folder (signed URLs); nobody else. Uploads go through client-photo-shop only.
--
-- ADDITIVE. DEPENDENCIES: 20261104171055_photo_shop.sql
-- =============================================================================

ALTER TABLE job_photo_orders
  ADD COLUMN IF NOT EXISTS proof_requested      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pay_method           TEXT,
  ADD COLUMN IF NOT EXISTS proof_path           TEXT,
  ADD COLUMN IF NOT EXISTS proof_sent_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_reminders_sent INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proof_reminded_at    TIMESTAMPTZ;

ALTER TABLE job_photo_orders
  DROP CONSTRAINT IF EXISTS job_photo_orders_pay_method_check,
  ADD CONSTRAINT job_photo_orders_pay_method_check CHECK (pay_method IS NULL OR pay_method IN ('bit', 'bank', 'cash', 'cheque')),
  DROP CONSTRAINT IF EXISTS job_photo_orders_proof_reminders_check,
  ADD CONSTRAINT job_photo_orders_proof_reminders_check CHECK (proof_reminders_sent BETWEEN 0 AND 10);

COMMENT ON COLUMN job_photo_orders.proof_requested IS
  'Paid to the studio directly while it had Bit / bank transfer details: a payment screenshot is asked for (reminders follow).';
COMMENT ON COLUMN job_photo_orders.pay_method IS
  'What the client picked on the payment page: bit, bank (transfer), cash or cheque. NULL: not picked yet.';
COMMENT ON COLUMN job_photo_orders.proof_path IS
  'The client''s payment screenshot in storage bucket photo-order-proofs. NULL: none sent yet. Never blocks the order.';
COMMENT ON COLUMN job_photo_orders.proof_reminders_sent IS
  'Reminder emails sent asking for the payment screenshot (expire-scheduling-holds, at 1, 3 and 7 days).';

-- The hourly reminder job looks for these.
CREATE INDEX IF NOT EXISTS idx_job_photo_orders_proof_due
  ON job_photo_orders (created_at)
  WHERE status = 'awaiting_payment' AND proof_requested AND proof_path IS NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('photo-order-proofs', 'photo-order-proofs', false, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Studio admins read their payment screenshots" ON storage.objects;
CREATE POLICY "Studio admins read their payment screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photo-order-proofs'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (SELECT 1 FROM public.user_profiles up
                WHERE up.id = (SELECT auth.uid()) AND 'tenant_admin' = ANY(up.role))
  );
