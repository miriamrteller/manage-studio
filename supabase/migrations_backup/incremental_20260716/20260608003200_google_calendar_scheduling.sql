-- =============================================================================
-- 003200: Google Calendar integration for appointment booking
-- Native slot booking (003100) + Google Calendar API for availability sync and
-- event push. Cal.com remains deprecated; this is not a third-party booker.
-- DEPENDENCIES: 003100
-- =============================================================================

INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction)
VALUES
  (
    'scheduling:integration.google_calendar',
    'Google Calendar OAuth — free/busy for availability, push confirmed bookings as events',
    'essential',
    NULL
  )
ON CONFLICT (key) DO NOTHING;
