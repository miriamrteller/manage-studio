-- =============================================================================
-- 20261030000200: Job payment requests (deposit / balance) + gated gallery link
--
-- Photographer beta (Thread B). A "job" is an engagements row; Thread A owns
-- job_details (20261030000100_job_details.sql) with gallery_url /
-- gallery_released_at. This file owns:
--
--   * job_payment_requests — one row per amount the studio asks the client to
--     pay (מקדמה / יתרה). Each request has its own public pay link token and
--     is settled by exactly one succeeded payments row (payment_id), issued as
--     a bundled חשבונית מס קבלה by the payment provider (YPay docType 109).
--   * payments.job_payment_request_id — pending/failed/succeeded charges that
--     were created for a request. Several pending charges may point at one
--     request (client reopened the link); only one may settle it.
--   * create_job_payment_requests RPC — called by Thread C from an accepted
--     quote and by the admin JobPaymentsPanel.
--   * Gallery gating — clients never read job_details.gallery_url directly:
--     get_client_job_gallery() returns it only when released (admin override)
--     or when every non-cancelled request is paid.
--   * Daily cron for balance reminders (run-job-payment-reminders).
--
-- ADDITIVE MIGRATION (SPEC §2.5.3): new file only, no base-chain edits.
-- DEPENDENCIES: 000200 (tenants, RLS helpers), 000300 (people), 001300
-- (engagements), 001600 (payments), 002800 (cron helpers). job_details is
-- referenced at runtime only (plpgsql), so this file also applies cleanly on a
-- DB where 20261030000100 has not been pushed yet.
-- =============================================================================

CREATE TABLE job_payment_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  engagement_id           UUID        NOT NULL REFERENCES engagements(id),
  -- Free text shown to the client and on the tax document line ('מקדמה', 'יתרה').
  label                   TEXT        NOT NULL CHECK (char_length(trim(label)) > 0),
  amount_minor            INT         NOT NULL CHECK (amount_minor > 0),
  currency                TEXT        NOT NULL DEFAULT 'ILS',
  due_date                DATE,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sent', 'paid', 'cancelled', 'refunded_manual')),
  -- The ONE succeeded payment that settled this request.
  payment_id              UUID        REFERENCES payments(id),
  sent_at                 TIMESTAMPTZ,
  paid_at                 TIMESTAMPTZ,
  -- YPay "תשלומים": maximum card installments offered on the hosted page (1 = none).
  max_installments        INT         NOT NULL DEFAULT 1 CHECK (max_installments BETWEEN 1 AND 36),
  -- Unguessable token for the public /pay/:token page. Never exposed to other clients.
  public_token            TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  -- Part 2: automatic reminders (idempotency stamps; notification_log holds the send).
  due_reminder_sent_at    TIMESTAMPTZ,
  overdue_reminder_sent_at TIMESTAMPTZ,
  -- Manual refund bookkeeping (YPay has no refund API — refunds are recorded by a human).
  refunded_at             TIMESTAMPTZ,
  refund_note             TEXT,
  created_by              UUID        REFERENCES user_profiles(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_payment_requests_paid_pair CHECK (
    status NOT IN ('paid', 'refunded_manual') OR (payment_id IS NOT NULL AND paid_at IS NOT NULL)
  ),
  CONSTRAINT job_payment_requests_refund_pair CHECK (
    status <> 'refunded_manual' OR refunded_at IS NOT NULL
  )
);

COMMENT ON TABLE job_payment_requests IS
  'Deposit / balance amounts a studio asks a job (engagement) client to pay. One succeeded payment per request; the tax document is issued bundled by the payment provider.';
COMMENT ON COLUMN job_payment_requests.public_token IS
  'Capability token for the public pay page (/pay/:token). Treat as a secret; rotate by cancelling + recreating the request.';
COMMENT ON COLUMN job_payment_requests.max_installments IS
  'YPay תשלומים: max card installments offered to the client on the hosted page.';

