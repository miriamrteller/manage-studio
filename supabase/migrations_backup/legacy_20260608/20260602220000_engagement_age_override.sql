-- Admin age override / parent age review metadata on engagements.

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS age_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_override_by UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS age_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS age_review_note TEXT,
  ADD COLUMN IF NOT EXISTS age_at_season_start INT CHECK (age_at_season_start >= 0);

COMMENT ON COLUMN engagements.age_override_at IS 'Set when a tenant admin overrides age eligibility.';
COMMENT ON COLUMN engagements.age_override_by IS 'Admin user_profiles.id that performed the age override.';
COMMENT ON COLUMN engagements.age_override_reason IS 'Optional note explaining the age override decision.';
COMMENT ON COLUMN engagements.age_review_note IS 'Optional parent note when requesting age exception review.';
COMMENT ON COLUMN engagements.age_at_season_start IS 'Snapshot age in whole years at season start when engagement was created.';
