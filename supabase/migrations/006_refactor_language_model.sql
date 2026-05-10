-- Migration 006: Refactor Language Model
-- Replace locale/dir redundancy with language + country sources of truth
-- dir and locale are computed in the application layer
-- DEPENDENCIES: Migrations 001-005 must be complete
-- BREAKING: Removes locale and dir columns; adds language and country

-- ============================================================================
-- TENANTS TABLE REFACTOR
-- ============================================================================
ALTER TABLE tenants DROP COLUMN locale;
ALTER TABLE tenants DROP COLUMN dir;

ALTER TABLE tenants
  ADD COLUMN language TEXT NOT NULL DEFAULT 'he'
    CHECK (language IN ('he', 'en')),
  ADD COLUMN country TEXT NOT NULL DEFAULT 'IL'
    CHECK (country IN ('IL', 'US'));

COMMENT ON COLUMN tenants.language IS 'Primary language for tenant. Source of truth for UI language. dir (rtl/ltr) is computed from this in the app.';
COMMENT ON COLUMN tenants.country IS 'Country for regional settings (VAT rate, currency, locale). Used with language to compute locale string (e.g., he-IL, en-US).';

-- ============================================================================
-- USER_PROFILES TABLE ENHANCEMENTS
-- ============================================================================
-- Add optional language + country overrides for individual users
ALTER TABLE user_profiles
  ADD COLUMN language TEXT
    CHECK (language IN ('he', 'en', NULL)),
  ADD COLUMN country TEXT
    CHECK (country IN ('IL', 'US', NULL));

COMMENT ON COLUMN user_profiles.language IS 'User''s language preference. NULL means use tenant default. Non-NULL overrides tenant.language.';
COMMENT ON COLUMN user_profiles.country IS 'User''s country preference. NULL means use tenant default. Non-NULL overrides tenant.country.';

-- Create indexes for future user preference lookups
CREATE INDEX idx_user_profiles_language ON user_profiles(language);
CREATE INDEX idx_user_profiles_country ON user_profiles(country);

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- After running this migration:
-- 1. Update seed.sql: replace locale/dir with language/country
-- 2. Update TypeScript types: TenantConfig schema
-- 3. Create language-helper.ts: compute dir + locale from language/country
-- 4. Update hooks: useTenant() and useCurrentUser() to use new columns
-- 5. Update components: apply computed dir to document.documentElement.dir
