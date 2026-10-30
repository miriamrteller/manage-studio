-- search_enrolment_students as the tenant admin of tenant ...0001.
-- Alice keeps her phone only in contact_preferences.whatsapp_number (how
-- job_store_client_phone stores photographer clients); Bob keeps his in
-- people.emergency_contact_phone (the original dance-era field).
-- Ari shares Alice's family account ("Alice & Ari"), so name/email searches
-- that hit the account name or guardian email return both — existing behaviour.
INSERT INTO contact_preferences (tenant_id, person_id, whatsapp_number)
VALUES ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', '+972 54-123-4567');
UPDATE people SET emergency_contact_phone = '052-987-6543'
WHERE id = 'c0000000-0000-4000-8000-00000000000b';

SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000e', false);

DO $$
DECLARE
  t RECORD;
  v JSONB;
  names TEXT[];
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('ali',           ARRAY['Alice','Ari'],        'partial name (3 letters)'),
    ('ALI',           ARRAY['Alice','Ari'],        'partial name, upper case'),
    ('lic',           ARRAY['Alice','Ari'],        'partial name, middle of word'),
    ('alice@x.test',  ARRAY['Alice','Ari'],        'email'),
    ('1234567',       ARRAY['Alice'],        'WhatsApp digits'),
    ('054-123',       ARRAY['Alice'],        'local 054 form matches stored +972 WhatsApp'),
    ('054 123 4567',  ARRAY['Alice'],        'full local number with spaces'),
    ('+972541234567', ARRAY['Alice'],        'international form'),
    ('987654',        ARRAY['Bob'],          'emergency-contact phone still matches'),
    ('+972 52 987',   ARRAY['Bob'],          'international form finds locally stored 052…'),
    ('972529876543',  ARRAY['Bob'],          'full international digits find local number'),
    ('bob',           ARRAY['Bob'],          'name still matches'),
    ('dina',          ARRAY[]::TEXT[],       'other tenant never returned'),
    ('xyz',           ARRAY[]::TEXT[],       'unrelated text finds nothing')
  ) AS x(q, expected, label)
  LOOP
    v := search_enrolment_students(t.q, 15);
    SELECT COALESCE(array_agg(e->'person'->>'name' ORDER BY e->'person'->>'name'), ARRAY[]::TEXT[])
      INTO names FROM jsonb_array_elements(v) e;
    IF names IS DISTINCT FROM t.expected THEN
      RAISE EXCEPTION 'FAIL %: query % returned %, expected %', t.label, t.q, names, t.expected;
    END IF;
    RAISE NOTICE 'ok  %', t.label;
  END LOOP;
END $$;

SELECT 'client search: all checks passed' AS result;
