-- =============================================================================
-- Executable checks for 20261030000300_quotes.sql (run via ./run.sh).
-- Each block ASSERTs; any failure aborts with a non-zero exit.
-- =============================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO tenants (id, name, subdomain, language_default) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Studio A', 'a', 'he'),
  ('00000000-0000-0000-0000-0000000000b1', 'Studio B', 'b', 'en');
INSERT INTO user_profiles (id, tenant_id, role) VALUES
  ('00000000-0000-0000-0000-00000000aaa1', '00000000-0000-0000-0000-0000000000a1', '{tenant_admin}'),
  ('00000000-0000-0000-0000-00000000bbb1', '00000000-0000-0000-0000-0000000000b1', '{tenant_admin}'),
  ('00000000-0000-0000-0000-00000000aaa2', '00000000-0000-0000-0000-0000000000a1', '{parent}');
INSERT INTO offerings (id, tenant_id, name, price_minor, location) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'Family session', 45000, 'Jaffa');
INSERT INTO leads (id, tenant_id, name, email, offering_id) VALUES
  ('00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000000a1', 'Dana', 'dana@example.test',
   '00000000-0000-0000-0000-0000000000f1');

CREATE TEMP TABLE ctx (k TEXT PRIMARY KEY, v TEXT);
GRANT ALL ON ctx TO authenticated, anon, service_role;

-- ── 1. Admin saves a quote; gross totals + deposit ──────────────────────────
SET test.uid = '00000000-0000-0000-0000-00000000aaa1';
SET ROLE authenticated;
INSERT INTO ctx VALUES ('q1', save_quote(
  jsonb_build_object('lead_id', '00000000-0000-0000-0000-0000000001e1', 'deposit_percent', 30,
                     'shoot_date', (current_date + 20)::text, 'valid_until', (current_date + 10)::text,
                     'balance_max_installments', 3),
  jsonb_build_array(
    jsonb_build_object('offering_id', '00000000-0000-0000-0000-0000000000f1', 'description', 'Family session',
                       'qty', 1, 'unit_price_minor', 45000),
    jsonb_build_object('description', 'Extra hour', 'qty', 2, 'unit_price_minor', 30000),
    jsonb_build_object('description', 'Album', 'qty', 1, 'unit_price_minor', 120000, 'is_optional', true),
    jsonb_build_object('description', 'Prints', 'qty', 3, 'unit_price_minor', 9999, 'is_optional', true,
                       'is_selected', true)
  ))::text);
RESET ROLE;

DO $$
DECLARE q quotes%ROWTYPE;
BEGIN
  SELECT * INTO q FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q1');
  ASSERT q.status = 'draft', 'new quote is draft';
  ASSERT q.required_minor = 105000, format('required %s', q.required_minor);
  ASSERT q.optional_selected_minor = 29997, format('optional preselected %s', q.optional_selected_minor);
  ASSERT q.total_minor = 134997, format('total %s', q.total_minor);
  -- 30% of 134997 = 40499.1 → 40499
  ASSERT q.deposit_minor = 40499 AND q.balance_minor = 94498, format('deposit %s balance %s', q.deposit_minor, q.balance_minor);
  ASSERT char_length(q.public_token) = 64, 'token is 64 hex chars';
  ASSERT q.created_by = '00000000-0000-0000-0000-00000000aaa1', 'created_by recorded';
END $$;

-- Rounding is half-up and identical to computeQuoteTotals()
DO $$
BEGIN
  ASSERT quote_deposit_minor(150, 33) = 50, '49.5 → 50';
  ASSERT quote_deposit_minor(105001, 33) = 34650, '34650.33 → 34650';
  ASSERT quote_deposit_minor(99, 50) = 50, '49.5 → 50';
  ASSERT quote_deposit_minor(0, 30) = 0, 'zero total';
  ASSERT quote_deposit_minor(12345, 100) = 12345, 'full deposit';
END $$;

