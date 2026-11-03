-- sign_waiver() signer details. Fixture (tenant T1 = a0..01, T2 = a0..02):
--   admin1  tenant_admin in T1        admin2  tenant_admin in T2
--   parent  account holder of family F1 (member row m1), signs for kid
--   other   account holder of family F2 (no link to the kid)
--   adult   a self-signing adult (no date of birth on file)
--   kid     a 10 year old in F1
-- 123456782 passes the Israeli ID check digit; 123456789 does not.
SET session_replication_role = replica;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
 ('b0000000-0000-4000-8000-0000000000c1','admin1@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000c2','admin2@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000c3','parent@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000c4','other@x.test', now());
INSERT INTO user_profiles (id, tenant_id, role, email) VALUES
 ('b0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-000000000001','{tenant_admin}','admin1@x.test'),
 ('b0000000-0000-4000-8000-0000000000c2','a0000000-0000-4000-8000-000000000002','{tenant_admin}','admin2@x.test'),
 ('b0000000-0000-4000-8000-0000000000c3','a0000000-0000-4000-8000-000000000001','{account_holder}','parent@x.test'),
 ('b0000000-0000-4000-8000-0000000000c4','a0000000-0000-4000-8000-000000000001','{account_holder}','other@x.test');

INSERT INTO people (id, tenant_id, name, email, date_of_birth) VALUES
 ('c0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-000000000001','Parent','parent@x.test', NULL),
 ('c0000000-0000-4000-8000-0000000000c2','a0000000-0000-4000-8000-000000000001','Kid', NULL, (current_date - interval '10 years')::date),
 ('c0000000-0000-4000-8000-0000000000c3','a0000000-0000-4000-8000-000000000001','Adult', NULL, '1980-05-05'),
 ('c0000000-0000-4000-8000-0000000000c4','a0000000-0000-4000-8000-000000000001','Other', 'other@x.test', NULL),
 ('c0000000-0000-4000-8000-0000000000c5','a0000000-0000-4000-8000-000000000001','Almost adult', NULL, (current_date - interval '18 years')::date);
INSERT INTO accounts (id, tenant_id, name, person_id) VALUES
 ('d0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-000000000001','F1','c0000000-0000-4000-8000-0000000000c1'),
 ('d0000000-0000-4000-8000-0000000000c2','a0000000-0000-4000-8000-000000000001','F2','c0000000-0000-4000-8000-0000000000c4');
UPDATE people SET account_id = 'd0000000-0000-4000-8000-0000000000c1'
 WHERE id IN ('c0000000-0000-4000-8000-0000000000c1','c0000000-0000-4000-8000-0000000000c2');
UPDATE people SET user_profile_id = 'b0000000-0000-4000-8000-0000000000c3' WHERE id = 'c0000000-0000-4000-8000-0000000000c1';
INSERT INTO account_members (id, tenant_id, account_id, person_id, role, user_profile_id) VALUES
 ('e1000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000c1','c0000000-0000-4000-8000-0000000000c1','account_holder','b0000000-0000-4000-8000-0000000000c3'),
 ('e1000000-0000-4000-8000-0000000000c2','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000c2','c0000000-0000-4000-8000-0000000000c4','account_holder','b0000000-0000-4000-8000-0000000000c4');
INSERT INTO consent_templates (id, tenant_id, name, content, version, version_hash, status) VALUES
 ('f0000000-0000-4000-8000-0000000000c1','a0000000-0000-4000-8000-000000000001','Health declaration','I declare.',1,repeat('a',64),'active');
SET session_replication_role = origin;

CREATE FUNCTION pg_temp.good(id_no TEXT DEFAULT '123456782') RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'version', 1, 'confirmed', true, 'confirmed_wording', 'These details are correct',
    'signer', jsonb_build_object('full_name','Dana Levi','id_type','israeli_id','id_number',id_no,
                                 'phone','050-123-4567','address','1 Herzl St, Haifa'))
