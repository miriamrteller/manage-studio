-- Fixture: photographer tenant with two clients (Alice + her partner Ari share
-- one account; Bob is another client), a photographer admin, and a dance
-- tenant parent (Dina). One shoot each for Alice and Bob.
SET session_replication_role = replica;  -- skip auth.users → user_profiles trigger; profiles inserted below
-- Photographer tenant P, dance tenant D
INSERT INTO tenants (id, name, subdomain, contact_email, skin, business_preset) VALUES
 ('a0000000-0000-4000-8000-000000000001','Photo','photo','p@x.test','photographer','services'),
 ('a0000000-0000-4000-8000-000000000002','Dance','dance','d@x.test','generic','programs');
INSERT INTO auth.users (id, email) VALUES
 ('b0000000-0000-4000-8000-00000000000a','alice@x.test'),   -- client A (account holder)
 ('b0000000-0000-4000-8000-00000000000c','ari@x.test'),     -- A's partner, member of A's account
 ('b0000000-0000-4000-8000-00000000000b','bob@x.test'),     -- client B, same tenant
 ('b0000000-0000-4000-8000-00000000000d','dina@x.test'),    -- dance parent, other tenant
 ('b0000000-0000-4000-8000-00000000000e','admin@x.test');   -- photographer admin
INSERT INTO user_profiles (id, tenant_id, role, email) VALUES
 ('b0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-000000000001','{account_holder}','alice@x.test'),
 ('b0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000001','{account_holder}','ari@x.test'),
 ('b0000000-0000-4000-8000-00000000000b','a0000000-0000-4000-8000-000000000001','{account_holder}','bob@x.test'),
 ('b0000000-0000-4000-8000-00000000000d','a0000000-0000-4000-8000-000000000002','{account_holder}','dina@x.test'),
 ('b0000000-0000-4000-8000-00000000000e','a0000000-0000-4000-8000-000000000001','{tenant_admin}','admin@x.test');
INSERT INTO people (id, tenant_id, name, email, user_profile_id) VALUES
 ('c0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-000000000001','Alice','alice@x.test','b0000000-0000-4000-8000-00000000000a'),
 ('c0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-000000000001','Ari','ari@x.test','b0000000-0000-4000-8000-00000000000c'),
 ('c0000000-0000-4000-8000-00000000000b','a0000000-0000-4000-8000-000000000001','Bob','bob@x.test','b0000000-0000-4000-8000-00000000000b'),
 ('c0000000-0000-4000-8000-00000000000d','a0000000-0000-4000-8000-000000000002','Dina','dina@x.test','b0000000-0000-4000-8000-00000000000d');
INSERT INTO accounts (id, tenant_id, name, person_id) VALUES
 ('d0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-000000000001','Alice & Ari','c0000000-0000-4000-8000-00000000000a'),
 ('d0000000-0000-4000-8000-00000000000b','a0000000-0000-4000-8000-000000000001','Bob','c0000000-0000-4000-8000-00000000000b'),
 ('d0000000-0000-4000-8000-00000000000d','a0000000-0000-4000-8000-000000000002','Dina','c0000000-0000-4000-8000-00000000000d');
UPDATE people SET account_id = 'd0000000-0000-4000-8000-00000000000a' WHERE id IN ('c0000000-0000-4000-8000-00000000000a','c0000000-0000-4000-8000-00000000000c');
UPDATE people SET account_id = 'd0000000-0000-4000-8000-00000000000b' WHERE id = 'c0000000-0000-4000-8000-00000000000b';
UPDATE people SET account_id = 'd0000000-0000-4000-8000-00000000000d' WHERE id = 'c0000000-0000-4000-8000-00000000000d';
INSERT INTO account_members (tenant_id, account_id, person_id, role, user_profile_id) VALUES
 ('a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-00000000000a','c0000000-0000-4000-8000-00000000000a','account_holder','b0000000-0000-4000-8000-00000000000a'),
 ('a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-00000000000a','c0000000-0000-4000-8000-00000000000c','member','b0000000-0000-4000-8000-00000000000c'),
 ('a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-00000000000b','c0000000-0000-4000-8000-00000000000b','account_holder','b0000000-0000-4000-8000-00000000000b'),
 ('a0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-00000000000d','c0000000-0000-4000-8000-00000000000d','account_holder','b0000000-0000-4000-8000-00000000000d');
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins) VALUES
 ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Wedding','appointment',120),
 ('e0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','Ballet','appointment',60);
INSERT INTO engagements (id, tenant_id, person_id, offering_id, status, booked_starts_at, booked_ends_at) VALUES
 ('f0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-000000000001','active', now() + interval '30 days', now() + interval '30 days 2 hours'),
 ('f0000000-0000-4000-8000-00000000000b','a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000000b','e0000000-0000-4000-8000-000000000001','active', now() + interval '40 days', now() + interval '40 days 2 hours'),
 ('f0000000-0000-4000-8000-00000000000d','a0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-00000000000d','e0000000-0000-4000-8000-000000000002','active', NULL, NULL);
INSERT INTO job_details (engagement_id, tenant_id, job_status, location, notes, gallery_url) VALUES
 ('f0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-000000000001','booked','Jaffa','admin-only note A','https://gallery/A'),
 ('f0000000-0000-4000-8000-00000000000b','a0000000-0000-4000-8000-000000000001','booked','Haifa','admin-only note B','https://gallery/B');
INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor) VALUES
 ('a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-00000000000a','Deposit A',100000),
 ('a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-00000000000b','Deposit B',200000);
SET session_replication_role = origin;
