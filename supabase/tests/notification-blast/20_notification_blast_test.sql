-- Hand-picked account ("scope account") must always include its contact, with
-- or without an active enrolment. Opt-outs, a missing email and other tenants
-- are still respected, and the other scopes are unchanged.
--
-- Fixture (tenant a0..01 "photo"): Alice (enrolled), Bob (enrolled), plus:
--   Carol  family account, NO enrolment, has an email          -> must be included
--   Dan    family account, NO enrolment, NO email              -> excluded
--   Erin   family account, NO enrolment, email_opted_in = false -> excluded
--   Finn   family account, NO enrolment, notify_announcements = false -> excluded
-- Dina's account belongs to tenant a0..02 (another studio).
SET session_replication_role = replica;
INSERT INTO people (id, tenant_id, name, email) VALUES
 ('c0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-000000000001','Carol','carol@x.test'),
 ('c0000000-0000-4000-8000-0000000000c2','a0000000-0000-4000-8000-000000000001','Dan',NULL),
 ('c0000000-0000-4000-8000-0000000000c3','a0000000-0000-4000-8000-000000000001','Erin','erin@x.test'),
 ('c0000000-0000-4000-8000-0000000000c4','a0000000-0000-4000-8000-000000000001','Finn','finn@x.test');
INSERT INTO accounts (id, tenant_id, name, person_id) VALUES
 ('d0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-000000000001','Carol family','c0000000-0000-4000-8000-0000000000c1'),
 ('d0000000-0000-4000-8000-0000000000c2','a0000000-0000-4000-8000-000000000001','Dan family','c0000000-0000-4000-8000-0000000000c2'),
 ('d0000000-0000-4000-8000-0000000000c3','a0000000-0000-4000-8000-000000000001','Erin family','c0000000-0000-4000-8000-0000000000c3'),
 ('d0000000-0000-4000-8000-0000000000c4','a0000000-0000-4000-8000-000000000001','Finn family','c0000000-0000-4000-8000-0000000000c4');
UPDATE people SET account_id = 'd0000000-0000-4000-8000-0000000000c1' WHERE id = 'c0000000-0000-4000-8000-0000000000c1';
UPDATE people SET account_id = 'd0000000-0000-4000-8000-0000000000c2' WHERE id = 'c0000000-0000-4000-8000-0000000000c2';
UPDATE people SET account_id = 'd0000000-0000-4000-8000-0000000000c3' WHERE id = 'c0000000-0000-4000-8000-0000000000c3';
UPDATE people SET account_id = 'd0000000-0000-4000-8000-0000000000c4' WHERE id = 'c0000000-0000-4000-8000-0000000000c4';
INSERT INTO contact_preferences (tenant_id, person_id, email_opted_in)
VALUES ('a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c3', false);
INSERT INTO contact_preferences (tenant_id, person_id, notify_announcements)
VALUES ('a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c4', false);
SET session_replication_role = origin;

DO $$
DECLARE
  tenant1 CONSTANT UUID := 'a0000000-0000-4000-8000-000000000001';
  names TEXT[];
  n INT;
BEGIN
  -- 1. THE BUG: an account with no enrolment is included when hand-picked.
  SELECT array_agg(recipient_name) INTO names FROM resolve_notification_blast_recipients(
    tenant1, 'account', NULL, NULL, 'd0000000-0000-4000-8000-0000000000c1', NULL);
  IF names IS DISTINCT FROM ARRAY['Carol'] THEN
    RAISE EXCEPTION 'FAIL no-enrolment account: got %, expected {Carol}', names;
  END IF;
  RAISE NOTICE 'ok  hand-picked account without an enrolment is included';

  -- 2. An enrolled account still works.
  SELECT array_agg(recipient_name) INTO names FROM resolve_notification_blast_recipients(
    tenant1, 'account', NULL, NULL, 'd0000000-0000-4000-8000-00000000000a', NULL);
  IF names IS DISTINCT FROM ARRAY['Alice'] THEN
    RAISE EXCEPTION 'FAIL enrolled account: got %, expected {Alice}', names;
  END IF;
  RAISE NOTICE 'ok  hand-picked enrolled account still included';

  -- 3. No email on file: nobody to send to.
  SELECT count(*) INTO n FROM resolve_notification_blast_recipients(
    tenant1, 'account', NULL, NULL, 'd0000000-0000-4000-8000-0000000000c2', NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL no-email account returned % rows', n; END IF;
  RAISE NOTICE 'ok  contact without an email is excluded';

  -- 4. Opt-outs are still respected.
  SELECT count(*) INTO n FROM resolve_notification_blast_recipients(
    tenant1, 'account', NULL, NULL, 'd0000000-0000-4000-8000-0000000000c3', NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL email opt-out returned % rows', n; END IF;
  SELECT count(*) INTO n FROM resolve_notification_blast_recipients(
    tenant1, 'account', NULL, NULL, 'd0000000-0000-4000-8000-0000000000c4', NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL announcements opt-out returned % rows', n; END IF;
  RAISE NOTICE 'ok  email and announcement opt-outs are still respected';

  -- 5. Another studio's account is never reachable from this tenant.
  SELECT count(*) INTO n FROM resolve_notification_blast_recipients(
    tenant1, 'account', NULL, NULL, 'd0000000-0000-4000-8000-00000000000d', NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL other-tenant account returned % rows', n; END IF;
  RAISE NOTICE 'ok  an account from another studio returns nothing';

  -- 6. Scope "all" is unchanged: only families with an active enrolment.
  SELECT array_agg(recipient_name ORDER BY recipient_name) INTO names FROM resolve_notification_blast_recipients(
    tenant1, 'all', NULL, NULL, NULL, NULL);
  IF names IS DISTINCT FROM ARRAY['Alice','Bob'] THEN
    RAISE EXCEPTION 'FAIL scope all changed: got %, expected {Alice,Bob}', names;
  END IF;
  RAISE NOTICE 'ok  scope "all" still means families with an active enrolment';

  -- 7. Class scope is unchanged too.
  SELECT array_agg(recipient_name ORDER BY recipient_name) INTO names FROM resolve_notification_blast_recipients(
    tenant1, 'class', NULL, 'e0000000-0000-4000-8000-000000000001', NULL, NULL);
  IF names IS DISTINCT FROM ARRAY['Alice','Bob'] THEN
    RAISE EXCEPTION 'FAIL scope class changed: got %', names;
  END IF;
  RAISE NOTICE 'ok  scope "class" unchanged';
END $$;

-- 8. The admin-facing preview RPC (what the form calls) returns Carol...
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000e', false);
DO $$
DECLARE names TEXT[];
BEGIN
  SELECT array_agg(recipient_name) INTO names FROM preview_notification_blast_recipients(
    'account', NULL, NULL, 'd0000000-0000-4000-8000-0000000000c1', NULL);
  IF names IS DISTINCT FROM ARRAY['Carol'] THEN
    RAISE EXCEPTION 'FAIL preview as admin: got %, expected {Carol}', names;
  END IF;
  RAISE NOTICE 'ok  preview RPC as tenant admin returns the hand-picked account';
END $$;

-- 9. ...and still refuses a non-admin.
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000a', false);
DO $$
BEGIN
  PERFORM * FROM preview_notification_blast_recipients('account', NULL, NULL, 'd0000000-0000-4000-8000-0000000000c1', NULL);
  RAISE EXCEPTION 'FAIL preview allowed a non-admin';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'Forbidden' THEN RAISE; END IF;
  RAISE NOTICE 'ok  preview RPC still refuses non-admins';
END $$;

SELECT 'notification blast: all checks passed' AS result;