-- ── 2. RLS + visibility ──────────────────────────────────────────────────────
SET test.uid = '00000000-0000-0000-0000-00000000bbb1';
SET ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM quotes) = 0, 'other tenant admin sees no quotes';
  ASSERT (SELECT count(*) FROM quote_lines) = 0, 'other tenant admin sees no lines';
  BEGIN
    PERFORM get_admin_quote((SELECT v::uuid FROM ctx WHERE k = 'q1'));
    RAISE EXCEPTION 'cross-tenant get_admin_quote should fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET test.uid = '00000000-0000-0000-0000-00000000aaa2';
SET ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM quotes) = 0, 'non-admin of same tenant sees no quotes';
END $$;
RESET ROLE;

SET test.uid = '';
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM quotes;
    RAISE EXCEPTION 'anon must not read quotes table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM accept_quote('x', gen_random_uuid(), '{}');
    RAISE EXCEPTION 'anon must not execute accept_quote';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT get_public_quote('not-a-token', '00000000-0000-0000-0000-0000000000a1') IS NULL, 'garbage token → null';
END $$;
RESET ROLE;

INSERT INTO ctx SELECT 'q1_token', public_token FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q1');

SET ROLE anon;
DO $$ BEGIN
  ASSERT get_public_quote((SELECT v FROM ctx WHERE k = 'q1_token'), '00000000-0000-0000-0000-0000000000a1') IS NULL,
    'draft not public';
END $$;
RESET ROLE;

-- ── 3. Send ─────────────────────────────────────────────────────────────────
SET test.uid = '00000000-0000-0000-0000-00000000aaa1';
SET ROLE authenticated;
SELECT mark_quote_sent((SELECT v::uuid FROM ctx WHERE k = 'q1'), 'email') IS NOT NULL AS sent;
RESET ROLE;