$$;

CREATE FUNCTION pg_temp.kid_block() RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object('full_name','Kid Levi','date_of_birth','2016-01-02','dob_differs_from_profile',true)
$$;

-- Signs for a person; returns the SQLERRM text or 'ok'.
CREATE FUNCTION pg_temp.sign(p_person UUID, p_key TEXT, p_details JSONB, p_method TEXT DEFAULT 'typed_name_checkbox')
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v UUID;
BEGIN
  v := sign_waiver(
    gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', p_person,
    'e1000000-0000-4000-8000-0000000000c1', 'f0000000-0000-4000-8000-0000000000c1', 1, repeat('a',64),
    'I declare.', 'p/' || p_key, repeat('b',64), repeat('c',64), 1::smallint, NULL, 'Dana Levi', 'parent@x.test',
    'guardian', p_method, now(), NULL, 'ua', 'en', p_key, NULL, 'b0000000-0000-4000-8000-0000000000c3',
    NULL, true, p_details);
  PERFORM set_config('t.last_id', v::text, false);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE FUNCTION pg_temp.as_user(uid UUID) RETURNS VOID LANGUAGE sql AS
$$ SELECT set_config('request.jwt.claim.sub', uid::text, false) $$;

DO $$
DECLARE
  r TEXT;
  ev UUID;
  masked TEXT;
  d JSONB;
  bad JSONB;
