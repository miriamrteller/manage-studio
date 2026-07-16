-- =============================================================================
-- 002500: Feature flag system
-- feature_definitions, tenant_feature_overrides, get_tenant_features(),
-- provision_tenant(), get_tenant_config_by_subdomain() (final).
-- verticals + tenant_plan already created in 000200.
-- Includes native scheduling + Google Calendar feature seeds (ex-03100/03200).
-- DEPENDENCIES: 000200, 001600, 002400
-- =============================================================================

-- =============================================================================
-- STEP 4 — feature_definitions
-- tier_minimum: minimum plan required for auto-inclusion by get_tenant_features().
-- skin_restriction: NULL = all verticals; a vertical id = that vertical only.
-- No enabled_by_default column — plan + skin determine auto-inclusion via the resolver.
-- =============================================================================
CREATE TABLE feature_definitions (
  key            TEXT        PRIMARY KEY,
  description    TEXT        NOT NULL,
  tier_minimum   tenant_plan NOT NULL,
  skin_restriction TEXT      REFERENCES verticals(id),  -- NULL = all verticals
  deprecated_at  TIMESTAMPTZ,
  successor_key  TEXT        REFERENCES feature_definitions(key),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- STEP 5 — tenant_feature_overrides (join table)
-- One row per tenant+feature. is_enabled = true grants; false revokes.
-- =============================================================================
CREATE TABLE tenant_feature_overrides (
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key  TEXT        NOT NULL REFERENCES feature_definitions(key),
  is_enabled   BOOLEAN     NOT NULL DEFAULT true,
  set_by       TEXT        NOT NULL DEFAULT 'admin'
               CHECK (set_by IN ('admin', 'system', 'operator')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

CREATE INDEX idx_tfo_tenant ON tenant_feature_overrides(tenant_id);

-- RLS
ALTER TABLE feature_definitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY fd_read_all   ON feature_definitions      FOR SELECT USING (true);
CREATE POLICY fd_super_admin ON feature_definitions     FOR ALL    USING (is_super_admin());
CREATE POLICY tfo_super_admin ON tenant_feature_overrides FOR ALL  USING (is_super_admin());
CREATE POLICY tfo_admin_read  ON tenant_feature_overrides FOR SELECT
  USING (tenant_id = get_my_tenant_id());

GRANT SELECT ON feature_definitions      TO authenticated, anon;
GRANT SELECT ON tenant_feature_overrides TO authenticated;

-- =============================================================================
-- STEP 6 — seed feature_definitions
-- tier_minimum: 'essential' = both plans auto-include; 'professional' = professional only.
-- skin_restriction: NULL = all verticals; vertical id = that vertical only.
-- IMPORTANT: skin_restriction values must be valid verticals.id — never plan enum literals.
-- =============================================================================
INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction) VALUES

  -- ── Platform ──────────────────────────────────────────────────────────────
  ('platform:admin.super',           'Super-admin dashboard access',                       'professional', NULL),
  ('platform:domains.custom',        'Custom domain support',                              'professional', NULL),
  ('platform:themes.customize',      'Visual theme customization',                         'professional', NULL),

  -- ── People ────────────────────────────────────────────────────────────────
  -- families.manage: professional plan; applies to dance-studio primary use case
  ('people:families.manage',         'Family and account relationship management',          'professional', NULL),

  -- ── Offerings ─────────────────────────────────────────────────────────────
  ('offerings:structure.configure',  'Level, term, and session configuration',             'professional', NULL),
  ('offerings:booking.public',       'Public self-service booking pages',                  'professional', NULL),

  -- ── Scheduling ────────────────────────────────────────────────────────────
  -- Cal.com appointments: essential tier → auto-on for both plans from the base query.
  -- Professional tenants also receive it automatically (professional gets all essential features).
  -- Future: add professional_auto_exclude flag to feature_definitions to support
  -- true "professional opt-in only" without schema-breaking changes.
  ('scheduling:appointments.calcom', 'Cal.com appointment scheduling',                     'essential',    NULL),
  ('scheduling:atoms.platform',      'Cal.com Platform Atoms integration',                 'professional', NULL),
  ('scheduling:penalties.capture',   'No-show and late cancellation fee capture',          'professional', NULL),
  ('scheduling:ai.assistant',        'AI-powered scheduling assistant',                    'professional', NULL),

  -- ── Billing ───────────────────────────────────────────────────────────────
  ('billing:recurring.enabled',      'Recurring billing (הוראת קבע)',                      'professional', NULL),
  ('billing:dunning.enabled',        'Failed payment handling and dunning',                'professional', NULL),
  -- delivery.gated: payment-gated file/gallery delivery — photographer vertical only.
  -- Essential photographers auto-include this from the base query (tier=essential + skin match).
  ('billing:delivery.gated',         'Payment-gated file and gallery delivery',            'essential',    'photographer'),

  -- ── Media ─────────────────────────────────────────────────────────────────
  ('media:portfolio.public',         'Public portfolio page for photographer clients',     'essential',    'photographer'),
  ('media:storage.extended',         'Extended cloud storage for high-res image delivery', 'essential',    'photographer'),

  -- ── Finance ───────────────────────────────────────────────────────────────
  ('finance:expenses.basic',         'Expense tracking and categorisation',                'essential',    NULL),
  ('finance:expenses.advanced',      'Advanced expense tracking with VAT recovery',        'professional', NULL),
  ('finance:reports.realtime',       'Real-time profit & loss dashboard',                  'professional', NULL),
  ('finance:reports.annual',         'Annual accountant report generation',                'professional', NULL),
  ('finance:threshold.radar',        'Threshold radar for עוסק פטור → מורשה',             'professional', NULL),
  ('finance:export.bkmv',            'BKMVDATA export for accounting systems',             'professional', NULL),

  -- ── Communications ────────────────────────────────────────────────────────
  ('comms:reminders.email',          'Automated email payment reminders',                  'essential',    NULL),
  ('comms:otp.whatsapp',             'WhatsApp OTP verification',                          'professional', NULL),
  ('comms:reminders.whatsapp',       'WhatsApp payment reminders',                         'professional', NULL),
  ('comms:documents.whatsapp',       'WhatsApp tax document delivery',                     'professional', NULL),
  ('comms:reminders.voice',          'Voice call reminders with Hebrew TTS',               'professional', NULL),

  -- ── UI / Admin ────────────────────────────────────────────────────────────
  ('ui:documents.queue',             'Failed document queue admin interface',               'professional', NULL),
  ('ui:pdfs.branded',                'Branded PDF invoice generation',                     'professional', NULL),
  ('ui:downloads.selfServe',         'Client self-service document downloads',             'professional', NULL),
  ('ui:onboarding.checklist',        'Tenant onboarding checklist',                        'professional', NULL),
  ('ui:payments.enhanced',           'Enhanced Stripe+Grow UX polish',                     'professional', NULL),
  ('ui:content.ai',                  'AI content generation tools',                        'professional', NULL),

  -- ── Vertical themes ───────────────────────────────────────────────────────
  -- skin_restriction = the vertical id that owns this theme.
  ('ui:theme.photographer',          'Photographer vertical theme',                        'essential',    'photographer'),
  ('ui:theme.beautician',            'Beautician vertical theme',                          'essential',    'beautician'),
  ('ui:theme.dance-studio',          'Dance studio vertical theme',                        'professional', 'dance-studio');

-- =============================================================================
-- STEP 7 — get_tenant_features() resolver
-- Returns the effective feature set for a tenant:
--   Base set  = feature_definitions where plan + skin qualify
--   Overrides = tenant_feature_overrides (add or revoke individual keys)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_tenant_features(p_tenant_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan           tenant_plan;
  v_skin           TEXT;
  v_status         TEXT;
  v_trial_ends_at  TIMESTAMPTZ;
  v_effective_plan tenant_plan;
BEGIN
  SELECT t.plan, t.skin, t.sub_status, t.trial_ends_at
    INTO v_plan, v_skin, v_status, v_trial_ends_at
  FROM tenants t
  WHERE t.id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- Trialing tenants get professional feature set regardless of plan
  IF v_status = 'trialing' AND (v_trial_ends_at IS NULL OR v_trial_ends_at > now()) THEN
    v_effective_plan := 'professional';
  ELSE
    v_effective_plan := v_plan;
  END IF;

  RETURN ARRAY(
    -- Base set from feature_definitions
    SELECT fd.key
    FROM   feature_definitions fd
    WHERE  fd.deprecated_at IS NULL
      -- Plan gate: professional gets all; essential gets essential-tier only
      AND (v_effective_plan = 'professional'
           OR (v_effective_plan = 'essential' AND fd.tier_minimum = 'essential'))
      -- Skin gate: NULL = all verticals; otherwise must match tenant skin
      AND (fd.skin_restriction IS NULL OR fd.skin_restriction = v_skin)
      -- Not explicitly disabled by an override
      AND NOT EXISTS (
        SELECT 1 FROM tenant_feature_overrides tfo
        WHERE  tfo.tenant_id   = p_tenant_id
          AND  tfo.feature_key = fd.key
          AND  tfo.is_enabled  = false
      )

    UNION

    -- Explicitly granted overrides (enables features outside the base tier/skin set)
    SELECT tfo.feature_key
    FROM   tenant_feature_overrides tfo
    WHERE  tfo.tenant_id  = p_tenant_id
      AND  tfo.is_enabled = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_features(UUID) TO authenticated, service_role;

-- =============================================================================
-- STEP 8 — provision_tenant (replaces 002400 version)
-- Drops the old signature (business_preset etc.) and creates the new one.
-- Callable by any authenticated user — supports both super-admin manual
-- provisioning and the self-service operator signup wizard.
-- p_owner_email is stored on the tenant for reference; the auth link uses auth.uid().
-- =============================================================================

-- Drop old signature from 002400 (different param types — cannot CREATE OR REPLACE)
DROP FUNCTION IF EXISTS provision_tenant(
  TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION provision_tenant(
  p_name        TEXT,
  p_subdomain   TEXT,
  p_plan        TEXT,   -- 'essential' | 'professional'
  p_vertical    TEXT,   -- verticals.id
  p_owner_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_subdomain TEXT;
BEGIN
  -- Callable by any authenticated user (wizard) or super_admin (manual provisioning).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;

  v_subdomain := lower(trim(p_subdomain));
  IF v_subdomain IS NULL OR v_subdomain = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;
  IF v_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Invalid subdomain format';
  END IF;
  IF NOT check_subdomain_available(v_subdomain) THEN
    RAISE EXCEPTION 'Subdomain already taken: %', v_subdomain;
  END IF;

  IF p_plan NOT IN ('essential', 'professional') THEN
    RAISE EXCEPTION 'p_plan must be ''essential'' or ''professional'', got: %', p_plan;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM verticals WHERE id = p_vertical AND is_active = true) THEN
    RAISE EXCEPTION 'Unknown or inactive vertical: %', p_vertical;
  END IF;

  INSERT INTO tenants (
    name, subdomain, plan, skin,
    language_default, country, currency, phone_region,
    vat_rate, prices_include_vat,
    from_email,
    payment_provider, invoicing_provider
  )
  VALUES (
    trim(p_name),
    v_subdomain,
    p_plan::tenant_plan,
    p_vertical,
    'he', 'IL', 'ILS', 'IL',
    0, true,
    NULLIF(trim(COALESCE(p_owner_email, '')), ''),
    'grow', 'grow'
  )
  RETURNING id INTO v_tenant_id;

  -- Link the calling user as tenant_admin.
  -- In the self-service wizard, auth.uid() IS the new operator filling the form.
  -- p_owner_email is stored on tenants.from_email for reference only.
  INSERT INTO user_profiles (id, tenant_id, role)
  VALUES (auth.uid(), v_tenant_id, ARRAY['tenant_admin'])
  ON CONFLICT (id) DO UPDATE SET
    tenant_id  = v_tenant_id,
    role       = ARRAY['tenant_admin'],
    updated_at = now();

  -- Seed default expense categories (all tenants)
  INSERT INTO expense_categories (tenant_id, name, description, is_vat_eligible, sort_order)
  SELECT
    v_tenant_id,
    category.name,
    category.description,
    category.is_vat_eligible,
    category.sort_order
  FROM (VALUES
    ('שכירות סטודיו',     'Studio rent',                    true,  1),
    ('שכר מורים',         'Teacher wages',                  false, 2),
    ('ציוד',              'Equipment and supplies',         true,  3),
    ('שיווק',             'Marketing and advertising',      true,  4),
    ('תוכנה ומנויים',     'Software subscriptions',         true,  5),
    ('ביטוח',             'Insurance',                      true,  6),
    ('חשמל ומים',         'Utilities',                      true,  7),
    ('שירותים מקצועיים',  'Accountant, lawyer, consultant', true,  8),
    ('אחר',               'Other',                          true,  9)
  ) AS category(name, description, is_vat_eligible, sort_order)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- STEP 9 — get_tenant_config_by_subdomain (replaces 001800 version)
-- Drops the old return type (business_preset etc.) and adds plan/skin/enabled_features.
-- =============================================================================
DROP FUNCTION IF EXISTS get_tenant_config_by_subdomain(TEXT);

CREATE OR REPLACE FUNCTION get_tenant_config_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                                UUID,
  name                              TEXT,
  tenant_subdomain                  TEXT,
  language_default                  TEXT,
  country                           TEXT,
  currency                          TEXT,
  vat_rate                          NUMERIC,
  prices_include_vat                BOOLEAN,
  primary_color                     TEXT,
  accent_color                      TEXT,
  plan                              tenant_plan,
  skin                              TEXT,
  labels                            JSONB,
  payment_provider                  TEXT,
  invoicing_provider                TEXT,
  payment_provider_public_key            TEXT,
  payment_provider_secret_configured     BOOLEAN,
  payment_provider_webhook_configured    BOOLEAN,
  payment_provider_updated_at            TIMESTAMPTZ,
  enabled_features                  TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.subdomain,
    t.language_default,
    t.country,
    t.currency,
    t.vat_rate,
    t.prices_include_vat,
    t.primary_color,
    t.accent_color,
    t.plan,
    t.skin,
    t.labels,
    t.payment_provider,
    t.invoicing_provider,
    t.payment_provider_public_key,
    (t.payment_provider_secret_enc  IS NOT NULL),
    (t.payment_provider_webhook_enc IS NOT NULL),
    t.payment_provider_updated_at,
    get_tenant_features(t.id)
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon, authenticated;

-- =============================================================================
-- STEP 10 — back-fill existing tenants (no-op on clean DB reset; safe to run)
-- Maps old business_preset to plan/skin for any pre-existing rows.
-- =============================================================================
UPDATE tenants SET
  plan = CASE business_preset
           WHEN 'programs' THEN 'professional'::tenant_plan
           ELSE 'essential'::tenant_plan
         END,
  skin = 'generic'
WHERE plan = 'essential'   -- default sentinel — not yet explicitly set
  AND skin = 'generic';    -- default sentinel

-- =============================================================================
-- VERIFICATION — run these after supabase db reset
-- =============================================================================
-- SELECT key, tier_minimum, skin_restriction FROM feature_definitions LIMIT 10;
-- SELECT id, display_name, plan_restriction FROM verticals;
-- SELECT plan, skin, sub_status FROM tenants LIMIT 3;
-- SELECT provision_tenant('Test Studio', 'teststudio', 'essential', 'photographer');
-- SELECT get_tenant_features('<tenant-id-from-above>');
-- SELECT id, plan, skin, enabled_features FROM get_tenant_config_by_subdomain('teststudio');

-- ── Native scheduling features (ex-03100) ──
INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction)
VALUES
  (
    'scheduling:calendar.view',
    'FullCalendar month/week timetable (offerings + sessions — read-only display)',
    'professional',
    NULL
  ),
  (
    'scheduling:booking.client',
    'Native client slot booking with checkout and invoicing',
    'essential',
    NULL
  ),
  (
    'scheduling:booking.admin',
    'Admin availability rules, slot templates, and booking management',
    'essential',
    NULL
  )
ON CONFLICT (key) DO NOTHING;

UPDATE feature_definitions
SET
  deprecated_at = now(),
  successor_key = 'scheduling:booking.client'
WHERE key = 'scheduling:appointments.calcom';

UPDATE feature_definitions
SET
  deprecated_at = now(),
  successor_key = NULL
WHERE key = 'scheduling:atoms.platform';

-- Preserve overrides from deprecated Cal.com key
UPDATE tenant_feature_overrides
SET feature_key = 'scheduling:booking.client'
WHERE feature_key = 'scheduling:appointments.calcom';

DELETE FROM tenant_feature_overrides
WHERE feature_key = 'scheduling:atoms.platform';


-- ── Google Calendar scheduling features (ex-03200) ──
INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction)
VALUES
  (
    'scheduling:integration.google_calendar',
    'Google Calendar OAuth — free/busy for availability, push confirmed bookings as events',
    'essential',
    NULL
  )
ON CONFLICT (key) DO NOTHING;