CREATE INDEX idx_job_payment_requests_tenant      ON job_payment_requests(tenant_id);
CREATE INDEX idx_job_payment_requests_engagement  ON job_payment_requests(engagement_id);
CREATE INDEX idx_job_payment_requests_due_open    ON job_payment_requests(due_date)
  WHERE status IN ('pending', 'sent');
CREATE UNIQUE INDEX idx_job_payment_requests_payment ON job_payment_requests(payment_id)
  WHERE payment_id IS NOT NULL;

-- A charge (pending → succeeded/failed) created for a request. Many-to-one on
-- purpose: the client may open the link more than once; the request's
-- payment_id names the single payment that settled it.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS job_payment_request_id UUID REFERENCES job_payment_requests(id);
CREATE INDEX IF NOT EXISTS idx_payments_job_payment_request ON payments(job_payment_request_id)
  WHERE job_payment_request_id IS NOT NULL;
COMMENT ON COLUMN payments.job_payment_request_id IS
  'Job payment request this charge was created for (photographer deposit/balance). NULL for enrolment/renewal charges.';

-- ---------------------------------------------------------------------------
-- updated_at + state-transition guard
-- The TS mirror lives in supabase/functions/_shared/jobs/payment-request-state.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION job_payment_requests_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();

  IF NEW.tenant_id <> OLD.tenant_id OR NEW.engagement_id <> OLD.engagement_id THEN
    RAISE EXCEPTION 'job_payment_requests: tenant/engagement are immutable';
  END IF;

  IF NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'pending'   AND NEW.status IN ('sent', 'paid', 'cancelled')) OR
      (OLD.status = 'sent'      AND NEW.status IN ('paid', 'cancelled', 'pending')) OR
      (OLD.status = 'cancelled' AND NEW.status = 'pending') OR
      (OLD.status = 'paid'      AND NEW.status = 'refunded_manual')
    ) THEN
      RAISE EXCEPTION 'job_payment_requests: illegal transition % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- Money fields freeze once a payment settled the request.
  IF OLD.status IN ('paid', 'refunded_manual') THEN
    IF NEW.amount_minor <> OLD.amount_minor OR NEW.currency <> OLD.currency
       OR NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
      RAISE EXCEPTION 'job_payment_requests: amount/payment are immutable after payment';
    END IF;
  END IF;

  -- Reopening a cancelled/sent request must not carry a stale pay link state.
  IF NEW.status = 'pending' AND OLD.status <> 'pending' THEN
    NEW.sent_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_job_payment_requests_before_update
  BEFORE UPDATE ON job_payment_requests
  FOR EACH ROW EXECUTE FUNCTION job_payment_requests_before_update();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE job_payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_payment_requests_super_admin ON job_payment_requests FOR ALL USING (is_super_admin());

CREATE POLICY job_payment_requests_admin_manage ON job_payment_requests FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Clients see their own job's requests (portal "what do I owe"); public pay
-- page reads go through the service role with the token, never through RLS.
CREATE POLICY job_payment_requests_client_select ON job_payment_requests FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND engagement_id IN (
      SELECT e.id FROM engagements e
      WHERE e.person_id = get_my_person_id()
         OR e.person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids()))
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.job_payment_requests TO authenticated;
GRANT ALL ON TABLE public.job_payment_requests TO service_role;

-- Column-level: the public token is a capability. Clients can read it for their
-- own requests (it IS their pay link); other roles are already row-filtered.

