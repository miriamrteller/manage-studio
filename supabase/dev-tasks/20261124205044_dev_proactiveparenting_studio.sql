-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- ProactiveParenting dev studio: a parenting coach who works by appointment.
-- Owner ask (24 Nov 2026): a new dev studio, "How do clients work with you?" = Appointments,
-- default booking hours Sunday to Thursday 09:00-14:00 and 20:00-22:00, 1-hour slots
-- (Asia/Jerusalem, which every booking function uses).
--
-- Idempotent: safe to re-run. Made-up .test address only (the repository is public).
--
-- What the studio shows comes from its feature set: the skin row and the studio's business
-- profile (Appointments only) decide the features, as for any studio set up in the wizard.
--
-- Logins (password devPassword123): owner@proactiveparenting.test (tenant_admin) and
-- client@proactiveparenting.test (a client of the studio, like the other dev studios' test clients).

-- 1. The skin, as data (what /platform/skins edits). Colours: deep sage teal (calm, steady,
--    trustworthy; 6.2:1 with white text) and a soft apricot accent (warm, caring). Live, because a
--    studio can only be on a live skin. Its default switches are Appointments only, so a new
--    studio on this skin starts the same way. Legal add-on: the existing "coaching" one (no new
--    wording).
INSERT INTO verticals (id, display_name, name_en, name_he, hint_en, hint_he, status,
                       default_switches, colours, legal_addon, sort_order)
VALUES (
  'parenting-coach', 'Parenting coach', 'Parenting coach', 'הדרכת הורים',
  'One-to-one sessions booked online', 'פגישות אישיות שנקבעות אונליין',
  'live',
  '{"payment_flow":"recurring","teaches_classes":false,"family_accounts":false,"client_booking":true}'::jsonb,
  '{"primary":"#2E6B63","accent":"#F6D3B3"}'::jsonb,
  'coaching',
  40
)
ON CONFLICT (id) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_he = EXCLUDED.name_he,
  hint_en = EXCLUDED.hint_en,
  hint_he = EXCLUDED.hint_he,
  status = EXCLUDED.status,
  default_switches = EXCLUDED.default_switches,
  colours = EXCLUDED.colours,
  legal_addon = EXCLUDED.legal_addon;

-- 2. The owner login, the studio, its look and its business profile.
DO $$
DECLARE
  v_owner  UUID;
  v_tenant UUID;
BEGIN
  SELECT id INTO v_owner FROM auth.users WHERE lower(email) = 'owner@proactiveparenting.test' LIMIT 1;
  IF v_owner IS NULL THEN
    v_owner := 'aaaaaaaa-0000-0000-0000-000000000015'::uuid;
    -- Full auth row + identity with '' token columns: GoTrue refuses password logins when the
    -- token columns are NULL or the identity is missing (as in the other dev studio seeds).
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      v_owner, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
      'owner@proactiveparenting.test', extensions.crypt('devPassword123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_owner AND provider = 'email') THEN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_owner,
            jsonb_build_object('sub', v_owner::text, 'email', 'owner@proactiveparenting.test', 'email_verified', true),
            'email', v_owner::text, now(), now(), now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'proactiveparenting') THEN
    -- Links the owner as tenant_admin and adds the default expense categories.
    PERFORM provision_tenant(
      p_name        := 'ProactiveParenting',
      p_subdomain   := 'proactiveparenting',
      p_plan        := 'essential',
      p_vertical    := 'parenting-coach',
      p_owner_email := 'owner@proactiveparenting.test',
      p_owner_id    := v_owner
    );
  END IF;

  -- The business profile is what the wizard and Settings > Your business save
  -- ("How do clients work with you?" = Appointments only, see workModes.ts profileOf).
  -- Font pair "soft": Varela Round headings, Poppins / Assistant body, all with Hebrew.
  UPDATE tenants SET
    name             = 'ProactiveParenting',
    business_preset  = 'services',
    primary_color    = '#2E6B63',
    accent_color     = '#F6D3B3',
    font_pair        = 'soft',
    language_default = 'he',
    payment_flow     = 'recurring',
    teaches_classes  = false,
    family_accounts  = false,
    client_booking   = true,
    updated_at       = now()
  WHERE subdomain = 'proactiveparenting'
  RETURNING id INTO v_tenant;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ProactiveParenting studio was not made';
  END IF;

  -- 3. Online booking: 1-hour slots, no gap, from tomorrow (24 hours' notice), 60 days ahead.
  INSERT INTO tenant_scheduling_settings (tenant_id, buffer_mins, slot_duration_mins, advance_notice_hrs,
                                          booking_window_days, is_booking_enabled)
  VALUES (v_tenant, 0, 60, 24, 60, true)
  ON CONFLICT (tenant_id) DO UPDATE SET
    buffer_mins = EXCLUDED.buffer_mins,
    slot_duration_mins = EXCLUDED.slot_duration_mins,
    is_booking_enabled = EXCLUDED.is_booking_enabled,
    updated_at = now();

  -- Booking hours: Sunday (0) to Thursday (4), mornings 09:00-14:00 and evenings 20:00-22:00.
  DELETE FROM tenant_scheduling_hours WHERE tenant_id = v_tenant;
  INSERT INTO tenant_scheduling_hours (tenant_id, day_of_week, start_time, end_time, is_active)
  SELECT v_tenant, d, h.s, h.e, true
    FROM generate_series(0, 4) AS d
   CROSS JOIN (VALUES (TIME '09:00', TIME '14:00'), (TIME '20:00', TIME '22:00')) AS h(s, e);

  -- 4. One bookable session, so the booking page has something to book (1 hour, one client).
  INSERT INTO offerings (
    id, tenant_id, season_id, category_id, name,
    offering_type, duration_mins, day_of_week, start_time, end_time,
    min_age, max_age, max_capacity, price_minor, currency,
    delivery_mode, billing_mode, is_public, status
  )
  VALUES (
    '60000000-0000-0000-0000-000000000301'::uuid, v_tenant, NULL, NULL,
    'Parent coaching session / פגישת הדרכת הורים',
    'appointment', 60, NULL, NULL, NULL,
    NULL, NULL, 1, 35000, 'ILS',
    'scheduled', 'one_time', true, 'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    offering_type = EXCLUDED.offering_type,
    duration_mins = EXCLUDED.duration_mins,
    max_capacity = EXCLUDED.max_capacity,
    price_minor = EXCLUDED.price_minor,
    is_public = EXCLUDED.is_public,
    status = EXCLUDED.status;
END $$;

-- 5. Test client login, as 20261115065918 did for the other dev studios: the login, and a client
--    record of the studio (person + billing account) linked to it. No booking.
DO $$
DECLARE
  v_tenant  UUID;
  v_uid     UUID;
  v_person  UUID;
  v_account UUID;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE subdomain = 'proactiveparenting';

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'client@proactiveparenting.test';
  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    -- The new-login trigger gives the profile this studio's client role (from the subdomain).
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (v_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
            'client@proactiveparenting.test', extensions.crypt('devPassword123', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{"subdomain":"proactiveparenting"}'::jsonb,
            now(), now(), '', '', '', '');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email') THEN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id,
                                 last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', 'client@proactiveparenting.test', 'email_verified', true),
            'email', v_uid::text, now(), now(), now());
  END IF;

  -- Only a login of this studio becomes its test client.
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = v_uid AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'client@proactiveparenting.test is not a login of proactiveparenting';
  END IF;

  SELECT id INTO v_person FROM public.people
   WHERE tenant_id = v_tenant AND lower(email) = 'client@proactiveparenting.test' ORDER BY created_at LIMIT 1;
  IF v_person IS NULL THEN
    INSERT INTO public.people (tenant_id, name, email, status, user_profile_id)
    VALUES (v_tenant, 'Test Client', 'client@proactiveparenting.test', 'active', v_uid)
    RETURNING id INTO v_person;
  ELSE
    UPDATE public.people SET user_profile_id = v_uid, updated_at = now()
     WHERE id = v_person AND user_profile_id IS NULL;
  END IF;

  SELECT account_id INTO v_account FROM public.people WHERE id = v_person;
  IF v_account IS NULL THEN
    INSERT INTO public.accounts (tenant_id, name, person_id)
    VALUES (v_tenant, 'Test Client', v_person)
    RETURNING id INTO v_account;
    UPDATE public.people SET account_id = v_account, updated_at = now() WHERE id = v_person;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_members WHERE account_id = v_account AND person_id = v_person) THEN
    INSERT INTO public.account_members (tenant_id, account_id, person_id, role, user_profile_id)
    VALUES (v_tenant, v_account, v_person, 'account_holder', v_uid);
  END IF;

  UPDATE public.user_profiles SET person_id = v_person, updated_at = now()
   WHERE id = v_uid AND person_id IS NULL;
END $$;

-- 6. Check: 1 row each = the owner is tenant_admin of the studio, the studio is Appointments only
--    on the soft font pair with the coaching add-on, it has 10 booking-hour rows (5 days x 2), and
--    the test client is linked to a client record of the studio.
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@proactiveparenting.test' AND t.subdomain = 'proactiveparenting'
   AND 'tenant_admin' = ANY (p.role)
   AND u.encrypted_password = extensions.crypt('devPassword123', u.encrypted_password);
SELECT 1 FROM public.tenants
 WHERE subdomain = 'proactiveparenting' AND skin = 'parenting-coach' AND font_pair = 'soft'
   AND client_booking AND NOT teaches_classes AND NOT family_accounts AND payment_flow = 'recurring'
   AND EXISTS (SELECT 1 FROM public.verticals v WHERE v.id = 'parenting-coach' AND v.legal_addon = 'coaching');
SELECT 1 FROM public.tenants t
 WHERE t.subdomain = 'proactiveparenting'
   AND (SELECT count(*) FROM public.tenant_scheduling_hours h WHERE h.tenant_id = t.id AND h.is_active) = 10;
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
  JOIN public.people pe ON pe.id = p.person_id AND pe.tenant_id = t.id AND pe.account_id IS NOT NULL
 WHERE lower(u.email) = 'client@proactiveparenting.test' AND t.subdomain = 'proactiveparenting';
