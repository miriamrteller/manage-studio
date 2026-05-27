-- Link an existing Supabase Auth user to seeded parent data (hosted projects).
--
-- 1. Create auth user in Dashboard OR: node scripts/seed-auth-parent.mjs
-- 2. Replace :auth_user_id below with the real UUID from Authentication → Users
-- 3. Run this script, then re-run the parent block in supabase/seed.sql if needed

\set auth_user_id '00000000-0000-0000-0000-000000000510'
\set tenant_id '00000000-0000-0000-0000-000000000001'

INSERT INTO user_profiles (id, tenant_id, role, email, language, country)
SELECT
  :'auth_user_id'::uuid,
  :'tenant_id'::uuid,
  ARRAY['parent', 'guardian']::text[],
  'miriamrstern@gmail.com',
  'he',
  'IL'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = :'auth_user_id'::uuid)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  language = EXCLUDED.language,
  country = EXCLUDED.country;

UPDATE family_members
SET
  user_profile_id = :'auth_user_id'::uuid,
  email = 'miriamrstern@gmail.com',
  name = 'Miriam R Stern',
  phone = '0505550101'
WHERE id IN (
  '00000000-0000-0000-0000-000000000701'::uuid,
  '00000000-0000-0000-0000-000000000702'::uuid
);

UPDATE families
SET
  contact_person_name = 'Miriam R Stern',
  contact_email = 'miriamrstern@gmail.com',
  contact_phone = '0548421987'
WHERE id IN (
  '00000000-0000-0000-0000-000000000401'::uuid,
  '00000000-0000-0000-0000-000000000402'::uuid
);

UPDATE people
SET user_profile_id = :'auth_user_id'::uuid
WHERE id = '00000000-0000-0000-0000-000000000504'::uuid;
