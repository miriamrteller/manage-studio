-- =============================================================================
-- 003100: Replace Cal.com feature flags with native scheduling
-- Cal.com integration removed from product direction — first-party slot booking.
-- Must run AFTER 003000 (which creates feature_definitions / tenant_feature_overrides).
-- DEPENDENCIES: 003000
-- =============================================================================

-- Insert the new definitions FIRST so successor_key references below resolve
-- (feature_definitions.successor_key is a self-FK to feature_definitions.key).
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
