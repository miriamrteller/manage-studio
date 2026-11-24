-- Quotes: "valid until" is information only (owner decision, 11 Nov 2026).
-- A client can still accept and pay a sent quote after its valid_until date.
-- * get_public_quote no longer shows a past-date quote as expired.
-- * accept_quote no longer refuses (or marks expired) a past-date quote.
-- * Quotes already marked expired by the old rule go back to sent, so their
--   links work again. Their terms are unchanged.

UPDATE quotes SET status = 'sent' WHERE status = 'expired';

CREATE OR REPLACE FUNCTION get_public_quote(p_token TEXT, p_tenant_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q      quotes%ROWTYPE;
  v_status TEXT;
BEGIN
  IF p_token IS NULL OR char_length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO v_q FROM quotes WHERE public_token = p_token AND tenant_id = p_tenant_id;
  -- Drafts are invisible: the admin has not sent them yet.
  IF NOT FOUND OR v_q.status = 'draft' THEN RETURN NULL; END IF;

  -- valid_until is information only: a sent quote stays open after the date.
  v_status := v_q.status;

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
  v_request_ids  UUID[];
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
  -- valid_until is information only (owner decision 11 Nov 2026): never a reason to refuse.

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
  -- Written straight into job_payment_requests: create_job_payment_requests()
  -- requires a signed-in tenant admin, and the accepting client is anonymous.
  -- KEEP IN SYNC with create_job_payment_requests() in
  -- 20261030000200_job_payment_requests.sql: same inserted columns, same
  -- 'job_payment_request.created' audit action (created_by is NULL here).
  -- Only reachable through accept_quote() (service role, public_token-scoped).
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
    WITH ins AS (
      INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor, currency, due_date,
                                        max_installments, created_by)
      SELECT v_q.tenant_id, v_engagement, r->>'label', (r->>'amount_minor')::int, upper(v_q.currency),
             (r->>'due_date')::date, (r->>'max_installments')::int, NULL
      FROM jsonb_array_elements(v_requests) WITH ORDINALITY AS t(r, n)
      ORDER BY n
      RETURNING id
    )
    SELECT array_agg(id) INTO v_request_ids FROM ins;

    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_q.tenant_id, NULL, 'job_payment_request.created', 'engagement', v_engagement,
            jsonb_build_object('request_ids', to_jsonb(v_request_ids), 'requests', v_requests,
                               'source', 'quote_accepted', 'quote_id', v_q.id));
  END IF;

  -- 6. Settle the quote and keep the result for replay.
  v_result := jsonb_build_object(
    'ok', true, 'quote_id', v_q.id, 'engagement_id', v_engagement,
    'converted_lead', v_q.engagement_id IS NULL,
    'total_minor', v_q.total_minor, 'deposit_minor', v_q.deposit_minor,
    'balance_minor', v_q.balance_minor, 'currency', v_q.currency,
    'shoot_date', v_shoot_date, 'balance_due_date', v_balance_due,
    'payment_requests', v_requests,
    'payment_request_ids', to_jsonb(COALESCE(v_request_ids, '{}'::uuid[])),
    'send_contract', v_q.send_contract_on_accept);

  UPDATE quotes SET status = 'accepted', accepted_at = now(), engagement_id = v_engagement,
                    accepted_result = v_result
  WHERE id = v_q.id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_q.tenant_id, NULL, 'quote_accepted', 'quote', v_q.id, v_result);

  RETURN v_result || jsonb_build_object('already_accepted', false);
END;
$$;

