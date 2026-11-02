-- New studios start as an exempt dealer (osek patur): the most common case for a small studio.
-- The owner can change business status and business number any time in Settings -> Legal.
-- Only the column default changes; existing studios and the legal-profile RPCs are untouched.
ALTER TABLE tenants
  ALTER COLUMN legal_profile SET DEFAULT '{"business_status": "osek_patur"}'::jsonb;