SET ROLE anon;
DO $$
DECLARE j JSONB;
BEGIN
  j := get_public_quote((SELECT v FROM ctx WHERE k = 'q1_token'), '00000000-0000-0000-0000-0000000000a1');
  ASSERT j->>'status' = 'sent', 'sent quote visible';
  ASSERT j->>'client_name' = 'Dana', 'client name';
  ASSERT jsonb_array_length(j->'lines') = 4, 'four lines';
  ASSERT NOT (j ? 'public_token') AND NOT (j ? 'tenant_id') AND NOT (j ? 'lead_id'), 'no internals leaked';
  -- Wrong tenant (another studio's site) cannot open it
  ASSERT get_public_quote((SELECT v FROM ctx WHERE k = 'q1_token'), '00000000-0000-0000-0000-0000000000b1') IS NULL,
    'token bound to its tenant';
END $$;
RESET ROLE;

-- ── 4. Invalid selection is rejected without side effects ────────────────────
SET ROLE service_role;
DO $$
DECLARE j JSONB; v_required UUID;
BEGIN
  SELECT id INTO v_required FROM quote_lines
  WHERE quote_id = (SELECT v::uuid FROM ctx WHERE k = 'q1') AND NOT is_optional LIMIT 1;
  j := accept_quote((SELECT v FROM ctx WHERE k = 'q1_token'), '00000000-0000-0000-0000-0000000000a1',
                    ARRAY[v_required, gen_random_uuid()]);
  ASSERT j->>'code' = 'invalid_selection', format('invalid selection: %s', j);
  ASSERT (SELECT status FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q1')) = 'sent', 'still sent';
  ASSERT (SELECT count(*) FROM job_payment_requests) = 0, 'no payment requests';
  ASSERT (SELECT count(*) FROM job_details) = 0, 'no job';
END $$;
RESET ROLE;

-- ── 5. Accept: client ticks the album only (unticks prints) ──────────────────
SET ROLE service_role;
DO $$
DECLARE j JSONB; v_album UUID; q quotes%ROWTYPE; v_eng UUID;
BEGIN
  SELECT id INTO v_album FROM quote_lines
  WHERE quote_id = (SELECT v::uuid FROM ctx WHERE k = 'q1') AND description = 'Album';
  j := accept_quote((SELECT v FROM ctx WHERE k = 'q1_token'), '00000000-0000-0000-0000-0000000000a1', ARRAY[v_album]);
  ASSERT (j->>'ok')::boolean, format('accepted: %s', j);
  ASSERT NOT (j->>'already_accepted')::boolean, 'first accept';
  ASSERT (j->>'converted_lead')::boolean, 'lead converted';
  v_eng := (j->>'engagement_id')::uuid;

  SELECT * INTO q FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q1');
  ASSERT q.status = 'accepted' AND q.accepted_at IS NOT NULL, 'quote accepted';
  ASSERT q.engagement_id = v_eng, 'engagement linked';
  ASSERT q.total_minor = 225000, format('total with album %s', q.total_minor);
  ASSERT q.deposit_minor = 67500 AND q.balance_minor = 157500, 'deposit/balance';

  ASSERT (SELECT job_status FROM job_details WHERE engagement_id = v_eng) = 'booked', 'job booked';
  ASSERT (SELECT lead_id FROM job_details WHERE engagement_id = v_eng) = '00000000-0000-0000-0000-0000000001e1', 'job keeps lead';
  ASSERT (SELECT status FROM engagements WHERE id = v_eng) = 'active', 'engagement active (Thread A convention)';
  ASSERT (SELECT offering_id FROM engagements WHERE id = v_eng) = '00000000-0000-0000-0000-0000000000f1',
    'package from the first included package line';
  ASSERT (SELECT account_id IS NOT NULL FROM quotes WHERE id = q.id), 'quote linked to the new account';
  ASSERT (SELECT converted_account_id IS NOT NULL FROM leads WHERE id = '00000000-0000-0000-0000-0000000001e1'),
    'lead converted';

  ASSERT (SELECT count(*) FROM job_payment_requests WHERE engagement_id = v_eng) = 2, 'two payment requests';
  ASSERT (SELECT amount_minor FROM job_payment_requests WHERE engagement_id = v_eng AND label = 'מקדמה') = 67500,
    'Hebrew deposit label + amount';
  ASSERT (SELECT due_date FROM job_payment_requests WHERE engagement_id = v_eng AND label = 'יתרה') = current_date + 20,
    'balance due on shoot date';
  ASSERT (SELECT max_installments FROM job_payment_requests WHERE engagement_id = v_eng AND label = 'יתרה') = 3,
    'balance installments';
  ASSERT (SELECT sum(amount_minor) FROM job_payment_requests WHERE engagement_id = v_eng) = q.total_minor,
    'requests sum to total';
  ASSERT (SELECT count(*) FROM audit_log WHERE action = 'quote_accepted' AND entity_id = q.id) = 1, 'audited';
  INSERT INTO ctx VALUES ('eng1', v_eng::text);
END $$;

-- ── 6. Idempotent: repeat accept replays, no new side effects ───────────────
DO $$
DECLARE j JSONB;
BEGIN
  j := accept_quote((SELECT v FROM ctx WHERE k = 'q1_token'), '00000000-0000-0000-0000-0000000000a1', '{}');
  ASSERT (j->>'ok')::boolean AND (j->>'already_accepted')::boolean, format('replay: %s', j);
  ASSERT j->>'engagement_id' = (SELECT v FROM ctx WHERE k = 'eng1'), 'same engagement';
  ASSERT (j->>'total_minor')::int = 225000, 'replayed totals (selection not re-applied)';
  ASSERT (SELECT count(*) FROM job_details WHERE lead_id = '00000000-0000-0000-0000-0000000001e1') = 1, 'converted once';
  ASSERT (SELECT count(*) FROM job_payment_requests WHERE engagement_id = (SELECT v::uuid FROM ctx WHERE k = 'eng1')) = 2,
    'requests created once';
  ASSERT (SELECT count(*) FROM audit_log WHERE action = 'job_payment_request.created') = 1, 'request audit once';
  ASSERT (SELECT count(*) FROM audit_log WHERE action = 'quote_accepted') = 1, 'audited once';
  ASSERT (SELECT count(*) FROM audit_log WHERE entity_type = 'leads' AND after_state->>'transition' = 'quote_accepted') = 1,
    'lead conversion audited once';
END $$;
RESET ROLE;

-- ── 7. Accepted quotes are locked ───────────────────────────────────────────
SET test.uid = '00000000-0000-0000-0000-00000000aaa1';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE quote_lines SET unit_price_minor = 1 WHERE quote_id = (SELECT v::uuid FROM ctx WHERE k = 'q1');
    RAISE EXCEPTION 'line edit after accept should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE quotes SET deposit_percent = 10 WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q1');
    RAISE EXCEPTION 'terms edit after accept should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q1');
    RAISE EXCEPTION 'delete after accept should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM save_quote(jsonb_build_object('id', (SELECT v FROM ctx WHERE k = 'q1'),
      'lead_id', '00000000-0000-0000-0000-0000000001e1'), '[]'::jsonb);
    RAISE EXCEPTION 'save_quote after accept should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;

