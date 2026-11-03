-- link_my_guardian_accounts(). Fixture (tenant T1 = a0..01, tenant T2 = a0..02):
--   Nora   confirmed login in T1, mixed-case email with spaces in auth; family row
--          (account_holder, user_profile_id NULL) whose person email is lower case.
--   Uma    login in T1 with an UNCONFIRMED email; family row with that email.
--   Tess   confirmed login in T2 whose email matches a family row that is in T1.
--   Lena   confirmed login in T1; her family row is already linked to someone else.
--   Maya   confirmed login in T1; TWO unlinked rows for her person (holder + member).
--   Pia    confirmed login in T1; her row has role 'billing' (not a guardian role).
--   Quinn  confirmed login in T1 with no family rows at all.
SET session_replication_role = replica;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
 ('b0000000-0000-4000-8000-0000000000a1','  Nora@X.test ', now()),
 ('b0000000-0000-4000-8000-0000000000a2','uma@x.test', NULL),
 ('b0000000-0000-4000-8000-0000000000a3','tess@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000a4','lena@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000a5','maya@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000a6','pia@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000a7','quinn@x.test', now()),
 ('b0000000-0000-4000-8000-0000000000a8','other-owner@x.test', now());
INSERT INTO user_profiles (id, tenant_id, role, email) VALUES
 ('b0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-000000000001','{account_holder}','nora@x.test'),
 ('b0000000-0000-4000-8000-0000000000a2','a0000000-0000-4000-8000-000000000001','{account_holder}','uma@x.test'),
 ('b0000000-0000-4000-8000-0000000000a3','a0000000-0000-4000-8000-000000000002','{account_holder}','tess@x.test'),
 ('b0000000-0000-4000-8000-0000000000a4','a0000000-0000-4000-8000-000000000001','{account_holder}','lena@x.test'),
 ('b0000000-0000-4000-8000-0000000000a5','a0000000-0000-4000-8000-000000000001','{account_holder}','maya@x.test'),
 ('b0000000-0000-4000-8000-0000000000a6','a0000000-0000-4000-8000-000000000001','{account_holder}','pia@x.test'),
 ('b0000000-0000-4000-8000-0000000000a7','a0000000-0000-4000-8000-000000000001','{account_holder}','quinn@x.test'),
 ('b0000000-0000-4000-8000-0000000000a8','a0000000-0000-4000-8000-000000000001','{account_holder}','other-owner@x.test');

INSERT INTO people (id, tenant_id, name, email) VALUES
 ('c0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-000000000001','Nora','nora@x.test'),
 ('c0000000-0000-4000-8000-0000000000a2','a0000000-0000-4000-8000-000000000001','Uma','uma@x.test'),
 ('c0000000-0000-4000-8000-0000000000a3','a0000000-0000-4000-8000-000000000001','Tess','tess@x.test'),
 ('c0000000-0000-4000-8000-0000000000a4','a0000000-0000-4000-8000-000000000001','Lena','lena@x.test'),
 ('c0000000-0000-4000-8000-0000000000a5','a0000000-0000-4000-8000-000000000001','Maya','maya@x.test'),
 ('c0000000-0000-4000-8000-0000000000a6','a0000000-0000-4000-8000-000000000001','Pia','pia@x.test');
INSERT INTO accounts (id, tenant_id, name, person_id) VALUES
 ('d0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-000000000001','Nora family','c0000000-0000-4000-8000-0000000000a1'),
 ('d0000000-0000-4000-8000-0000000000a2','a0000000-0000-4000-8000-000000000001','Uma family','c0000000-0000-4000-8000-0000000000a2'),
 ('d0000000-0000-4000-8000-0000000000a3','a0000000-0000-4000-8000-000000000001','Tess family','c0000000-0000-4000-8000-0000000000a3'),
 ('d0000000-0000-4000-8000-0000000000a4','a0000000-0000-4000-8000-000000000001','Lena family','c0000000-0000-4000-8000-0000000000a4'),
 ('d0000000-0000-4000-8000-0000000000a5','a0000000-0000-4000-8000-000000000001','Maya family','c0000000-0000-4000-8000-0000000000a5'),
 ('d0000000-0000-4000-8000-0000000000a6','a0000000-0000-4000-8000-000000000001','Pia family','c0000000-0000-4000-8000-0000000000a6');

INSERT INTO account_members (id, tenant_id, account_id, person_id, role, user_profile_id) VALUES
 ('e1000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a1','c0000000-0000-4000-8000-0000000000a1','account_holder', NULL),
 ('e1000000-0000-4000-8000-0000000000a2','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a2','c0000000-0000-4000-8000-0000000000a2','account_holder', NULL),
 ('e1000000-0000-4000-8000-0000000000a3','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a3','c0000000-0000-4000-8000-0000000000a3','account_holder', NULL),
 ('e1000000-0000-4000-8000-0000000000a4','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a4','c0000000-0000-4000-8000-0000000000a4','account_holder', 'b0000000-0000-4000-8000-0000000000a8'),
 ('e1000000-0000-4000-8000-0000000000a5','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a5','c0000000-0000-4000-8000-0000000000a5','account_holder', NULL),
 ('e1000000-0000-4000-8000-0000000000b5','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a5','c0000000-0000-4000-8000-0000000000a5','member', NULL),
 ('e1000000-0000-4000-8000-0000000000a6','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a6','c0000000-0000-4000-8000-0000000000a6','billing', NULL);
SET session_replication_role = origin;

