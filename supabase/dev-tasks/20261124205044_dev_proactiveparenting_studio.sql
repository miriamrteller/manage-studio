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
-- Login: owner@proactiveparenting.test / devPassword123 (tenant_admin of proactiveparenting).

-- 1. The skin, as data (what /platform/skins edits). Colours: deep sage teal (calm, steady,
--    trustworthy; 6.2:1 with white text) and a soft apricot accent (warm, caring). Live, because a
--    studio can only be on a live skin. Its default switches are Appointments only, so a new
--    studio on this skin starts the same way.
INSERT INTO verticals (id, display_name, name_en, name_he, hint_en, hint_he, status,
                       default_switches, colours, sort_order)
VALUES (
  'parenting-coach', 'Parenting coach', 'Parenting coach', 'הדרכת הורים',
  'One-to-one sessions booked online', 'פגישות אישיות שנקבעות אונליין',
  'live',
  '{"payment_flow":"recurring","teaches_classes":false,"family_accounts":false,"client_booking":true}'::jsonb,
  '{"primary":"#2E6B63","accent":"#F6D3B3"}'::jsonb,
  40
)
ON CONFLICT (id) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_he = EXCLUDED.name_he,
  hint_en = EXCLUDED.hint_en,
  hint_he = EXCLUDED.hint_he,
  status = EXCLUDED.status,
  default_switches = EXCLUDED.default_switches,
  colours = EXCLUDED.colours;

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

-- 5. Check: 1 row each = the owner is tenant_admin of the studio, the studio is Appointments only
--    on the soft font pair, and it has 10 booking-hour rows (5 days x 2).
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@proactiveparenting.test' AND t.subdomain = 'proactiveparenting'
   AND 'tenant_admin' = ANY (p.role)
   AND u.encrypted_password = extensions.crypt('devPassword123', u.encrypted_password);
SELECT 1 FROM public.tenants
 WHERE subdomain = 'proactiveparenting' AND skin = 'parenting-coach' AND font_pair = 'soft'
   AND client_booking AND NOT teaches_classes AND NOT family_accounts AND payment_flow = 'recurring';
SELECT 1 FROM public.tenants t
 WHERE t.subdomain = 'proactiveparenting'
   AND (SELECT count(*) FROM public.tenant_scheduling_hours h WHERE h.tenant_id = t.id AND h.is_active) = 10;