-- ── 8. Expired quotes cannot be accepted (status persists) ───────────────────
SET ROLE authenticated;
INSERT INTO ctx VALUES ('q2', save_quote(
  jsonb_build_object('engagement_id', (SELECT v FROM ctx WHERE k = 'eng1'), 'valid_until', (current_date - 1)::text),
  jsonb_build_array(jsonb_build_object('description', 'Second look', 'unit_price_minor', 10000)))::text);
SELECT mark_quote_sent((SELECT v::uuid FROM ctx WHERE k = 'q2'), 'link') IS NOT NULL AS sent;
RESET ROLE;
SET ROLE service_role;
DO $$
DECLARE j JSONB;
BEGIN
  ASSERT get_public_quote((SELECT public_token FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q2')),
                          '00000000-0000-0000-0000-0000000000a1')->>'status' = 'expired', 'shown as expired';
  j := accept_quote((SELECT public_token FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q2')),
                    '00000000-0000-0000-0000-0000000000a1', '{}');
  ASSERT j->>'code' = 'expired', format('expired: %s', j);
  ASSERT (SELECT status FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q2')) = 'expired', 'persisted';
END $$;
RESET ROLE;

-- ── 9. Quote on an existing shoot, 0% deposit → balance only, no conversion ──
SET ROLE authenticated;
INSERT INTO ctx VALUES ('q3', save_quote(
  jsonb_build_object('engagement_id', (SELECT v FROM ctx WHERE k = 'eng1'), 'deposit_percent', 0),
  jsonb_build_array(jsonb_build_object('description', 'Reprint', 'qty', 2, 'unit_price_minor', 5000)))::text);
SELECT mark_quote_sent((SELECT v::uuid FROM ctx WHERE k = 'q3'), 'whatsapp') IS NOT NULL AS sent;
RESET ROLE;
SET ROLE service_role;
DO $$
DECLARE j JSONB;
BEGIN
  ASSERT (SELECT account_id FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q3')) IS NOT NULL,
    'account derived from shoot';
  j := accept_quote((SELECT public_token FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q3')),
                    '00000000-0000-0000-0000-0000000000a1', NULL);
  ASSERT (j->>'ok')::boolean AND NOT (j->>'converted_lead')::boolean, format('accepted existing: %s', j);
  ASSERT jsonb_array_length(j->'payment_requests') = 1, 'balance only';
  ASSERT (j->'payment_requests'->0->>'amount_minor')::int = 10000, 'balance amount';
  -- No shoot date anywhere → balance due today, never in the past
  ASSERT (j->'payment_requests'->0->>'due_date')::date = (now() AT TIME ZONE 'Asia/Jerusalem')::date, 'due today';
  ASSERT (SELECT count(*) FROM job_details WHERE lead_id = '00000000-0000-0000-0000-0000000001e1') = 1, 'no new conversion';
  ASSERT (SELECT count(*) FROM engagements) = 1, 'no new engagement';
END $$;
RESET ROLE;

-- ── 10. Decline ─────────────────────────────────────────────────────────────
SET ROLE authenticated;
INSERT INTO ctx VALUES ('q4', save_quote(
  jsonb_build_object('lead_id', '00000000-0000-0000-0000-0000000001e1'),
  jsonb_build_array(jsonb_build_object('description', 'Mini', 'unit_price_minor', 20000)))::text);
SELECT mark_quote_sent((SELECT v::uuid FROM ctx WHERE k = 'q4'), 'email') IS NOT NULL AS sent;
RESET ROLE;
INSERT INTO ctx SELECT 'q4_token', public_token FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q4');
SET ROLE anon;
DO $$
BEGIN
  ASSERT (decline_public_quote((SELECT v FROM ctx WHERE k = 'q4_token'), '00000000-0000-0000-0000-0000000000a1',
                               'Too expensive')->>'ok')::boolean, 'declined';
  ASSERT (decline_public_quote((SELECT v FROM ctx WHERE k = 'q4_token'), '00000000-0000-0000-0000-0000000000a1')
          ->>'ok')::boolean, 'decline is idempotent';
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  ASSERT accept_quote((SELECT v FROM ctx WHERE k = 'q4_token'), '00000000-0000-0000-0000-0000000000a1', '{}')
         ->>'code' = 'not_open', 'declined cannot be accepted';
END $$;
RESET ROLE;

-- ── 10b. A lead quote must name a package (job_insert needs one) ───────────
INSERT INTO leads (id, tenant_id, name, email) VALUES
  ('00000000-0000-0000-0000-0000000001e2', '00000000-0000-0000-0000-0000000000a1', 'No Package', 'np@example.test');
SET test.uid = '00000000-0000-0000-0000-00000000aaa1';
SET ROLE authenticated;
DO $$
DECLARE v_id UUID;
BEGIN
  v_id := save_quote(jsonb_build_object('lead_id', '00000000-0000-0000-0000-0000000001e2'),
                     jsonb_build_array(jsonb_build_object('description', 'Custom', 'unit_price_minor', 1000)));
  BEGIN
    PERFORM mark_quote_sent(v_id, 'email');
    RAISE EXCEPTION 'sending a lead quote without a package should fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;

-- With the tenant's hidden "Custom shoot" package (Thread A), the same quote can go out
-- and the job is attached to that package; the price stays on the quote.
INSERT INTO offerings (id, tenant_id, name, offering_type, is_public, price_minor) VALUES
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000a1', 'Custom shoot', 'appointment', false, 0);
SET ROLE authenticated;
INSERT INTO ctx SELECT 'q_np', id::text FROM quotes WHERE lead_id = '00000000-0000-0000-0000-0000000001e2';
SELECT mark_quote_sent((SELECT v::uuid FROM ctx WHERE k = 'q_np'), 'email') IS NOT NULL AS sent;
RESET ROLE;
SET ROLE service_role;
DO $$
DECLARE j JSONB;
BEGIN
  j := accept_quote((SELECT public_token FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q_np')),
                    '00000000-0000-0000-0000-0000000000a1', '{}');
  ASSERT (j->>'ok')::boolean, format('custom-package accept: %s', j);
  ASSERT (SELECT offering_id FROM engagements WHERE id = (j->>'engagement_id')::uuid)
         = '00000000-0000-0000-0000-0000000000f4', 'job on the hidden custom package';
  ASSERT (SELECT sum(amount_minor) FROM job_payment_requests WHERE engagement_id = (j->>'engagement_id')::uuid) = 1000,
    'price from the quote, not the package';
END $$;
RESET ROLE;

-- ── 10c. Lead already converted by the admin (Thread A UI) → job reused ─────
INSERT INTO leads (id, tenant_id, name, email, offering_id) VALUES
  ('00000000-0000-0000-0000-0000000001e3', '00000000-0000-0000-0000-0000000000a1', 'Pre Converted', 'pc@example.test',
   '00000000-0000-0000-0000-0000000000f1');
SET test.uid = '00000000-0000-0000-0000-00000000aaa1';
SET ROLE authenticated;
INSERT INTO ctx VALUES ('pc_eng', (convert_lead_to_job('00000000-0000-0000-0000-0000000001e3')->>'engagement_id'));
INSERT INTO ctx VALUES ('q5', save_quote(
  jsonb_build_object('lead_id', '00000000-0000-0000-0000-0000000001e3'),
  jsonb_build_array(jsonb_build_object('offering_id', '00000000-0000-0000-0000-0000000000f1',
                                       'description', 'Family session', 'unit_price_minor', 45000)))::text);
SELECT mark_quote_sent((SELECT v::uuid FROM ctx WHERE k = 'q5'), 'email') IS NOT NULL AS sent;
RESET ROLE;
SET ROLE service_role;
DO $$
DECLARE j JSONB;
BEGIN
  j := accept_quote((SELECT public_token FROM quotes WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'q5')),
                    '00000000-0000-0000-0000-0000000000a1', '{}');
  ASSERT (j->>'ok')::boolean, format('accepted pre-converted: %s', j);
  ASSERT j->>'engagement_id' = (SELECT v FROM ctx WHERE k = 'pc_eng'), 'reused the existing job';
  ASSERT (SELECT count(*) FROM job_details WHERE lead_id = '00000000-0000-0000-0000-0000000001e3') = 1, 'no duplicate job';
  ASSERT (SELECT job_status FROM job_details WHERE engagement_id = (SELECT v::uuid FROM ctx WHERE k = 'pc_eng')) = 'booked',
    'existing enquiry booked';
END $$;
RESET ROLE;

-- ── 11. Automatic emails: claim once, toggles, due windows ──────────────────
SET ROLE service_role;
DO $$
DECLARE v_id UUID; v_q UUID := (SELECT v::uuid FROM ctx WHERE k = 'q1');
BEGIN
  v_id := claim_automatic_email('00000000-0000-0000-0000-0000000000a1', 'booking_confirmed', v_q, NULL, 'dana@example.test');
  ASSERT v_id IS NOT NULL, 'first claim';
  ASSERT claim_automatic_email('00000000-0000-0000-0000-0000000000a1', 'booking_confirmed', v_q, NULL, 'dana@example.test')
         IS NULL, 'second claim blocked while pending';
  PERFORM complete_automatic_email(v_id, 'failed', 'smtp down');
  ASSERT claim_automatic_email('00000000-0000-0000-0000-0000000000a1', 'booking_confirmed', v_q, NULL, 'dana@example.test')
         = v_id, 'failed send can be retried';
  PERFORM complete_automatic_email(v_id, 'sent', NULL, 'msg-1');
  ASSERT claim_automatic_email('00000000-0000-0000-0000-0000000000a1', 'booking_confirmed', v_q, NULL, 'dana@example.test')
         IS NULL, 'sent is final';
END $$;
RESET ROLE;

-- Shoot two days out, booked → reminder due; a past shoot → thank-you; a released gallery → gallery_ready
UPDATE engagements SET booked_starts_at = now() + interval '2 days', booked_ends_at = now() + interval '2 days 2 hours'
WHERE id = (SELECT v::uuid FROM ctx WHERE k = 'eng1');
SET ROLE service_role;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM list_due_shoot_emails(now()) WHERE email_key = 'shoot_reminder') = 1, 'reminder due';
  ASSERT (SELECT recipient_email FROM list_due_shoot_emails(now()) WHERE email_key = 'shoot_reminder') = 'dana@example.test',
    'recipient from converted person';
  ASSERT (SELECT count(*) FROM list_due_shoot_emails(now() + interval '3 days') WHERE email_key = 'shoot_thank_you') = 1,
    'thank-you due the day after';
END $$;
RESET ROLE;

INSERT INTO tenant_automatic_emails (tenant_id, email_key, enabled)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'shoot_reminder', false);
UPDATE job_details SET gallery_url = 'https://gallery.example.test/x', gallery_released_at = now()
WHERE engagement_id = (SELECT v::uuid FROM ctx WHERE k = 'eng1');
SET ROLE service_role;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM list_due_shoot_emails(now()) WHERE email_key = 'shoot_reminder') = 0, 'toggle off';
  ASSERT (SELECT count(*) FROM list_due_shoot_emails(now()) WHERE email_key = 'gallery_ready') = 1, 'gallery due';
  ASSERT claim_automatic_email('00000000-0000-0000-0000-0000000000a1', 'shoot_reminder', NULL,
         (SELECT v::uuid FROM ctx WHERE k = 'eng1'), 'dana@example.test') IS NULL, 'claim respects toggle';
END $$;
RESET ROLE;

-- Cron registered once
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM cron.job WHERE command ILIKE '%run-shoot-emails%') = 1, 'cron scheduled';
END $$;

SELECT 'quotes sql tests: ALL PASSED' AS result;