-- ---------------------------------------------------------------------------
-- RPC: create_job_payment_requests(p_engagement_id, p_requests jsonb)
-- Called by Thread C (accepted quote → deposit + balance) and the admin panel.
-- p_requests: [{"label":"מקדמה","amount_minor":15000,"due_date":"2026-11-10","max_installments":1}, ...]
-- Returns the created rows as a jsonb array.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_job_payment_requests(
  p_engagement_id UUID,
  p_requests      JSONB
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   UUID;
  v_currency    TEXT;
  v_item        JSONB;
  v_label       TEXT;
  v_amount      INT;
  v_due         DATE;
  v_installments INT;
  v_ids         UUID[] := '{}';
  v_id          UUID;
  v_result      JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'create_job_payment_requests: tenant_admin role required';
  END IF;

  SELECT e.tenant_id INTO v_tenant_id FROM engagements e WHERE e.id = p_engagement_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_job_payment_requests: engagement not found';
  END IF;
  IF v_tenant_id <> get_my_tenant_id() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'create_job_payment_requests: cross-tenant access denied';
  END IF;

  IF p_requests IS NULL OR jsonb_typeof(p_requests) <> 'array' OR jsonb_array_length(p_requests) = 0 THEN
    RAISE EXCEPTION 'create_job_payment_requests: p_requests must be a non-empty array';
  END IF;

  SELECT COALESCE(t.currency, 'ILS') INTO v_currency FROM tenants t WHERE t.id = v_tenant_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_requests) LOOP
    v_label := trim(COALESCE(v_item->>'label', ''));
    v_amount := (v_item->>'amount_minor')::INT;
    v_due := NULLIF(v_item->>'due_date', '')::DATE;
    v_installments := COALESCE(NULLIF(v_item->>'max_installments', '')::INT, 1);

    IF v_label = '' THEN
      RAISE EXCEPTION 'create_job_payment_requests: label is required';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'create_job_payment_requests: amount_minor must be a positive integer (label %)', v_label;
    END IF;

    INSERT INTO job_payment_requests (
      tenant_id, engagement_id, label, amount_minor, currency, due_date, max_installments, created_by
    ) VALUES (
      v_tenant_id, p_engagement_id, v_label, v_amount, upper(v_currency), v_due, v_installments, auth.uid()
    )
    RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (
    v_tenant_id, auth.uid(), 'job_payment_request.created', 'engagement', p_engagement_id,
    jsonb_build_object('request_ids', to_jsonb(v_ids), 'requests', p_requests)
  );

  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at, r.id)
    INTO v_result
  FROM job_payment_requests r
  WHERE r.id = ANY(v_ids);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION create_job_payment_requests(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_job_payment_requests(UUID, JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gallery gating
-- ---------------------------------------------------------------------------

-- TRUE when every non-cancelled request for the job is paid (refunded_manual
-- counts as NOT paid — the money went back). A job with no requests at all is
-- not "all paid": the admin releases it explicitly.
CREATE OR REPLACE FUNCTION job_payment_requests_all_paid(p_engagement_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1 FROM job_payment_requests r
           WHERE r.engagement_id = p_engagement_id AND r.status <> 'cancelled'
         )
     AND NOT EXISTS (
           SELECT 1 FROM job_payment_requests r
           WHERE r.engagement_id = p_engagement_id
             AND r.status NOT IN ('cancelled', 'paid')
         );
$$;
REVOKE ALL ON FUNCTION job_payment_requests_all_paid(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION job_payment_requests_all_paid(UUID) TO authenticated, service_role;

-- Client-facing read. Returns the gallery URL ONLY when released; otherwise the
-- URL is withheld server-side (the row-level policy on job_details never lets a
-- client read the column directly — see the restrictive policy below).
CREATE OR REPLACE FUNCTION get_client_job_gallery(p_engagement_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_eng           RECORD;
  v_is_admin      BOOLEAN;
  v_is_client     BOOLEAN;
  v_released_at   TIMESTAMPTZ;
  v_gallery_url   TEXT;
  v_all_paid      BOOLEAN;
  v_outstanding   BIGINT;
  v_released      BOOLEAN;
BEGIN
  SELECT e.id, e.tenant_id, e.person_id INTO v_eng FROM engagements e WHERE e.id = p_engagement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'get_client_job_gallery: job not found';
  END IF;

  -- COALESCE: a NULL from get_my_tenant_id()/get_my_person_id() (no profile)
  -- must read as "not allowed", never as an unknown that skips the check.
  v_is_admin := COALESCE(is_super_admin(), false) OR COALESCE(
    v_eng.tenant_id = get_my_tenant_id() AND EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)), false);
  v_is_client := COALESCE(v_eng.person_id = get_my_person_id(), false)
    OR v_eng.person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids()));

  IF NOT COALESCE(v_is_admin OR v_is_client, false) THEN
    RAISE EXCEPTION 'get_client_job_gallery: access denied';
  END IF;

  IF to_regclass('public.job_details') IS NOT NULL THEN
    EXECUTE 'SELECT gallery_url, gallery_released_at FROM job_details WHERE engagement_id = $1'
      INTO v_gallery_url, v_released_at USING p_engagement_id;
  END IF;

  v_all_paid := job_payment_requests_all_paid(p_engagement_id);
  SELECT COALESCE(SUM(r.amount_minor), 0) INTO v_outstanding
  FROM job_payment_requests r
  WHERE r.engagement_id = p_engagement_id AND r.status IN ('pending', 'sent');

  v_released := v_released_at IS NOT NULL OR v_all_paid;

  RETURN jsonb_build_object(
    'engagement_id', p_engagement_id,
    'released', v_released,
    'released_by_admin', v_released_at IS NOT NULL,
    'all_paid', v_all_paid,
    'outstanding_minor', v_outstanding,
    'has_gallery', v_gallery_url IS NOT NULL AND v_gallery_url <> '',
    'gallery_url', CASE WHEN v_released THEN v_gallery_url ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION get_client_job_gallery(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_client_job_gallery(UUID) TO authenticated, service_role;

-- Admin override: "release anyway" / "un-release". Audited.
CREATE OR REPLACE FUNCTION release_job_gallery(p_engagement_id UUID, p_release BOOLEAN DEFAULT true)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id UUID;
  v_now       TIMESTAMPTZ := now();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'release_job_gallery: tenant_admin role required';
  END IF;

  SELECT e.tenant_id INTO v_tenant_id FROM engagements e WHERE e.id = p_engagement_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'release_job_gallery: job not found';
  END IF;
  IF v_tenant_id <> get_my_tenant_id() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'release_job_gallery: cross-tenant access denied';
  END IF;
  IF to_regclass('public.job_details') IS NULL THEN
    RAISE EXCEPTION 'release_job_gallery: job_details not available';
  END IF;

  EXECUTE 'UPDATE job_details SET gallery_released_at = $1 WHERE engagement_id = $2'
    USING CASE WHEN p_release THEN v_now ELSE NULL END, p_engagement_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (
    v_tenant_id, auth.uid(),
    CASE WHEN p_release THEN 'job_gallery.released' ELSE 'job_gallery.unreleased' END,
    'engagement', p_engagement_id,
    jsonb_build_object('gallery_released_at', CASE WHEN p_release THEN v_now ELSE NULL END)
  );

  RETURN get_client_job_gallery(p_engagement_id);
END;
$$;
REVOKE ALL ON FUNCTION release_job_gallery(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION release_job_gallery(UUID, BOOLEAN) TO authenticated;

-- Defence in depth: clients must never SELECT job_details rows (gallery_url
-- lives there). RESTRICTIVE policies AND with Thread A's permissive ones, so
-- this holds whatever 20261030000100 grants. Client reads go through
-- get_client_job_gallery() / Thread A's client RPCs. Guarded so this file also
-- applies before job_details exists (dev DBs pushed out of order).
DO $$
BEGIN
  IF to_regclass('public.job_details') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE job_details ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS job_details_admin_only_select ON job_details';
    EXECUTE $p$
      CREATE POLICY job_details_admin_only_select ON job_details
        AS RESTRICTIVE FOR SELECT
        USING (
          is_super_admin()
          OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
        )
    $p$;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Part 2: daily balance reminders (3 days before due_date, then once overdue).
-- Same pg_cron + pg_net shape as run-enrolment-payment-dunning (002800).
-- 06:00 UTC = 08:00/09:00 Asia/Jerusalem.
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE schedule = '0 6 * * *'
  AND command ILIKE '%/functions/v1/run-job-payment-reminders%';

SELECT cron.schedule(
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := get_supabase_functions_url() || '/functions/v1/run-job-payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', get_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
