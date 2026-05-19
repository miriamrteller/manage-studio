-- Update Script: Fix existing tenants table schema
-- Safe migration that alters without dropping data
-- Run this in Supabase SQL Editor

-- Step 1: Check current tenants table structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tenants' ORDER BY ordinal_position;

-- Step 2: Add missing columns if they don't exist
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS language_default TEXT NOT NULL DEFAULT 'he';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'IL';

-- Step 3: Drop the dir column if it exists (direction is computed in frontend from language)
ALTER TABLE tenants
  DROP COLUMN IF EXISTS dir;

-- Step 4: Migrate data from locale to language_default (if locale exists)
-- If your old schema had locale, extract just the language part
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'locale') THEN
    UPDATE tenants
    SET language_default = SPLIT_PART(locale, '-', 1)
    WHERE language_default IS NULL OR language_default = 'he';
  END IF;
END
$$;

-- Step 5: Drop the old locale column
ALTER TABLE tenants
  DROP COLUMN IF EXISTS locale;

-- Step 6: Verify the updated schema
SELECT 
  id, 
  name, 
  subdomain, 
  language_default, 
  country, 
  primary_color, 
  accent_color, 
  currency, 
  vat_rate 
FROM tenants 
LIMIT 1;

-- Step 7: Verify RLS policies exist
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'tenants';

-- Step 8: If "public read tenants" policy is missing, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenants' AND policyname = 'public read tenants'
  ) THEN
    CREATE POLICY "public read tenants" ON tenants FOR SELECT USING (true);
  END IF;
END
$$;

-- Done! You can now insert seed data