BEGIN
  -- ── ID check digit ──
  IF NOT is_valid_israeli_id('123456782') THEN RAISE EXCEPTION 'FAIL valid ID rejected'; END IF;
  IF is_valid_israeli_id('123456789') THEN RAISE EXCEPTION 'FAIL bad check digit accepted'; END IF;
  IF is_valid_israeli_id('000000000') OR is_valid_israeli_id('1234') OR is_valid_israeli_id('12345678a') OR is_valid_israeli_id(NULL) THEN
    RAISE EXCEPTION 'FAIL malformed ID accepted';
  END IF;
  IF NOT is_valid_israeli_id('12345678-2') THEN RAISE EXCEPTION 'FAIL hyphenated ID rejected'; END IF;
  RAISE NOTICE 'ok  Israeli ID check digit';

  -- ── adult signs with valid details ──
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-adult', pg_temp.good());
  IF r <> 'ok' THEN RAISE EXCEPTION 'FAIL adult with valid details: %', r; END IF;
  ev := current_setting('t.last_id')::uuid;
  SELECT signer_id_masked, signer_details INTO masked, d FROM waiver_evidence WHERE id = ev;
  IF masked <> '••••••782' THEN RAISE EXCEPTION 'FAIL mask is %', masked; END IF;
  IF d -> 'signer' ->> 'id_number' <> '123456782' THEN RAISE EXCEPTION 'FAIL details not stored'; END IF;
  RAISE NOTICE 'ok  an adult signs with valid details; mask shows only the last 3 digits';

  -- ── typed signature without details, unticked, bad ID ──
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-none', NULL);
  IF r <> 'signer_details_required' THEN RAISE EXCEPTION 'FAIL missing details: %', r; END IF;
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-unticked', jsonb_set(pg_temp.good(), '{confirmed}', 'false'));
  IF r <> 'signer_details_required' THEN RAISE EXCEPTION 'FAIL unticked: %', r; END IF;
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-bad-id', pg_temp.good('123456789'));
  IF r <> 'signer_id_invalid' THEN RAISE EXCEPTION 'FAIL bad ID: %', r; END IF;
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-short-id', pg_temp.good('12345678'));
  IF r <> 'signer_id_invalid' THEN RAISE EXCEPTION 'FAIL unpadded ID must be rejected in the DB (the edge function pads): %', r; END IF;
  bad := jsonb_set(pg_temp.good(), '{signer,phone}', '"abc"');
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-phone', bad);
  IF r <> 'signer_details_invalid' THEN RAISE EXCEPTION 'FAIL phone: %', r; END IF;
  bad := jsonb_set(pg_temp.good(), '{signer,address}', '"x"');
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-addr', bad);
  IF r <> 'signer_details_invalid' THEN RAISE EXCEPTION 'FAIL address: %', r; END IF;
  IF (SELECT count(*) FROM waiver_evidence WHERE idempotency_key IN ('k-none','k-unticked','k-bad-id','k-short-id','k-phone','k-addr')) <> 0 THEN
    RAISE EXCEPTION 'FAIL a rejected signature left a row';
  END IF;
  RAISE NOTICE 'ok  missing, unticked, bad-ID, bad-phone and bad-address signatures are rejected and leave no row';

  -- ── passport path ──
  bad := jsonb_build_object('version',1,'confirmed',true,'confirmed_wording','ok',
    'signer', jsonb_build_object('full_name','Dana Levi','id_type','passport','id_number','AB1234567','passport_country','France',
                                 'phone','+33 1 23 45 67 89','address','1 Rue de Rivoli, Paris'));
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-pass', bad);
  IF r <> 'ok' THEN RAISE EXCEPTION 'FAIL passport: %', r; END IF;
  bad := bad #- '{signer,passport_country}';
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-pass2', bad);
  IF r <> 'signer_id_invalid' THEN RAISE EXCEPTION 'FAIL passport without country: %', r; END IF;
  RAISE NOTICE 'ok  a passport needs its country';

  -- ── minors need the child block ──
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c2', 'k-kid-nochild', pg_temp.good());
  IF r <> 'signer_child_required' THEN RAISE EXCEPTION 'FAIL minor without child block: %', r; END IF;
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c2', 'k-kid', pg_temp.good() || jsonb_build_object('child', pg_temp.kid_block()));
  IF r <> 'ok' THEN RAISE EXCEPTION 'FAIL minor with child block: %', r; END IF;
  -- exactly 18 today is inside the 2 day margin: not "clearly a minor"
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c5', 'k-edge', pg_temp.good());
  IF r <> 'ok' THEN RAISE EXCEPTION 'FAIL 18th birthday margin: %', r; END IF;
  RAISE NOTICE 'ok  a minor needs the child block; the 18th-birthday margin never blocks';

  -- ── admin upload does not need details ──
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-admin', NULL, 'admin_upload');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FAIL admin upload: %', r; END IF;
  IF (SELECT signer_id_masked FROM waiver_evidence WHERE id = current_setting('t.last_id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL admin upload got a mask';
  END IF;
  RAISE NOTICE 'ok  admin uploads need no signer details';

  -- ── idempotent replay returns the same row ──
  r := pg_temp.sign('c0000000-0000-4000-8000-0000000000c3', 'k-adult', pg_temp.good());
  IF r <> 'ok' OR current_setting('t.last_id')::uuid <> ev THEN RAISE EXCEPTION 'FAIL replay'; END IF;
  RAISE NOTICE 'ok  replaying the same idempotency key returns the original row';

  -- ── audit log carries no ID ──
  IF EXISTS (SELECT 1 FROM audit_log WHERE after_state::text LIKE '%123456782%') THEN
    RAISE EXCEPTION 'FAIL the ID number leaked into audit_log';
  END IF;
  IF EXISTS (SELECT 1 FROM waiver_events WHERE metadata::text LIKE '%123456782%') THEN
    RAISE EXCEPTION 'FAIL the ID number leaked into waiver_events';
  END IF;
  RAISE NOTICE 'ok  the ID number is not copied into audit_log or waiver_events';

  -- ── immutability still holds ──
  BEGIN
    UPDATE waiver_evidence SET signer_details = '{}' WHERE id = ev;
    RAISE EXCEPTION 'FAIL signer_details was updated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%immutable%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  signer_details cannot be changed after signing';

  -- ── who can read the full details ──
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c1');   -- admin of T1
  IF get_signed_record_details(ev) -> 'signer' ->> 'id_number' <> '123456782' THEN RAISE EXCEPTION 'FAIL admin cannot read'; END IF;
  -- the adult's record was signed via parent's member row (c1), so the parent is "own"
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c3');
  IF get_signed_record_details(ev) IS NULL THEN RAISE EXCEPTION 'FAIL signer cannot read own'; END IF;
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c4');   -- other family
  IF get_signed_record_details(ev) IS NOT NULL THEN RAISE EXCEPTION 'FAIL another family read the details'; END IF;
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c2');   -- admin of T2
  IF get_signed_record_details(ev) IS NOT NULL THEN RAISE EXCEPTION 'FAIL another studio read the details'; END IF;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF get_signed_record_details(ev) IS NOT NULL THEN RAISE EXCEPTION 'FAIL anonymous read the details'; END IF;
  RAISE NOTICE 'ok  only the studio admin and the signer''s own family can read the full details';

  -- ── pre-fill: last signer block of the caller ──
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c3');
  IF get_my_last_signer_details() ->> 'full_name' <> 'Dana Levi' THEN RAISE EXCEPTION 'FAIL pre-fill'; END IF;
  IF get_my_last_signer_details() ? 'child' THEN RAISE EXCEPTION 'FAIL pre-fill leaked a child block'; END IF;
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c4');
  IF get_my_last_signer_details() IS NOT NULL THEN RAISE EXCEPTION 'FAIL pre-fill leaked to another family'; END IF;
  RAISE NOTICE 'ok  pre-fill returns only the caller''s own latest signer block';
END $$;

-- ── pre-fill phone fallback: the caller's own stored phone when no earlier phone ──
DO $$
DECLARE d JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  -- "other" has never signed; their own household row holds a phone. The parent's
  -- person row also holds one, which "other" must never see.
  INSERT INTO contact_preferences (tenant_id, account_member_id, whatsapp_number) VALUES
   ('a0000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-0000000000c2','052-765-4321');
  INSERT INTO contact_preferences (tenant_id, person_id, whatsapp_number) VALUES
   ('a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c1','053-000-0000');

  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c4');
  d := get_my_last_signer_details();
  IF d IS DISTINCT FROM '{"phone":"052-765-4321"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL never-signed caller should get only their own stored phone, got %', d;
  END IF;

  -- The parent's last signed block already has a phone: it wins over the stored one.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c3');
  d := get_my_last_signer_details();
  IF d ->> 'phone' <> '+33 1 23 45 67 89' AND d ->> 'phone' <> '050-123-4567' THEN
    RAISE EXCEPTION 'FAIL signed phone was replaced by the stored one: %', d;
  END IF;
  IF d ->> 'full_name' <> 'Dana Levi' THEN RAISE EXCEPTION 'FAIL fallback changed the signed block'; END IF;

  -- An admin with no person/member row gets nothing, even though RLS would let them see every row.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000c1');
  IF get_my_last_signer_details() IS NOT NULL THEN RAISE EXCEPTION 'FAIL admin got someone else''s phone'; END IF;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF get_my_last_signer_details() IS NOT NULL THEN RAISE EXCEPTION 'FAIL anonymous got a phone'; END IF;
  RAISE NOTICE 'ok  pre-fill falls back to the caller''s own stored phone, never another person''s';
END $$;

-- ── column lock-down ──
DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.waiver_evidence', 'signer_details', 'SELECT')
     OR has_column_privilege('anon', 'public.waiver_evidence', 'signer_details', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL signer_details readable by a client role';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.waiver_evidence', 'signer_id_masked', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.waiver_evidence', 'signed_at', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL ordinary waiver_evidence columns lost their grant';
  END IF;
  IF has_function_privilege('anon', 'get_signed_record_details(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'get_my_last_signer_details()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute the readers';
  END IF;
  RAISE NOTICE 'ok  signer_details is locked down; lists keep the other columns';
END $$;