CREATE FUNCTION pg_temp.as_user(uid UUID) RETURNS VOID LANGUAGE sql AS
$$ SELECT set_config('request.jwt.claim.sub', uid::text, false) $$;

CREATE FUNCTION pg_temp.linked_to(member_id UUID) RETURNS UUID LANGUAGE sql AS
$$ SELECT user_profile_id FROM account_members WHERE id = member_id $$;

DO $$
DECLARE
  n INT;
  audits INT;
BEGIN
  -- 1. Confirmed email, matched case-insensitively and trimmed: linked, audited.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000a1');
  n := link_my_guardian_accounts();
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL confirmed email: linked % rows, expected 1', n; END IF;
  IF pg_temp.linked_to('e1000000-0000-4000-8000-0000000000a1') IS DISTINCT FROM 'b0000000-0000-4000-8000-0000000000a1' THEN
    RAISE EXCEPTION 'FAIL confirmed email: row not linked to the caller';
  END IF;
  SELECT count(*) INTO audits FROM audit_log
   WHERE entity_type = 'account_members' AND entity_id = 'e1000000-0000-4000-8000-0000000000a1'
     AND actor_id = 'b0000000-0000-4000-8000-0000000000a1';
  IF audits <> 1 THEN RAISE EXCEPTION 'FAIL audit: % audit rows, expected 1', audits; END IF;
  RAISE NOTICE 'ok  confirmed email (mixed case, spaces) links the family row and writes an audit row';

  -- 2. Running it again changes nothing.
  n := link_my_guardian_accounts();
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL repeat call linked % rows', n; END IF;
  SELECT count(*) INTO audits FROM audit_log WHERE entity_id = 'e1000000-0000-4000-8000-0000000000a1';
  IF audits <> 1 THEN RAISE EXCEPTION 'FAIL repeat call wrote extra audit rows'; END IF;
  RAISE NOTICE 'ok  a second call links nothing and writes no extra audit';

  -- 3. Unconfirmed email: never linked.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000a2');
  n := link_my_guardian_accounts();
  IF n <> 0 OR pg_temp.linked_to('e1000000-0000-4000-8000-0000000000a2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL unconfirmed email was linked (n=%)', n;
  END IF;
  RAISE NOTICE 'ok  an unconfirmed email links nothing';

  -- 4. Different tenant: the matching family row is in T1, the login is in T2.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000a3');
  n := link_my_guardian_accounts();
  IF n <> 0 OR pg_temp.linked_to('e1000000-0000-4000-8000-0000000000a3') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL cross-tenant row was linked (n=%)', n;
  END IF;
  RAISE NOTICE 'ok  a login in another studio never links this studio''s family';

  -- 5. Already linked to someone else: never overwritten.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000a4');
  n := link_my_guardian_accounts();
  IF n <> 0 OR pg_temp.linked_to('e1000000-0000-4000-8000-0000000000a4') IS DISTINCT FROM 'b0000000-0000-4000-8000-0000000000a8' THEN
    RAISE EXCEPTION 'FAIL an existing link was changed (n=%)', n;
  END IF;
  RAISE NOTICE 'ok  an existing link is never overwritten';

  -- 6. Two unlinked rows for the same person: both are linked.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000a5');
  n := link_my_guardian_accounts();
  IF n <> 2
     OR pg_temp.linked_to('e1000000-0000-4000-8000-0000000000a5') IS DISTINCT FROM 'b0000000-0000-4000-8000-0000000000a5'
     OR pg_temp.linked_to('e1000000-0000-4000-8000-0000000000b5') IS DISTINCT FROM 'b0000000-0000-4000-8000-0000000000a5' THEN
    RAISE EXCEPTION 'FAIL two matching rows: linked % rows', n;
  END IF;
  SELECT count(*) INTO audits FROM audit_log WHERE entity_id IN ('e1000000-0000-4000-8000-0000000000a5','e1000000-0000-4000-8000-0000000000b5');
  IF audits <> 2 THEN RAISE EXCEPTION 'FAIL two matching rows: % audit rows', audits; END IF;
  RAISE NOTICE 'ok  two matching rows are both linked and both audited';

  -- 7. A role that is not a guardian role is left alone.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000a6');
  n := link_my_guardian_accounts();
  IF n <> 0 OR pg_temp.linked_to('e1000000-0000-4000-8000-0000000000a6') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a non-guardian role was linked (n=%)', n;
  END IF;
  RAISE NOTICE 'ok  roles other than account_holder / member are not linked';

  -- 8. No family rows for this email: returns 0, no error.
  PERFORM pg_temp.as_user('b0000000-0000-4000-8000-0000000000a7');
  n := link_my_guardian_accounts();
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL stranger linked % rows', n; END IF;
  RAISE NOTICE 'ok  a login with no family returns 0';

  -- 9. Nobody signed in.
  PERFORM set_config('request.jwt.claim.sub', '', false);
  BEGIN
    PERFORM link_my_guardian_accounts();
    RAISE EXCEPTION 'FAIL anonymous call was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Authentication required' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  a call with no signed-in user is refused';

  -- 10. Grants: authenticated only.
  IF has_function_privilege('anon', 'public.link_my_guardian_accounts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute link_my_guardian_accounts';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.link_my_guardian_accounts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute link_my_guardian_accounts';
  END IF;
  RAISE NOTICE 'ok  EXECUTE is granted to authenticated only';
END $$;

SELECT 'guardian link: all checks passed' AS result;
